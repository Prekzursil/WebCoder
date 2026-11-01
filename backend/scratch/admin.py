from django.contrib import admin

from .models import ScratchRun


@admin.register(ScratchRun)
class ScratchRunAdmin(admin.ModelAdmin):
    """Audit view for scratch runs (X7): who ran what, when."""

    list_display = (
        "id",
        "user",
        "language",
        "status",
        "execution_time_ms",
        "created_at",
    )
    list_filter = ("status", "language")
    search_fields = ("user__username", "source_code")
    readonly_fields = (
        "user",
        "language",
        "source_code",
        "stdin_data",
        "stdout_data",
        "error_data",
        "status",
        "execution_time_ms",
        "memory_used_kb",
        "created_at",
    )
