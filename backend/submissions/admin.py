from django.contrib import admin
from .models import Submission

class SubmissionAdmin(admin.ModelAdmin):
    list_display = (
        'id', 
        'user_link', 
        'problem_link', 
        'language', 
        'verdict', 
        'submission_time', 
        'score'
    )
    list_filter = ('verdict', 'language', 'problem', 'user')
    search_fields = ('user__username', 'problem__title_i18n', 'language', 'code')
    readonly_fields = (
        'submission_time', 
        # Potentially make most fields read-only once judged, 
        # or allow admins to override.
        # 'user', 'problem', 'language', 'code', 'verdict', 
        # 'execution_time_ms', 'memory_used_kb', 'score', 'detailed_feedback'
    )
    
    # For ForeignKey fields, provide links to their admin pages
    def user_link(self, obj):
        from django.urls import reverse
        from django.utils.html import format_html
        if obj.user:
            link = reverse("admin:users_user_change", args=[obj.user.id]) # Assumes app_label is 'users'
            return format_html('<a href="{}">{}</a>', link, obj.user.username)
        return "N/A"
    user_link.short_description = 'User'

    def problem_link(self, obj):
        from django.urls import reverse
        from django.utils.html import format_html
        if obj.problem:
            link = reverse("admin:problems_problem_change", args=[obj.problem.id]) # Assumes app_label is 'problems'
            # Display problem title (e.g., English) if available
            problem_title = obj.problem.title_i18n.get('en', f"ID: {obj.problem.id}") if isinstance(obj.problem.title_i18n, dict) else f"ID: {obj.problem.id}"
            return format_html('<a href="{}">{}</a>', link, problem_title)
        return "N/A"
    problem_link.short_description = 'Problem'

    fieldsets = (
        (None, {
            'fields': ('user', 'problem', 'language', 'submission_time')
        }),
        ('Source Code', {
            'classes': ('collapse',), # Optionally collapse this section
            'fields': ('code',)
        }),
        ('Judging Results', {
            'fields': ('verdict', 'execution_time_ms', 'memory_used_kb', 'score', 'detailed_feedback')
        }),
    )
    
    # To make all fields read-only in the change view (except for superusers perhaps)
    # def get_readonly_fields(self, request, obj=None):
    #     if obj: # obj is not None, so this is an existing object
    #         return self.readonly_fields + ('user', 'problem', 'language', 'code') # Add more fields to make read-only on change
    #     return self.readonly_fields

admin.site.register(Submission, SubmissionAdmin)
