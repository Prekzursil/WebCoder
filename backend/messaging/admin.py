from django.contrib import admin

from .models import Block, Conversation, Message, MessageReport


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "user1", "user2", "created_at", "updated_at")
    search_fields = ("user1__username", "user2__username")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "conversation",
        "sender",
        "is_flagged",
        "created_at",
        "read_at",
    )
    list_filter = ("is_flagged",)
    search_fields = ("sender__username", "body")


@admin.register(Block)
class BlockAdmin(admin.ModelAdmin):
    list_display = ("blocker", "blocked", "created_at")
    search_fields = ("blocker__username", "blocked__username")


@admin.register(MessageReport)
class MessageReportAdmin(admin.ModelAdmin):
    list_display = (
        "message",
        "reporter",
        "reason",
        "status",
        "resolved_by",
        "created_at",
    )
    list_filter = ("reason", "status")
    search_fields = ("reporter__username", "details")
