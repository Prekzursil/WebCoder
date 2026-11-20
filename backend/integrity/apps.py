from django.apps import AppConfig


class IntegrityConfig(AppConfig):
    """Wave G integrity & safety (BACKLOG section H, items 113-119).

    Similarity scans, moderation audit + appeals, multi-account
    heuristics, the unified abuse queue with SLA.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "integrity"
