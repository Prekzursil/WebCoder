from django.contrib import admin

from .models import (
    AmaQuestion,
    AmaSession,
    AmaVote,
    CommunityAward,
    ProblemRequest,
    ProblemRequestVote,
)


@admin.register(CommunityAward)
class CommunityAwardAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "period", "created_at")
    list_filter = ("kind",)


@admin.register(AmaSession)
class AmaSessionAdmin(admin.ModelAdmin):
    list_display = ("host", "title", "starts_at", "ends_at")


@admin.register(AmaQuestion)
class AmaQuestionAdmin(admin.ModelAdmin):
    list_display = ("session", "author", "upvotes", "answered_at")


@admin.register(AmaVote)
class AmaVoteAdmin(admin.ModelAdmin):
    list_display = ("user", "question")


@admin.register(ProblemRequest)
class ProblemRequestAdmin(admin.ModelAdmin):
    list_display = ("title", "requester", "status", "vote_count")
    list_filter = ("status",)


@admin.register(ProblemRequestVote)
class ProblemRequestVoteAdmin(admin.ModelAdmin):
    list_display = ("user", "request")
