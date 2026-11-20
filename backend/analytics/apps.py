from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    """Wave G analytics & insights (BACKLOG section G, items 105-112).

    Owner-facing product analytics: search logs, org dashboards, funnel
    snapshots, webhooks, A/B experiments, season reports.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "analytics"
