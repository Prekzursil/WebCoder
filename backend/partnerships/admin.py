from django.contrib import admin

from .models import SchoolPartnershipRequest


@admin.register(SchoolPartnershipRequest)
class SchoolPartnershipRequestAdmin(admin.ModelAdmin):
    list_display = ("school_name", "city", "contact_email", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("school_name", "city", "contact_email")
    readonly_fields = ("created_at",)
