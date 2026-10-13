from django.contrib import admin
from .models import Appointment, Department, DoctorProfile, PatientProfile

admin.site.register((Department, DoctorProfile, PatientProfile, Appointment))
