from django.contrib.auth import authenticate
import base64
import hashlib
import hmac
import json
import secrets
from decimal import Decimal
from datetime import timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import password_validation
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, F, Q
from django.db.models.functions import ExtractHour
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.http import FileResponse, Http404

from accounts.models import OneTimeCode, User
from audit.models import AuditEvent
from billing.models import Bill, Payment, PaymentWebhookEvent
from clinical.models import MedicalAttachment, MedicalRecord, Medicine, Prescription, StockMovement
from hospital.models import Appointment, DoctorProfile, PatientProfile
from .permissions import IsDoctorOrReception, IsReceptionOrAdmin
from .serializers import AppointmentSerializer, BillSerializer, DoctorSerializer, EmailSerializer, MedicalAttachmentSerializer, MedicalRecordSerializer, MedicineSerializer, PasswordResetConfirmSerializer, PatientRegistrationSerializer, PatientSerializer, PaymentOrderSerializer, PaymentVerificationSerializer, PrescriptionWorkflowSerializer, TriageRequestSerializer, UserSerializer


def audit(request, action, patient_id=None, **details):
    actor = request.user if getattr(request.user, 'is_authenticated', False) else None
    AuditEvent.objects.create(actor=actor, action=action, patient_id=patient_id, details=details, ip_address=request.META.get('REMOTE_ADDR'))


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({'status': 'ok', 'service': 'pulse-hms-django'})


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    user = authenticate(request, username=request.data.get('email', '').lower(), password=request.data.get('password', ''))
    if not user or not user.is_active:
        return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': UserSerializer(user).data})


OTP_TTL = timedelta(minutes=10)
OTP_RETRY_DELAY = timedelta(minutes=1)
OTP_MAX_ATTEMPTS = 5


def issue_code(email, purpose):
    now = timezone.now()
    recent = OneTimeCode.objects.filter(email=email, purpose=purpose, created_at__gte=now - OTP_RETRY_DELAY).exists()
    if recent:
        return None, 'Please wait one minute before requesting another verification code.'
    OneTimeCode.objects.filter(email=email, purpose=purpose, used_at__isnull=True).update(used_at=now)
    code = f'{secrets.randbelow(1_000_000):06d}'
    OneTimeCode.objects.create(
        email=email, purpose=purpose, code_hash=make_password(code), expires_at=now + OTP_TTL,
    )
    return code, None


def consume_code(email, purpose, code):
    with transaction.atomic():
        entry = OneTimeCode.objects.select_for_update().filter(
            email=email, purpose=purpose, used_at__isnull=True,
        ).order_by('-created_at').first()
        if not entry or entry.expired or entry.attempts >= OTP_MAX_ATTEMPTS:
            return False
        if not check_password(code, entry.code_hash):
            entry.attempts = F('attempts') + 1
            entry.save(update_fields=('attempts',))
            return False
        entry.used_at = timezone.now()
        entry.save(update_fields=('used_at',))
        return True


@api_view(['POST'])
@permission_classes([AllowAny])
def request_patient_registration_code(request):
    serializer = EmailSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email'].lower()
    if User.objects.filter(email=email).exists():
        return Response({'detail': 'An account with this email already exists.'}, status=status.HTTP_409_CONFLICT)
    code, error = issue_code(email, OneTimeCode.Purpose.PATIENT_REGISTRATION)
    if error:
        return Response({'detail': error}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    send_mail('Pulse HMS verification code', f'Your verification code is {code}. It expires in 10 minutes.', settings.DEFAULT_FROM_EMAIL, [email])
    return Response({'detail': 'Verification code sent.'}, status=status.HTTP_202_ACCEPTED)


@api_view(['POST'])
@permission_classes([AllowAny])
def register_patient(request):
    serializer = PatientRegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    if not consume_code(data['email'], OneTimeCode.Purpose.PATIENT_REGISTRATION, data['code']):
        return Response({'code': 'Invalid, expired, or exhausted verification code.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        password_validation.validate_password(data['password'])
    except Exception as error:
        return Response({'password': list(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        user = User.objects.create_user(
            email=data['email'], password=data['password'], first_name=data['first_name'],
            last_name=data.get('last_name', ''), phone=data['phone'], role=User.Role.PATIENT,
        )
        patient = PatientProfile.objects.create(
            user=user, date_of_birth=data['date_of_birth'], gender=data['gender'], address=data['address'],
        )
        token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': UserSerializer(user).data, 'patient_id': patient.id}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def request_password_reset_code(request):
    serializer = EmailSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email'].lower()
    user = User.objects.filter(email=email, is_active=True).first()
    # This response intentionally does not reveal whether an account exists.
    if user:
        code, error = issue_code(email, OneTimeCode.Purpose.PASSWORD_RESET)
        if error:
            return Response({'detail': error}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        send_mail('Pulse HMS password reset code', f'Your password reset code is {code}. It expires in 10 minutes.', settings.DEFAULT_FROM_EMAIL, [email])
    return Response({'detail': 'If an active account exists, a reset code has been sent.'}, status=status.HTTP_202_ACCEPTED)


@api_view(['POST'])
@permission_classes([AllowAny])
def confirm_password_reset(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    email = data['email'].lower()
    if not consume_code(email, OneTimeCode.Purpose.PASSWORD_RESET, data['code']):
        return Response({'code': 'Invalid, expired, or exhausted verification code.'}, status=status.HTTP_400_BAD_REQUEST)
    user = User.objects.filter(email=email, is_active=True).first()
    if not user:
        return Response({'detail': 'Unable to reset this account.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        password_validation.validate_password(data['new_password'], user=user)
    except Exception as error:
        return Response({'new_password': list(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(data['new_password'])
    user.save(update_fields=('password',))
    Token.objects.filter(user=user).delete()
    audit(request, 'password.reset', user_id=user.id)
    return Response({'detail': 'Password reset successful. Please sign in again.'})


RAZORPAY_PROVIDER = 'razorpay'


def razorpay_hmac(message, secret):
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def mark_payment_captured(payment, payment_id, payload):
    """Locks the order, validates the trusted provider amount, then settles once."""
    payment = Payment.objects.select_for_update().select_related('bill').get(pk=payment.pk)
    expected_amount = int(payment.amount * Decimal('100'))
    received_amount = payload.get('amount')
    if received_amount != expected_amount:
        raise ValueError('Provider payment amount does not match the bill.')
    if payment.provider_payment_id and payment.provider_payment_id != payment_id:
        raise ValueError('Order is already associated with another payment.')
    payment.provider_payment_id = payment_id
    payment.verified_at = timezone.now()
    payment.raw_payload = payload
    payment.save(update_fields=('provider_payment_id', 'verified_at', 'raw_payload', 'updated_at'))
    bill = Bill.objects.select_for_update().get(pk=payment.bill_id)
    if bill.status != Bill.Status.PAID:
        bill.status = Bill.Status.PAID
        bill.paid_at = timezone.now()
        bill.save(update_fields=('status', 'paid_at', 'updated_at'))
    return payment


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_payment_order(request):
    if request.user.role != User.Role.PATIENT:
        return Response({'detail': 'Only patients may initiate payments.'}, status=status.HTTP_403_FORBIDDEN)
    serializer = PaymentOrderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        return Response({'detail': 'Payments are not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    try:
        bill = Bill.objects.get(pk=serializer.validated_data['bill_id'], patient__user=request.user)
    except Bill.DoesNotExist:
        raise Http404
    if bill.status != Bill.Status.PENDING:
        return Response({'detail': 'This bill is not payable.'}, status=status.HTTP_409_CONFLICT)

    payload = json.dumps({
        'amount': int(bill.amount * Decimal('100')), 'currency': 'INR',
        'receipt': f'pulse-hms-bill-{bill.id}-{uuid4().hex[:12]}',
    }).encode()
    credentials = base64.b64encode(f'{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}'.encode()).decode()
    provider_request = Request(
        'https://api.razorpay.com/v1/orders', data=payload, method='POST',
        headers={'Content-Type': 'application/json', 'Authorization': f'Basic {credentials}'},
    )
    try:
        with urlopen(provider_request, timeout=15) as provider_response:
            order = json.loads(provider_response.read())
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return Response({'detail': 'Unable to create a payment order. Please try again.'}, status=status.HTTP_502_BAD_GATEWAY)
    if not order.get('id') or order.get('amount') != int(bill.amount * Decimal('100')):
        return Response({'detail': 'Payment provider returned an invalid order.'}, status=status.HTTP_502_BAD_GATEWAY)
    payment = Payment.objects.create(
        bill=bill, provider=RAZORPAY_PROVIDER, provider_order_id=order['id'], amount=bill.amount, raw_payload=order,
    )
    audit(request, 'payment.order_created', bill.patient_id, bill_id=bill.id, payment_id=payment.id)
    return Response({'key_id': settings.RAZORPAY_KEY_ID, 'order': order, 'bill_id': bill.id})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_payment_checkout(request):
    if request.user.role != User.Role.PATIENT:
        return Response({'detail': 'Only patients may verify their payments.'}, status=status.HTTP_403_FORBIDDEN)
    serializer = PaymentVerificationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        payment = Payment.objects.select_related('bill').get(
            provider=RAZORPAY_PROVIDER, provider_order_id=data['razorpay_order_id'], bill__patient__user=request.user,
        )
    except Payment.DoesNotExist:
        return Response({'detail': 'Payment order was not found.'}, status=status.HTTP_404_NOT_FOUND)
    expected_signature = razorpay_hmac(
        f'{payment.provider_order_id}|{data["razorpay_payment_id"]}'.encode(), settings.RAZORPAY_KEY_SECRET,
    )
    if not settings.RAZORPAY_KEY_SECRET or not hmac.compare_digest(expected_signature, data['razorpay_signature']):
        return Response({'detail': 'Invalid payment signature.'}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment.pk)
        if payment.provider_payment_id and payment.provider_payment_id != data['razorpay_payment_id']:
            return Response({'detail': 'This payment order was already used.'}, status=status.HTTP_409_CONFLICT)
        payment.provider_payment_id = data['razorpay_payment_id']
        payment.verified_at = timezone.now()
        payment.save(update_fields=('provider_payment_id', 'verified_at', 'updated_at'))
    audit(request, 'payment.checkout_verified', payment.bill.patient_id, bill_id=payment.bill_id, payment_id=payment.id)
    return Response({'detail': 'Payment verified. Awaiting provider capture confirmation.', 'bill_id': payment.bill_id})


@api_view(['POST'])
@permission_classes([AllowAny])
def razorpay_webhook(request):
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        return Response({'detail': 'Webhook is not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    raw_body = request.body
    signature = request.headers.get('X-Razorpay-Signature', '')
    if not hmac.compare_digest(razorpay_hmac(raw_body, settings.RAZORPAY_WEBHOOK_SECRET), signature):
        return Response({'detail': 'Invalid webhook signature.'}, status=status.HTTP_400_BAD_REQUEST)
    event_id = request.headers.get('X-Razorpay-Event-Id', '')
    if not event_id:
        return Response({'detail': 'Missing provider event ID.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response({'detail': 'Invalid JSON body.'}, status=status.HTTP_400_BAD_REQUEST)
    event_type = payload.get('event', '')
    try:
        with transaction.atomic():
            event, created = PaymentWebhookEvent.objects.get_or_create(
                provider=RAZORPAY_PROVIDER, provider_event_id=event_id,
                defaults={'event_type': event_type, 'payload': payload},
            )
            if not created:
                return Response({'detail': 'Webhook already processed.'})
            if event_type == 'payment.captured':
                entity = payload.get('payload', {}).get('payment', {}).get('entity', {})
                payment = Payment.objects.select_for_update().get(
                    provider=RAZORPAY_PROVIDER, provider_order_id=entity.get('order_id'),
                )
                mark_payment_captured(payment, entity.get('id'), entity)
                AuditEvent.objects.create(action='payment.captured', patient_id=payment.bill.patient_id,
                                          details={'bill_id': payment.bill_id, 'payment_id': payment.id})
    except Payment.DoesNotExist:
        return Response({'detail': 'Payment order was not found.'}, status=status.HTTP_404_NOT_FOUND)
    except ValueError as error:
        return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': 'Webhook received.'})


def triage_fallback(doctors):
    doctor = doctors[0]
    return {
        'recommended_doctor_id': doctor.id,
        'recommended_doctor_name': doctor.user.get_full_name() or doctor.user.email,
        'specialty': doctor.specialization,
        'medical_terms': 'Patient-reported symptoms require clinical assessment.',
        'patient_friendly_explanation': 'A clinician will assess your symptoms during the appointment. Seek emergency care for severe or rapidly worsening symptoms.',
        'is_fallback': True,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def triage(request):
    if request.user.role not in {User.Role.PATIENT, User.Role.RECEPTIONIST, User.Role.ADMIN, User.Role.NURSE}:
        return Response({'detail': 'Patient or reception access is required.'}, status=status.HTTP_403_FORBIDDEN)
    serializer = TriageRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    doctors = list(DoctorProfile.objects.select_related('user').filter(id__in=serializer.validated_data['available_doctors']))
    if len(doctors) != len(serializer.validated_data['available_doctors']):
        return Response({'detail': 'One or more supplied doctors do not exist.'}, status=status.HTTP_400_BAD_REQUEST)
    doctors.sort(key=lambda doctor: serializer.validated_data['available_doctors'].index(doctor.id))
    fallback = triage_fallback(doctors)
    if not settings.GEMINI_API_KEY:
        return Response(fallback)

    choices = [
        {'id': doctor.id, 'name': doctor.user.get_full_name() or doctor.user.email, 'specialization': doctor.specialization}
        for doctor in doctors
    ]
    prompt = (
        'You are an appointment-routing assistant, not a diagnostician. Based only on the patient-reported symptoms, '
        'choose one doctor from this supplied list. Do not recommend emergency treatment or claim certainty. Return JSON only '
        'with: recommended_doctor_id (integer from the list), medical_terms (plain clinical-style symptom summary, <= 280 chars), '
        'and patient_friendly_explanation (one cautious sentence, <= 280 chars). '
        f'Symptoms: {serializer.validated_data["symptoms"]}\nDoctors: {json.dumps(choices)}'
    )
    gemini_payload = json.dumps({
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0.1},
    }).encode()
    try:
        provider_request = Request(
            f'https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}',
            data=gemini_payload, method='POST', headers={'Content-Type': 'application/json'},
        )
        with urlopen(provider_request, timeout=12) as provider_response:
            provider_result = json.loads(provider_response.read())
        text = provider_result['candidates'][0]['content']['parts'][0]['text'].strip().removeprefix('```json').removesuffix('```').strip()
        result = json.loads(text)
        doctor = next(doctor for doctor in doctors if doctor.id == result['recommended_doctor_id'])
        medical_terms = str(result['medical_terms']).strip()[:280]
        explanation = str(result['patient_friendly_explanation']).strip()[:280]
        if not medical_terms or not explanation:
            raise ValueError('Incomplete AI result.')
        result = {
            'recommended_doctor_id': doctor.id,
            'recommended_doctor_name': doctor.user.get_full_name() or doctor.user.email,
            'specialty': doctor.specialization,
            'medical_terms': medical_terms,
            'patient_friendly_explanation': explanation,
            'is_fallback': False,
        }
    except (HTTPError, URLError, TimeoutError, KeyError, IndexError, StopIteration, TypeError, ValueError, json.JSONDecodeError):
        result = fallback
    audit(request, 'triage.requested', doctor_id=None, recommended_doctor_id=result['recommended_doctor_id'], is_fallback=result['is_fallback'])
    return Response(result)


class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        if self.request.user.role not in {User.Role.PATIENT, User.Role.DOCTOR, User.Role.RECEPTIONIST, User.Role.ADMIN, User.Role.NURSE}:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Your role cannot manage appointments.')
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        queryset = Appointment.objects.select_related('patient__user', 'doctor__user').order_by('-starts_at')
        if user.role == User.Role.PATIENT:
            return queryset.filter(patient__user=user)
        if user.role == User.Role.DOCTOR:
            return queryset.filter(doctor__user=user)
        return queryset

    def perform_create(self, serializer):
        if self.request.user.role == User.Role.DOCTOR:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Doctors cannot create appointments.')
        try:
            with transaction.atomic():
                instance = serializer.save()
                audit(self.request, 'appointment.created', instance.patient_id, appointment_id=instance.id)
        except IntegrityError:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'starts_at': 'This doctor is already booked for that time.'})

    def perform_update(self, serializer):
        instance = self.get_object()
        if self.request.user.role == User.Role.PATIENT and serializer.validated_data.get('status', instance.status) != Appointment.Status.CANCELLED:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Patients may only cancel their appointments.')
        instance = serializer.save()
        audit(self.request, 'appointment.updated', instance.patient_id, appointment_id=instance.id)


class DoctorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DoctorProfile.objects.select_related('user', 'department').all()
    serializer_class = DoctorSerializer


class PatientViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PatientSerializer
    queryset = PatientProfile.objects.select_related('user').all()

    def get_queryset(self):
        if self.request.user.role == User.Role.PATIENT:
            return self.queryset.filter(user=self.request.user)
        if self.request.user.role in {User.Role.DOCTOR, User.Role.RECEPTIONIST, User.Role.ADMIN, User.Role.NURSE}:
            return self.queryset
        return self.queryset.none()

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        audit(request, 'patient.viewed', instance.id)
        return super().retrieve(request, *args, **kwargs)

    @action(detail=True, methods=['patch'], url_path='compliance')
    def update_compliance(self, request, pk=None):
        if request.user.role not in {User.Role.DOCTOR, User.Role.RECEPTIONIST, User.Role.ADMIN, User.Role.NURSE}:
            return Response({'detail': 'Clinical or reception access is required.'}, status=status.HTTP_403_FORBIDDEN)
        patient = self.get_object()
        try:
            score = int(request.data.get('score'))
        except (TypeError, ValueError):
            return Response({'detail': 'score must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if not 0 <= score <= 100:
            return Response({'detail': 'score must be between 0 and 100.'}, status=status.HTTP_400_BAD_REQUEST)
        patient.compliance_score = score
        patient.save(update_fields=('compliance_score', 'updated_at'))
        audit(request, 'patient.compliance_updated', patient.id, score=score)
        return Response(PatientSerializer(patient).data)


class MedicalRecordViewSet(viewsets.ModelViewSet):
    serializer_class = MedicalRecordSerializer

    def get_permissions(self):
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        queryset = MedicalRecord.objects.select_related('patient__user', 'doctor__user').prefetch_related('prescriptions').all()
        if user.role == User.Role.PATIENT:
            return queryset.filter(patient__user=user)
        if user.role == User.Role.DOCTOR:
            return queryset.filter(doctor__user=user)
        if user.role in {User.Role.RECEPTIONIST, User.Role.ADMIN, User.Role.NURSE}:
            patient_id = self.request.query_params.get('patient')
            return queryset.filter(patient_id=patient_id) if patient_id else queryset
        return queryset.none()

    def perform_create(self, serializer):
        if self.request.user.role != User.Role.DOCTOR or serializer.validated_data['doctor'].user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the attending doctor may create a medical record.')
        instance = serializer.save()
        audit(self.request, 'medical_record.created', instance.patient_id, record_id=instance.id)

    def perform_update(self, serializer):
        instance = self.get_object()
        if self.request.user.role != User.Role.DOCTOR or instance.doctor.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the attending doctor may edit a medical record.')
        instance = serializer.save()
        audit(self.request, 'medical_record.updated', instance.patient_id, record_id=instance.id)

    def perform_destroy(self, instance):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Medical records cannot be deleted through the API.')


class MedicineViewSet(viewsets.ModelViewSet):
    serializer_class = MedicineSerializer
    queryset = Medicine.objects.all()

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsDoctorOrReception()]
        return [IsReceptionOrAdmin()]


class BillViewSet(viewsets.ModelViewSet):
    serializer_class = BillSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Bill.objects.select_related('patient__user', 'appointment').all()
        if user.role == User.Role.PATIENT:
            return queryset.filter(patient__user=user)
        if user.role in {User.Role.RECEPTIONIST, User.Role.ADMIN}:
            return queryset
        return queryset.none()

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            if self.request.user.role not in {User.Role.PATIENT, User.Role.RECEPTIONIST, User.Role.ADMIN}:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Patient, reception, or admin access is required.')
            return [IsAuthenticated()]
        return [IsReceptionOrAdmin()]


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_prescription_workflow(request):
    if request.user.role != User.Role.DOCTOR:
        return Response({'detail': 'Only doctors may create prescriptions.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = PrescriptionWorkflowSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    doctor = DoctorProfile.objects.get(user=request.user)

    with transaction.atomic():
        appointment = data.get('appointment')
        if appointment:
            appointment = Appointment.objects.select_for_update().get(pk=appointment.pk)
            if appointment.doctor_id != doctor.id:
                return Response({'detail': 'Doctors may prescribe only for their own appointments.'}, status=status.HTTP_403_FORBIDDEN)

        record = MedicalRecord.objects.create(
            patient=data['patient'], doctor=doctor, appointment=appointment,
            visit_date=timezone.localdate(), diagnosis=data['diagnosis'],
            notes=data.get('notes', ''), treatment_plan=data.get('treatment_plan', ''),
            is_sensitive=data['is_sensitive'],
        )

        total = 0
        description = []
        for item in data.get('medicines', []):
            medicine = Medicine.objects.select_for_update().get(pk=item['medicine'].pk)
            quantity = item['quantity']
            prescription = Prescription.objects.create(
                record=record, medicine=medicine, dosage=item['dosage'], duration=item['duration'],
                instructions=item.get('instructions', ''), quantity=quantity,
            )
            if data['dispense_from_hospital']:
                if medicine.stock < quantity:
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError({'medicines': f'Insufficient stock for {medicine.name}.'})
                Medicine.objects.filter(pk=medicine.pk).update(stock=F('stock') - quantity)
                StockMovement.objects.create(
                    medicine=medicine, quantity_delta=-quantity, movement_type=StockMovement.MovementType.DISPENSE,
                    prescription=prescription, performed_by=request.user, reason=f'Dispensed for medical record {record.id}',
                )
                total += medicine.price * quantity
                description.append(f'{medicine.name} (x{quantity})')

        bill = None
        if data['dispense_from_hospital'] and total:
            bill = Bill.objects.create(
                patient=data['patient'], appointment=appointment, amount=total,
                description='Pharmacy medicines: ' + ', '.join(description),
            )
        audit(request, 'prescription.created', record.patient_id, record_id=record.id, bill_id=bill.id if bill else None)

    return Response({'record': MedicalRecordSerializer(record).data, 'bill': BillSerializer(bill).data if bill else None}, status=status.HTTP_201_CREATED)


ALLOWED_ATTACHMENT_TYPES = {'image/jpeg', 'image/png', 'application/pdf'}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


def can_access_record(user, record):
    if user.role == User.Role.ADMIN:
        return True
    if user.role == User.Role.PATIENT:
        return record.patient.user_id == user.id
    if user.role == User.Role.DOCTOR:
        return record.doctor.user_id == user.id
    return False


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_medical_attachment(request, record_id):
    if request.user.role != User.Role.DOCTOR:
        return Response({'detail': 'Only doctors may upload clinical attachments.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        record = MedicalRecord.objects.select_related('doctor__user').get(pk=record_id)
    except MedicalRecord.DoesNotExist:
        raise Http404
    if record.doctor.user_id != request.user.id:
        return Response({'detail': 'Only the attending doctor may upload to this record.'}, status=status.HTTP_403_FORBIDDEN)

    uploaded_file = request.FILES.get('file')
    if not uploaded_file:
        return Response({'file': 'Attach a file using the "file" field.'}, status=status.HTTP_400_BAD_REQUEST)
    if uploaded_file.content_type not in ALLOWED_ATTACHMENT_TYPES:
        return Response({'file': 'Only JPEG, PNG, and PDF files are allowed.'}, status=status.HTTP_400_BAD_REQUEST)
    if uploaded_file.size > MAX_ATTACHMENT_BYTES:
        return Response({'file': 'The maximum allowed file size is 10 MB.'}, status=status.HTTP_400_BAD_REQUEST)

    safe_suffix = Path(uploaded_file.name).suffix.lower()
    storage_key = f'clinical/{record.id}/{uuid4().hex}{safe_suffix}'
    stored_key = default_storage.save(storage_key, uploaded_file)
    try:
        attachment = MedicalAttachment.objects.create(
            record=record, storage_key=stored_key, content_type=uploaded_file.content_type,
            original_filename=Path(uploaded_file.name).name, size_bytes=uploaded_file.size,
            uploaded_by=request.user,
        )
    except Exception:
        default_storage.delete(stored_key)
        raise
    audit(request, 'medical_attachment.uploaded', record.patient_id, record_id=record.id, attachment_id=attachment.id)
    return Response(MedicalAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def download_medical_attachment(request, attachment_id):
    try:
        attachment = MedicalAttachment.objects.select_related('record__patient__user', 'record__doctor__user').get(pk=attachment_id)
    except MedicalAttachment.DoesNotExist:
        raise Http404
    if not can_access_record(request.user, attachment.record):
        return Response({'detail': 'You do not have permission to access this attachment.'}, status=status.HTTP_403_FORBIDDEN)
    audit(request, 'medical_attachment.downloaded', attachment.record.patient_id, record_id=attachment.record_id, attachment_id=attachment.id)
    try:
        if settings.AWS_STORAGE_BUCKET_NAME:
            return Response({'url': default_storage.url(attachment.storage_key)})
        return FileResponse(default_storage.open(attachment.storage_key, 'rb'), as_attachment=True, filename=attachment.original_filename, content_type=attachment.content_type)
    except FileNotFoundError:
        raise Http404


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reception_analytics(request):
    if request.user.role not in {User.Role.RECEPTIONIST, User.Role.ADMIN}:
        return Response({'detail': 'Reception or admin access is required.'}, status=status.HTTP_403_FORBIDDEN)
    busy_hours = list(
        Appointment.objects.exclude(status=Appointment.Status.CANCELLED)
        .annotate(hour_slot=ExtractHour('starts_at'))
        .values('hour_slot').annotate(count=Count('id')).order_by('hour_slot')
    )
    top_medicines = list(
        Medicine.objects.annotate(usage_count=Count('prescriptions'))
        .filter(usage_count__gt=0).order_by('-usage_count', 'name')[:5]
        .values('id', 'name', 'usage_count')
    )
    return Response({'busy_hours': busy_hours, 'top_medicines': top_medicines})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def doctor_analytics(request, doctor_id):
    if request.user.role not in {User.Role.DOCTOR, User.Role.RECEPTIONIST, User.Role.ADMIN}:
        return Response({'detail': 'Doctor, reception, or admin access is required.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        doctor = DoctorProfile.objects.get(pk=doctor_id)
    except DoctorProfile.DoesNotExist:
        raise Http404
    if request.user.role == User.Role.DOCTOR and doctor.user_id != request.user.id:
        return Response({'detail': 'Doctors may view only their own analytics.'}, status=status.HTTP_403_FORBIDDEN)
    appointments = Appointment.objects.filter(doctor=doctor)
    stats = appointments.aggregate(
        total_appointments=Count('id'),
        completed_appointments=Count('id', filter=Q(status=Appointment.Status.COMPLETED)),
        average_rating=Avg('doctor_rating'),
        total_ratings=Count('doctor_rating'),
    )
    upcoming = AppointmentSerializer(
        appointments.filter(status=Appointment.Status.SCHEDULED, starts_at__gte=timezone.now()).order_by('starts_at')[:5],
        many=True,
    ).data
    return Response({'stats': stats, 'upcoming_appointments': upcoming})
