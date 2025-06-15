from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User

# Define a new User admin
class UserAdmin(BaseUserAdmin):
    # Add the 'role' field to the display and forms
    # You can customize list_display, fieldsets, add_fieldsets, etc.
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff', 'role')
    fieldsets = BaseUserAdmin.fieldsets + (
        (None, {'fields': ('role',)}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        (None, {'fields': ('role',)}),
    )
    list_filter = BaseUserAdmin.list_filter + ('role',)


# Register the new User admin.
admin.site.register(User, UserAdmin)
