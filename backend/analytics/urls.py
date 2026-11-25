from django.urls import path

from . import views

app_name = "analytics"

urlpatterns = [
    # Item 105 — org (school/county) dashboards.
    path("org/", views.OrgDashboardView.as_view(), name="org_dashboard"),
    # Item 111 — the signup→first-AC funnel.
    path("funnel/", views.FunnelDashboardView.as_view(), name="funnel_dashboard"),
    # Item 110 — search analytics.
    path("search/", views.SearchAnalyticsView.as_view(), name="search_analytics"),
    # Item 107 — webhooks.
    path("webhooks/", views.WebhookEndpointView.as_view(), name="webhooks"),
    path(
        "webhooks/<int:endpoint_id>/ping/",
        views.WebhookPingView.as_view(),
        name="webhook_ping",
    ),
    # Item 109 — A/B experiments.
    path(
        "experiments/<slug:name>/variant/",
        views.ExperimentVariantView.as_view(),
        name="experiment_variant",
    ),
    path(
        "experiments/<slug:name>/stats/",
        views.ExperimentStatsView.as_view(),
        name="experiment_stats",
    ),
    # Item 112 — season reports.
    path(
        "season-reports/",
        views.SeasonReportView.as_view(),
        name="season_reports",
    ),
]
