from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "verb", "actor", "read_at", "created_at")
    list_filter = ("verb",)
    search_fields = ("recipient__username", "actor__username")
