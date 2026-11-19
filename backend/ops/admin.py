from django.contrib import admin

from .models import ErrorEvent


@admin.register(ErrorEvent)
class ErrorEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "status_code", "method", "path", "digest")
    list_filter = ("status_code",)
    search_fields = ("path", "message")
    date_hierarchy = "created_at"
