from django.contrib import admin

from .models import (
    Assignment,
    AssignmentProblem,
    AssignmentQuizItem,
    ClassMembership,
    ClassRoom,
    MCQItem,
    QuizSubmission,
    UploadedDeliverable,
)


@admin.register(ClassRoom)
class ClassRoomAdmin(admin.ModelAdmin):
    list_display = ("name", "teacher", "school", "is_open", "join_code", "created_at")
    search_fields = ("name", "teacher__username", "school")
    list_filter = ("is_open",)


@admin.register(ClassMembership)
class ClassMembershipAdmin(admin.ModelAdmin):
    list_display = ("classroom", "student", "joined_at")
    search_fields = ("classroom__name", "student__username")


class AssignmentProblemInline(admin.TabularInline):
    model = AssignmentProblem
    extra = 0


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = (
        "__str__",
        "classroom",
        "available_from",
        "due_at",
        "late_until",
        "is_exam",
    )
    search_fields = ("classroom__name",)
    list_filter = ("is_exam",)
    inlines = [AssignmentProblemInline]


@admin.register(MCQItem)
class MCQItemAdmin(admin.ModelAdmin):
    list_display = ("id", "grade", "discipline", "bac_year", "chapter", "author")
    list_filter = ("grade", "discipline", "bac_year")


@admin.register(AssignmentQuizItem)
class AssignmentQuizItemAdmin(admin.ModelAdmin):
    list_display = ("assignment", "item", "order")


@admin.register(QuizSubmission)
class QuizSubmissionAdmin(admin.ModelAdmin):
    list_display = ("assignment", "student", "score", "submitted_at")
    list_filter = ("assignment",)


@admin.register(UploadedDeliverable)
class UploadedDeliverableAdmin(admin.ModelAdmin):
    list_display = ("assignment", "student", "original_filename", "uploaded_at")
