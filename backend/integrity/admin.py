from django.contrib import admin

from .models import Appeal, ModerationAction, SimilarityFlag


@admin.register(SimilarityFlag)
class SimilarityFlagAdmin(admin.ModelAdmin):
    list_display = (
        "kind",
        "submission",
        "other_submission",
        "score",
        "status",
        "created_at",
    )
    list_filter = ("kind", "status")


@admin.register(ModerationAction)
class ModerationActionAdmin(admin.ModelAdmin):
    list_display = ("moderator", "action", "target_user", "created_at")
    list_filter = ("action",)
    search_fields = ("moderator__username", "target_user__username")
    readonly_fields = [f.name for f in ModerationAction._meta.fields]


@admin.register(Appeal)
class AppealAdmin(admin.ModelAdmin):
    list_display = ("appellant", "action", "status", "created_at", "decided_at")
    list_filter = ("status",)
