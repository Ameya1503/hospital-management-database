from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('An email address is required.')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.ADMIN)
        if not extra_fields.get('is_staff') or not extra_fields.get('is_superuser'):
            raise ValueError('A superuser must have is_staff=True and is_superuser=True.')
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        RECEPTIONIST = 'receptionist', 'Receptionist'
        DOCTOR = 'doctor', 'Doctor'
        PATIENT = 'patient', 'Patient'
        NURSE = 'nurse', 'Nurse'
        PHARMACIST = 'pharmacist', 'Pharmacist'

    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices)
    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []
    objects = UserManager()

    def __str__(self):
        return f'{self.email} ({self.role})'


class OneTimeCode(models.Model):
    class Purpose(models.TextChoices):
        PATIENT_REGISTRATION = 'patient_registration', 'Patient registration'
        PASSWORD_RESET = 'password_reset', 'Password reset'

    email = models.EmailField()
    purpose = models.CharField(max_length=30, choices=Purpose.choices)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=('email', 'purpose', 'expires_at'))]

    @property
    def expired(self):
        return self.expires_at <= timezone.now()
