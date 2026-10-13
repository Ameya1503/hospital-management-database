from django.contrib import admin
from .models import Bill, Payment, PaymentWebhookEvent

admin.site.register((Bill, Payment, PaymentWebhookEvent))
