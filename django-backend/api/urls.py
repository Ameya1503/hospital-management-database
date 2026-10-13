from django.urls import include, path
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('appointments', views.AppointmentViewSet, basename='appointment')
router.register('doctors', views.DoctorViewSet, basename='doctor')
router.register('patients', views.PatientViewSet, basename='patient')
router.register('records', views.MedicalRecordViewSet, basename='medical-record')
router.register('medicines', views.MedicineViewSet, basename='medicine')
router.register('bills', views.BillViewSet, basename='bill')

urlpatterns = [
    path('health/', views.health),
    path('auth/login/', views.login),
    path('auth/patients/request-code/', views.request_patient_registration_code),
    path('auth/patients/register/', views.register_patient),
    path('auth/password-reset/request/', views.request_password_reset_code),
    path('auth/password-reset/confirm/', views.confirm_password_reset),
    path('payments/orders/', views.create_payment_order),
    path('payments/verify/', views.verify_payment_checkout),
    path('payments/razorpay/webhook/', views.razorpay_webhook),
    path('triage/', views.triage),
    path('prescriptions/', views.create_prescription_workflow),
    path('records/<int:record_id>/attachments/', views.upload_medical_attachment),
    path('attachments/<int:attachment_id>/download/', views.download_medical_attachment),
    path('analytics/reception/', views.reception_analytics),
    path('doctors/<int:doctor_id>/analytics/', views.doctor_analytics),
    path('', include(router.urls)),
]
