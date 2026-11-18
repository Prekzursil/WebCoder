from django.contrib import admin

from .models import GuestScratchRun, ScratchRun


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


@admin.register(GuestScratchRun)
class GuestScratchRunAdmin(admin.ModelAdmin):
    """Audit view for anonymous guest try-it runs (wave G item 89)."""

    list_display = ("id", "ip_hash", "language", "status", "created_at")
    list_filter = ("status", "language")
    search_fields = ("ip_hash", "source_code")
    readonly_fields = (
        "ip_hash",
        "language",
        "source_code",
        "stdout_data",
        "error_data",
        "status",
        "execution_time_ms",
        "memory_used_kb",
        "created_at",
    )
