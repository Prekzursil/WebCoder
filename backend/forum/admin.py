from django.contrib import admin

from .models import Post, PostVote, Report, Thread


class PostInline(admin.TabularInline):
    model = Post
    extra = 0
    fields = ("author", "content", "is_hidden", "upvotes", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Thread)
class ThreadAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "problem", "is_pinned", "is_locked",
                    "is_hidden", "post_count", "last_activity")
    list_filter = ("is_pinned", "is_locked", "is_hidden")
    search_fields = ("title", "author__username")
    inlines = [PostInline]


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("thread", "author", "is_hidden", "is_edited", "upvotes",
                    "created_at")
    list_filter = ("is_hidden", "is_edited")
    search_fields = ("author__username", "content")


@admin.register(PostVote)
class PostVoteAdmin(admin.ModelAdmin):
    list_display = ("user", "post", "value", "created_at")
    list_filter = ("value",)


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("post", "reporter", "reason", "status", "resolved_by",
                    "created_at")
    list_filter = ("reason", "status")
    search_fields = ("reporter__username", "details")
