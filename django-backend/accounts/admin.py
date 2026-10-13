from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import OneTimeCode, User


@admin.register(User)
class HMSUserAdmin(UserAdmin):
    model = User
    list_display = ('email', 'first_name', 'last_name', 'role', 'is_active')
    ordering = ('email',)
    fieldsets = ((None, {'fields': ('email', 'password')}), ('Personal info', {'fields': ('first_name', 'last_name', 'phone')}), ('Hospital access', {'fields': ('role',)}), ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}), ('Important dates', {'fields': ('last_login', 'date_joined')}))
    add_fieldsets = ((None, {'classes': ('wide',), 'fields': ('email', 'password1', 'password2', 'role', 'phone')}),)
    list_filter = ('role', 'is_active', 'is_staff')


@admin.register(OneTimeCode)
class OneTimeCodeAdmin(admin.ModelAdmin):
    list_display = ('email', 'purpose', 'expires_at', 'attempts', 'used_at', 'created_at')
    readonly_fields = ('email', 'purpose', 'code_hash', 'expires_at', 'attempts', 'used_at', 'created_at')
    ordering = ('-created_at',)

    def has_add_permission(self, request):
        return False
