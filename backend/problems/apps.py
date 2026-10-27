from django.apps import AppConfig
from django.db.models.signals import post_delete, post_save


class ProblemsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "problems"

    def ready(self):
        # Keep Problem.full_score in sync with its test cases (J6): the
        # cached denominator updates on every TestCase write/delete so the
        # UI shows "score / full_score" without recomputing per request.
        from .models import TestCase
        from .scoring import recompute_full_score

        post_save.connect(
            recompute_full_score, sender=TestCase, dispatch_uid="tc_full_score_save"
        )
        post_delete.connect(
            recompute_full_score, sender=TestCase, dispatch_uid="tc_full_score_delete"
        )
