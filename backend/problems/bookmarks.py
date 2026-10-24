"""Problem bookmarks (competitive roadmap UXP-6 / SPEC-GAPS Wave A).

A private per-user star list — the small high-utility addition that lets a
learner park problems for later. Public collections ride X12's ProblemList
model later (Wave B+); v1 is deliberately just the private list.
"""

from django.conf import settings
from django.db import models

from .models import Problem


class ProblemStar(models.Model):
    """One (user, problem) bookmark row."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="problem_stars",
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="stars",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "problem star"
        verbose_name_plural = "problem stars"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "problem"], name="unique_user_problem_star")
        ]

    def __str__(self):
        return f"user {self.user_id} starred problem {self.problem_id}"
