from django.db import models
from hospital.models import Appointment, PatientProfile, TimeStampedModel


class Bill(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PAID = 'paid', 'Paid'
        PARTIALLY_PAID = 'partially_paid', 'Partially paid'
        CANCELLED = 'cancelled', 'Cancelled'

    patient = models.ForeignKey(PatientProfile, on_delete=models.PROTECT, related_name='bills')
    appointment = models.ForeignKey(Appointment, on_delete=models.PROTECT, null=True, blank=True, related_name='bills')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    due_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=('patient', 'status')), models.Index(fields=('status', 'created_at'))]


class Payment(TimeStampedModel):
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name='payments')
    provider = models.CharField(max_length=30)
    provider_order_id = models.CharField(max_length=255, unique=True)
    provider_payment_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    verified_at = models.DateTimeField(null=True, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)


class PaymentWebhookEvent(models.Model):
    """Idempotency ledger for provider webhooks; never process an event twice."""
    provider = models.CharField(max_length=30)
    provider_event_id = models.CharField(max_length=255)
    event_type = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('provider', 'provider_event_id'),
                name='unique_provider_webhook_event',
            ),
        ]
