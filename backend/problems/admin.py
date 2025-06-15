from django.contrib import admin
from .models import Tag, Problem, TestCase

class TagAdmin(admin.ModelAdmin):
    list_display = ('id', 'name_i18n_display', 'slug')
    search_fields = ('name_i18n', 'slug')
    # prepopulated_fields = {'slug': ('name_i18n_display_for_slug',)} # Removed due to admin.E030

    def name_i18n_display(self, obj):
        if isinstance(obj.name_i18n, dict):
            return obj.name_i18n.get('en', obj.name_i18n.get('ro', 'N/A'))
        return 'N/A'
    name_i18n_display.short_description = 'Name (i18n)'
    
    # Removed name_i18n_display_for_slug method as it's not used by prepopulated_fields


class TestCaseInline(admin.TabularInline): # Or admin.StackedInline for a different layout
    model = TestCase
    extra = 1 # Number of empty forms to display
    fields = ('order', 'input_data', 'expected_output_data', 'is_sample', 'points')
    # For TextField, you might want to use a widget with smaller rows
    # from django.forms import Textarea
    # formfield_overrides = {
    #     models.TextField: {'widget': Textarea(attrs={'rows':4, 'cols':40})},
    # }

class ProblemAdmin(admin.ModelAdmin):
    list_display = ('id', 'title_i18n_display', 'author_display', 'status', 'difficulty', 'creation_date')
    list_filter = ('status', 'difficulty', 'author', 'tags')
    search_fields = ('title_i18n', 'statement_i18n', 'author__username')
    # raw_id_fields = ('author', 'verifier', 'tags') # Use for ForeignKey/ManyToManyField if dropdowns get too large
    filter_horizontal = ('tags',) # Better UI for ManyToManyField
    inlines = [TestCaseInline]
    
    fieldsets = (
        (None, {
            'fields': ('title_i18n', 'statement_i18n', 'author', 'status', 'difficulty')
        }),
        ('Details & Constraints', {
            'fields': ('default_time_limit_ms', 'default_memory_limit_kb', 'allowed_languages', 'custom_libraries_allowed', 
                       'comparison_mode', 'float_comparison_epsilon', 'tags')
        }),
        ('Custom Checker (Optional)', {
            'fields': ('checker_code', 'checker_language'),
            'classes': ('collapse',), # Collapse by default as it's optional
        }),
        ('Verification (Admin/Verifier only)', {
            'fields': ('verifier',),
            # 'classes': ('collapse',), # Optionally collapse this section
        }),
    )

    def title_i18n_display(self, obj):
        if isinstance(obj.title_i18n, dict):
            return obj.title_i18n.get('en', obj.title_i18n.get('ro', 'N/A'))
        return 'N/A'
    title_i18n_display.short_description = 'Title (i18n)'

    def author_display(self, obj):
        return obj.author.username if obj.author else 'N/A'
    author_display.short_description = 'Author'

    # When saving a problem, if author is not set, set it to current user
    def save_model(self, request, obj, form, change):
        if not obj.author_id: # If author is not set
            obj.author = request.user
        super().save_model(request, obj, form, change)

    # Customize queryset for admin to potentially show more fields or filter
    # def get_queryset(self, request):
    #     qs = super().get_queryset(request)
    #     return qs

# TestCase can also be registered separately if needed for direct management,
# but often managed inline with Problems.
# class TestCaseAdmin(admin.ModelAdmin):
#     list_display = ('id', 'problem_id_display', 'order', 'is_sample', 'points')
#     list_filter = ('problem', 'is_sample')
#     search_fields = ('problem__title_i18n', 'input_data', 'expected_output_data')

#     def problem_id_display(self, obj):
#         return obj.problem.id
#     problem_id_display.short_description = 'Problem ID'

admin.site.register(Tag, TagAdmin)
admin.site.register(Problem, ProblemAdmin)
# admin.site.register(TestCase, TestCaseAdmin) # Uncomment if standalone TestCase admin is desired
