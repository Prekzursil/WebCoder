from django.contrib import admin

from .models import TranslationProposal


@admin.register(TranslationProposal)
class TranslationProposalAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "problem",
        "language",
        "status",
        "contributor",
        "reviewer",
        "ai_verdict",
        "created_at",
    )
    list_filter = ("status", "language", "ai_verdict")
    search_fields = (
        "title",
        "statement",
        "contributor__username",
        "problem__title_i18n",
    )
    readonly_fields = ("created_at", "updated_at", "reviewed_at")
