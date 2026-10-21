from django.contrib import admin

from .models import LeaderboardEntry


@admin.register(LeaderboardEntry)
class LeaderboardEntryAdmin(admin.ModelAdmin):
    list_display = ("user", "solved_count", "total_points", "last_solved_at", "updated_at")
    list_filter = ("solved_count",)
    search_fields = ("user__username",)
