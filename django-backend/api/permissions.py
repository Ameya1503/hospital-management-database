from rest_framework.permissions import BasePermission
from accounts.models import User


class IsReceptionOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in {User.Role.RECEPTIONIST, User.Role.ADMIN}


class IsDoctorOrReception(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in {
            User.Role.DOCTOR, User.Role.RECEPTIONIST, User.Role.ADMIN, User.Role.NURSE
        }
