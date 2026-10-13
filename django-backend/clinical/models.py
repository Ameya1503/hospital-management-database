from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from hospital.models import Appointment, DoctorProfile, PatientProfile, TimeStampedModel


class Medicine(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    medicine_type = models.CharField(max_length=50)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.PositiveIntegerField(default=0)
    minimum_stock_level = models.PositiveIntegerField(default=10)
    manufacturer = models.CharField(max_length=100, blank=True)
    expiry_date = models.DateField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=('name',)), models.Index(fields=('stock',))]

    def __str__(self):
        return self.name


class MedicalRecord(TimeStampedModel):
    patient = models.ForeignKey(PatientProfile, on_delete=models.PROTECT, related_name='medical_records')
    doctor = models.ForeignKey(DoctorProfile, on_delete=models.PROTECT, related_name='medical_records')
    appointment = models.OneToOneField(Appointment, on_delete=models.PROTECT, related_name='medical_record', null=True, blank=True)
    visit_date = models.DateField()
    diagnosis = models.CharField(max_length=255)
    notes = models.TextField(blank=True)
    treatment_plan = models.TextField(blank=True)
    is_sensitive = models.BooleanField(default=False)

    class Meta:
        indexes = [models.Index(fields=('patient', 'visit_date')), models.Index(fields=('doctor', 'visit_date'))]


class MedicalAttachment(TimeStampedModel):
    record = models.ForeignKey(MedicalRecord, on_delete=models.CASCADE, related_name='attachments')
    storage_key = models.CharField(max_length=500)
    content_type = models.CharField(max_length=100)
    original_filename = models.CharField(max_length=255)
    size_bytes = models.PositiveBigIntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)


class Prescription(TimeStampedModel):
    record = models.ForeignKey(MedicalRecord, on_delete=models.CASCADE, related_name='prescriptions')
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name='prescriptions')
    dosage = models.CharField(max_length=100)
    duration = models.CharField(max_length=100)
    instructions = models.TextField(blank=True)
    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])


class StockMovement(TimeStampedModel):
    class MovementType(models.TextChoices):
        RESTOCK = 'restock', 'Restock'
        DISPENSE = 'dispense', 'Dispense'
        ADJUSTMENT = 'adjustment', 'Adjustment'

    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name='stock_movements')
    quantity_delta = models.IntegerField()
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    prescription = models.ForeignKey(Prescription, on_delete=models.PROTECT, null=True, blank=True, related_name='stock_movements')
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.CharField(max_length=255, blank=True)
