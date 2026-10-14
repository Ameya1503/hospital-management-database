from rest_framework import serializers
from accounts.models import User
from billing.models import Bill
from clinical.models import MedicalAttachment, MedicalRecord, Medicine, Prescription
from hospital.models import Appointment, DoctorProfile, PatientProfile


class UserSerializer(serializers.ModelSerializer):
    profile_id = serializers.SerializerMethodField()
    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'role', 'phone', 'profile_id')

    def get_profile_id(self, obj):
        if obj.role == User.Role.PATIENT and hasattr(obj, 'patient_profile'):
            return obj.patient_profile.id
        if obj.role == User.Role.DOCTOR and hasattr(obj, 'doctor_profile'):
            return obj.doctor_profile.id
        return None


class PatientRegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20)
    date_of_birth = serializers.DateField()
    gender = serializers.ChoiceField(choices=PatientProfile.Gender.choices)
    address = serializers.CharField()
    code = serializers.CharField(min_length=6, max_length=6)

    def validate_email(self, email):
        email = email.lower()
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return email

    def validate_phone(self, phone):
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError('An account with this phone number already exists.')
        return phone


class EmailSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(write_only=True, min_length=8)


class PaymentOrderSerializer(serializers.Serializer):
    bill_id = serializers.IntegerField(min_value=1)


class PaymentVerificationSerializer(serializers.Serializer):
    razorpay_payment_id = serializers.CharField(max_length=255)
    razorpay_order_id = serializers.CharField(max_length=255)
    razorpay_signature = serializers.CharField(max_length=255)


class TriageRequestSerializer(serializers.Serializer):
    symptoms = serializers.CharField(min_length=3, max_length=2_000, trim_whitespace=True)
    # Kept compatible with the existing React client, which submits doctor objects.
    available_doctors = serializers.ListField(child=serializers.DictField(), min_length=1, max_length=50)

    def validate_available_doctors(self, doctors):
        doctor_ids = []
        for doctor in doctors:
            doctor_id = doctor.get('id', doctor.get('doctor_id'))
            if not isinstance(doctor_id, int) or isinstance(doctor_id, bool):
                raise serializers.ValidationError('Each doctor must include a numeric id.')
            doctor_ids.append(doctor_id)
        if len(set(doctor_ids)) != len(doctor_ids):
            raise serializers.ValidationError('Doctors must not be repeated.')
        return doctor_ids


class DoctorSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = DoctorProfile
        fields = ('id', 'name', 'email', 'specialization', 'department', 'rating')

    def get_name(self, obj):
        return obj.user.get_full_name() or obj.user.email


class PatientSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)

    class Meta:
        model = PatientProfile
        fields = ('id', 'name', 'email', 'phone', 'date_of_birth', 'gender', 'address', 'compliance_score')

    def get_name(self, obj):
        return obj.user.get_full_name() or obj.user.email


class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = ('id', 'patient', 'doctor', 'starts_at', 'status', 'is_emergency', 'symptoms_raw', 'symptoms_medical', 'notes', 'doctor_rating', 'created_at')
        read_only_fields = ('created_at',)

    def validate(self, attrs):
        request = self.context['request']
        if request.user.role == User.Role.PATIENT:
            patient = PatientProfile.objects.get(user=request.user)
            if attrs.get('patient', patient) != patient:
                raise serializers.ValidationError('Patients can create appointments only for themselves.')
        return attrs


class MedicineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medicine
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')


class PrescriptionSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)

    class Meta:
        model = Prescription
        fields = ('id', 'medicine', 'medicine_name', 'dosage', 'duration', 'instructions', 'quantity')


class PrescriptionItemInputSerializer(serializers.Serializer):
    medicine = serializers.PrimaryKeyRelatedField(queryset=Medicine.objects.all())
    dosage = serializers.CharField(max_length=100)
    duration = serializers.CharField(max_length=100)
    instructions = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, default=1)


class PrescriptionWorkflowSerializer(serializers.Serializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=PatientProfile.objects.all())
    appointment = serializers.PrimaryKeyRelatedField(queryset=Appointment.objects.all(), required=False, allow_null=True)
    diagnosis = serializers.CharField(max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True)
    treatment_plan = serializers.CharField(required=False, allow_blank=True)
    is_sensitive = serializers.BooleanField(default=False)
    dispense_from_hospital = serializers.BooleanField(default=False)
    medicines = PrescriptionItemInputSerializer(many=True, required=False)

    def validate(self, attrs):
        appointment = attrs.get('appointment')
        patient = attrs['patient']
        request = self.context['request']
        if appointment and appointment.patient_id != patient.id:
            raise serializers.ValidationError({'appointment': 'Appointment does not belong to the selected patient.'})
        if appointment and request.user.role == User.Role.DOCTOR and appointment.doctor.user_id != request.user.id:
            raise serializers.ValidationError({'appointment': 'Doctors may prescribe only for their own appointments.'})
        return attrs


class MedicalRecordSerializer(serializers.ModelSerializer):
    prescriptions = PrescriptionSerializer(many=True, read_only=True)

    class Meta:
        model = MedicalRecord
        fields = ('id', 'patient', 'doctor', 'appointment', 'visit_date', 'diagnosis', 'notes', 'treatment_plan', 'is_sensitive', 'prescriptions', 'created_at')
        read_only_fields = ('created_at',)


class MedicalAttachmentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = MedicalAttachment
        fields = ('id', 'original_filename', 'content_type', 'size_bytes', 'created_at', 'download_url')

    def get_download_url(self, obj):
        return f'/api/attachments/{obj.id}/download/'


class BillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bill
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'paid_at')
