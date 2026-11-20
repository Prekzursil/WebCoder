from django.contrib import admin

from .models import (
    Experiment,
    ExperimentAssignment,
    SearchQuery,
    SeasonReport,
    WebhookDelivery,
    WebhookEndpoint,
)


@admin.register(SearchQuery)
class SearchQueryAdmin(admin.ModelAdmin):
    list_display = ("query", "results_total", "user", "created_at")
    search_fields = ("query",)
    list_filter = ("created_at",)


@admin.register(WebhookEndpoint)
class WebhookEndpointAdmin(admin.ModelAdmin):
    list_display = ("url", "owner", "is_active", "created_at")
    search_fields = ("url", "owner__username")


@admin.register(WebhookDelivery)
class WebhookDeliveryAdmin(admin.ModelAdmin):
    list_display = ("event", "endpoint", "status_code", "delivered_at", "created_at")
    list_filter = ("event", "status_code")


@admin.register(Experiment)
class ExperimentAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")


@admin.register(ExperimentAssignment)
class ExperimentAssignmentAdmin(admin.ModelAdmin):
    list_display = ("experiment", "user", "variant", "assigned_at")


@admin.register(SeasonReport)
class SeasonReportAdmin(admin.ModelAdmin):
    list_display = ("season", "generated_at")
    readonly_fields = ("season", "markdown", "generated_at")
