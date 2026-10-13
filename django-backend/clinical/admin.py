from django.contrib import admin
from .models import MedicalAttachment, MedicalRecord, Medicine, Prescription, StockMovement

admin.site.register((Medicine, MedicalRecord, MedicalAttachment, Prescription, StockMovement))
