from django.contrib import admin

from .models import RatingHistory, UserRating


@admin.register(UserRating)
class UserRatingAdmin(admin.ModelAdmin):
    list_display = ("user", "rating", "rd", "contests_count", "last_competition_at")
    ordering = ("-rating",)


@admin.register(RatingHistory)
class RatingHistoryAdmin(admin.ModelAdmin):
    list_display = ("user", "contest", "rank", "rating", "delta")
    list_filter = ("contest",)
