from datetime import timedelta
import hashlib
import hmac
import json
import shutil
import tempfile
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from billing.models import Bill, Payment, PaymentWebhookEvent
from clinical.models import MedicalAttachment, MedicalRecord, Medicine, Prescription, StockMovement
from hospital.models import Appointment, Department, DoctorProfile, PatientProfile


@override_settings(SECURE_SSL_REDIRECT=False)
class ApiAccessTests(APITestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()
        self.patient_user = User.objects.create_user(
            email='patient@example.test', password='patient-password', role=User.Role.PATIENT
        )
        self.other_patient_user = User.objects.create_user(
            email='other@example.test', password='other-password', role=User.Role.PATIENT
        )
        self.doctor_user = User.objects.create_user(
            email='doctor@example.test', password='doctor-password', role=User.Role.DOCTOR
        )
        department = Department.objects.create(name='General Medicine')
        self.patient = PatientProfile.objects.create(
            user=self.patient_user, date_of_birth='1990-01-01', gender='M', address='Pune'
        )
        self.other_patient = PatientProfile.objects.create(
            user=self.other_patient_user, date_of_birth='1991-01-01', gender='F', address='Mumbai'
        )
        self.doctor = DoctorProfile.objects.create(
            user=self.doctor_user, department=department, specialization='Physician', registration_number='REG-001'
        )

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def test_login_returns_token_and_role(self):
        response = self.client.post('/api/auth/login/', {'email': self.patient_user.email, 'password': 'patient-password'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user']['role'], User.Role.PATIENT)
        self.assertTrue(response.data['token'])

    def test_patient_cannot_create_an_appointment_for_another_patient(self):
        self.client.force_authenticate(self.patient_user)
        response = self.client.post('/api/appointments/', {
            'patient': self.other_patient.id,
            'doctor': self.doctor.id,
            'starts_at': (timezone.now() + timedelta(days=1)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Appointment.objects.count(), 0)

    def test_patient_sees_only_their_appointments(self):
        Appointment.objects.create(patient=self.patient, doctor=self.doctor, starts_at=timezone.now() + timedelta(days=1))
        Appointment.objects.create(patient=self.other_patient, doctor=self.doctor, starts_at=timezone.now() + timedelta(days=2))
        self.client.force_authenticate(self.patient_user)
        response = self.client.get('/api/appointments/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)

    def test_doctor_prescription_dispenses_stock_and_creates_bill_atomically(self):
        medicine = Medicine.objects.create(name='Paracetamol', medicine_type='Tablet', price='10.00', stock=5)
        appointment = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, starts_at=timezone.now() + timedelta(days=1)
        )
        self.client.force_authenticate(self.doctor_user)
        response = self.client.post('/api/prescriptions/', {
            'patient': self.patient.id,
            'appointment': appointment.id,
            'diagnosis': 'Viral fever',
            'dispense_from_hospital': True,
            'medicines': [{'medicine': medicine.id, 'dosage': '500mg', 'duration': '3 days', 'quantity': 2}],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        medicine.refresh_from_db()
        self.assertEqual(medicine.stock, 3)
        self.assertEqual(MedicalRecord.objects.count(), 1)
        self.assertEqual(Prescription.objects.count(), 1)
        self.assertEqual(StockMovement.objects.count(), 1)
        self.assertEqual(Bill.objects.get().amount, 20)

    def test_insufficient_stock_rolls_back_prescription_workflow(self):
        medicine = Medicine.objects.create(name='Amoxicillin', medicine_type='Capsule', price='25.00', stock=1)
        self.client.force_authenticate(self.doctor_user)
        response = self.client.post('/api/prescriptions/', {
            'patient': self.patient.id,
            'diagnosis': 'Infection',
            'dispense_from_hospital': True,
            'medicines': [{'medicine': medicine.id, 'dosage': '250mg', 'duration': '5 days', 'quantity': 2}],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        medicine.refresh_from_db()
        self.assertEqual(medicine.stock, 1)
        self.assertEqual(MedicalRecord.objects.count(), 0)
        self.assertEqual(Bill.objects.count(), 0)

    def test_doctor_uploads_attachment_and_owning_patient_can_download(self):
        record = MedicalRecord.objects.create(
            patient=self.patient, doctor=self.doctor, visit_date=timezone.localdate(), diagnosis='Migraine'
        )
        uploaded = SimpleUploadedFile('scan.pdf', b'%PDF-1.4 test attachment', content_type='application/pdf')
        self.client.force_authenticate(self.doctor_user)
        response = self.client.post(f'/api/records/{record.id}/attachments/', {'file': uploaded}, format='multipart')
        self.assertEqual(response.status_code, 201)
        attachment = MedicalAttachment.objects.get()
        self.assertEqual(attachment.original_filename, 'scan.pdf')

        self.client.force_authenticate(self.patient_user)
        response = self.client.get(f'/api/attachments/{attachment.id}/download/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')

    def test_other_patient_cannot_download_attachment(self):
        record = MedicalRecord.objects.create(
            patient=self.patient, doctor=self.doctor, visit_date=timezone.localdate(), diagnosis='Migraine'
        )
        attachment = MedicalAttachment.objects.create(
            record=record, storage_key='missing.pdf', content_type='application/pdf',
            original_filename='scan.pdf', size_bytes=1, uploaded_by=self.doctor_user,
        )
        self.client.force_authenticate(self.other_patient_user)
        response = self.client.get(f'/api/attachments/{attachment.id}/download/')
        self.assertEqual(response.status_code, 403)

    def test_doctor_can_view_only_own_analytics(self):
        Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, starts_at=timezone.now() + timedelta(days=1),
            status=Appointment.Status.COMPLETED, doctor_rating=5,
        )
        self.client.force_authenticate(self.doctor_user)
        response = self.client.get(f'/api/doctors/{self.doctor.id}/analytics/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['stats']['total_appointments'], 1)
        self.assertEqual(response.data['stats']['completed_appointments'], 1)

    @patch('api.views.send_mail')
    def test_patient_registration_uses_one_time_code(self, send_mail):
        response = self.client.post('/api/auth/patients/request-code/', {'email': 'newpatient@example.test'}, format='json')
        self.assertEqual(response.status_code, 202)
        sent_code = send_mail.call_args.args[1].split(' is ')[1].split('.')[0]
        response = self.client.post('/api/auth/patients/register/', {
            'email': 'newpatient@example.test', 'password': 'Safe-password-123!',
            'first_name': 'New', 'last_name': 'Patient', 'phone': '9999999999',
            'date_of_birth': '1995-03-20', 'gender': 'F', 'address': 'Pune', 'code': sent_code,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.get(email='newpatient@example.test').role, User.Role.PATIENT)
        self.assertTrue(PatientProfile.objects.filter(user__email='newpatient@example.test').exists())

    @patch('api.views.send_mail')
    def test_password_reset_changes_password_and_revokes_existing_tokens(self, send_mail):
        Token = __import__('rest_framework.authtoken.models', fromlist=['Token']).Token
        Token.objects.create(user=self.patient_user)
        response = self.client.post('/api/auth/password-reset/request/', {'email': self.patient_user.email}, format='json')
        self.assertEqual(response.status_code, 202)
        sent_code = send_mail.call_args.args[1].split(' is ')[1].split('.')[0]
        response = self.client.post('/api/auth/password-reset/confirm/', {
            'email': self.patient_user.email, 'code': sent_code, 'new_password': 'Changed-password-123!',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.patient_user.refresh_from_db()
        self.assertTrue(self.patient_user.check_password('Changed-password-123!'))
        self.assertFalse(Token.objects.filter(user=self.patient_user).exists())

    def test_payment_order_is_unavailable_without_provider_credentials(self):
        bill = Bill.objects.create(patient=self.patient, amount='125.00', description='Consultation')
        self.client.force_authenticate(self.patient_user)
        response = self.client.post('/api/payments/orders/', {'bill_id': bill.id}, format='json')
        self.assertEqual(response.status_code, 503)

    @override_settings(RAZORPAY_WEBHOOK_SECRET='webhook-secret')
    def test_captured_webhook_settles_bill_once(self):
        bill = Bill.objects.create(patient=self.patient, amount='125.00', description='Consultation')
        payment = Payment.objects.create(
            bill=bill, provider='razorpay', provider_order_id='order_test_123', amount='125.00',
        )
        payload = {
            'event': 'payment.captured',
            'payload': {'payment': {'entity': {
                'id': 'pay_test_123', 'order_id': payment.provider_order_id, 'amount': 12500,
            }}},
        }
        body = json.dumps(payload).encode()
        signature = hmac.new(b'webhook-secret', body, hashlib.sha256).hexdigest()
        response = self.client.post(
            '/api/payments/razorpay/webhook/', body, content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=signature, HTTP_X_RAZORPAY_EVENT_ID='event_test_123',
        )
        self.assertEqual(response.status_code, 200)
        bill.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(bill.status, Bill.Status.PAID)
        self.assertEqual(payment.provider_payment_id, 'pay_test_123')
        duplicate = self.client.post(
            '/api/payments/razorpay/webhook/', body, content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=signature, HTTP_X_RAZORPAY_EVENT_ID='event_test_123',
        )
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(PaymentWebhookEvent.objects.count(), 1)

    @override_settings(RAZORPAY_WEBHOOK_SECRET='webhook-secret')
    def test_webhook_with_bad_signature_is_rejected(self):
        response = self.client.post(
            '/api/payments/razorpay/webhook/', b'{"event":"payment.captured"}', content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE='bad', HTTP_X_RAZORPAY_EVENT_ID='event_invalid',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(PaymentWebhookEvent.objects.count(), 0)

    @override_settings(GEMINI_API_KEY='')
    def test_triage_uses_database_doctor_and_safe_fallback_without_ai_key(self):
        self.client.force_authenticate(self.patient_user)
        response = self.client.post('/api/triage/', {
            'symptoms': 'Headache and nausea for one day',
            # Names/specialties here are deliberately untrusted and must not be returned.
            'available_doctors': [{'doctor_id': self.doctor.id, 'name': 'Untrusted name'}],
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['recommended_doctor_id'], self.doctor.id)
        self.assertEqual(response.data['recommended_doctor_name'], self.doctor_user.email)
        self.assertTrue(response.data['is_fallback'])

    def test_patient_cannot_edit_a_medical_record(self):
        record = MedicalRecord.objects.create(
            patient=self.patient, doctor=self.doctor, visit_date=timezone.localdate(), diagnosis='Initial diagnosis',
        )
        self.client.force_authenticate(self.patient_user)
        response = self.client.patch(f'/api/records/{record.id}/', {'diagnosis': 'Tampered'}, format='json')
        self.assertEqual(response.status_code, 403)
        record.refresh_from_db()
        self.assertEqual(record.diagnosis, 'Initial diagnosis')

    def test_doctor_cannot_list_bills(self):
        Bill.objects.create(patient=self.patient, amount='125.00')
        self.client.force_authenticate(self.doctor_user)
        response = self.client.get('/api/bills/')
        self.assertEqual(response.status_code, 403)
