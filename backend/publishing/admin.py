from django.contrib import admin

from .models import BlogPost, WaHelpAnswer, WaHelpRequest, WikiPage, WikiRevision


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "status", "lang", "created_at")
    list_filter = ("status", "lang")


@admin.register(WikiPage)
class WikiPageAdmin(admin.ModelAdmin):
    list_display = ("slug", "title_ro", "updated_at")


@admin.register(WikiRevision)
class WikiRevisionAdmin(admin.ModelAdmin):
    list_display = ("page", "editor", "note", "created_at")


@admin.register(WaHelpRequest)
class WaHelpRequestAdmin(admin.ModelAdmin):
    list_display = ("asker", "status", "created_at")
    list_filter = ("status",)


@admin.register(WaHelpAnswer)
class WaHelpAnswerAdmin(admin.ModelAdmin):
    list_display = ("request", "author", "is_accepted", "created_at")
