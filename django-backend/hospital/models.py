from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Department(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class DoctorProfile(TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='doctor_profile')
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name='doctors')
    specialization = models.CharField(max_length=100)
    registration_number = models.CharField(max_length=100, unique=True)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)

    def __str__(self):
        return f'Dr. {self.user.get_full_name() or self.user.email}'


class PatientProfile(TimeStampedModel):
    class Gender(models.TextChoices):
        MALE = 'M', 'Male'
        FEMALE = 'F', 'Female'
        OTHER = 'O', 'Other'

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='patient_profile')
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=1, choices=Gender.choices)
    address = models.TextField()
    compliance_score = models.PositiveSmallIntegerField(default=100, validators=[MinValueValidator(0), MaxValueValidator(100)])

    def __str__(self):
        return self.user.get_full_name() or self.user.email


class Appointment(TimeStampedModel):
    class Status(models.TextChoices):
        SCHEDULED = 'scheduled', 'Scheduled'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'
        NO_SHOW = 'no_show', 'No show'
        RESCHEDULED = 'rescheduled', 'Rescheduled'

    patient = models.ForeignKey(PatientProfile, on_delete=models.PROTECT, related_name='appointments')
    doctor = models.ForeignKey(DoctorProfile, on_delete=models.PROTECT, related_name='appointments')
    starts_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    is_emergency = models.BooleanField(default=False)
    symptoms_raw = models.TextField(blank=True)
    symptoms_medical = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    doctor_rating = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])

    class Meta:
        constraints = [models.UniqueConstraint(fields=('doctor', 'starts_at'), name='unique_doctor_appointment_slot')]
        indexes = [models.Index(fields=('doctor', 'starts_at')), models.Index(fields=('patient', 'starts_at')), models.Index(fields=('status',))]

    def __str__(self):
        return f'{self.patient} with {self.doctor} at {self.starts_at}'
