from django.contrib import admin

from .models import Assignment, AssignmentProblem, ClassMembership, ClassRoom


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
    list_display = ("__str__", "classroom", "available_from", "due_at", "late_until", "is_exam")
    search_fields = ("classroom__name",)
    list_filter = ("is_exam",)
    inlines = [AssignmentProblemInline]
