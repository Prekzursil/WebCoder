from django.contrib import admin

from .models import Contest, ContestParticipation, ContestProblem, ContestScore


@admin.register(Contest)
class ContestAdmin(admin.ModelAdmin):
    list_display = ("id", "title_i18n", "format", "visibility", "start_at", "end_at", "is_rated")
    list_filter = ("format", "visibility", "is_rated", "is_window")


@admin.register(ContestProblem)
class ContestProblemAdmin(admin.ModelAdmin):
    list_display = ("contest", "label", "problem", "order", "points")


@admin.register(ContestParticipation)
class ContestParticipationAdmin(admin.ModelAdmin):
    list_display = ("contest", "user", "virtual_start", "is_disqualified")
    list_filter = ("contest", "is_disqualified")


@admin.register(ContestScore)
class ContestScoreAdmin(admin.ModelAdmin):
    list_display = ("participation", "contest_problem", "best_score", "attempts")
