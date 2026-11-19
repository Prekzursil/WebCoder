"""Analytics & insights models (wave G, BACKLOG section G).

- ``SearchQuery`` (item 110): every federated search logged with its
  result counts — the zero-results list is the content-gap signal.
- ``WebhookEndpoint`` / ``WebhookDelivery`` (item 107): HMAC-signed
  outbound webhooks (submission.judged, contest.finished, …) with a
  delivery log and best-effort retries.
- ``Experiment`` / ``ExperimentAssignment`` (item 109): deterministic
  hash-bucketed A/B experiments; assignment is stable per (experiment,
  user) and computable server-side for any surface.
- ``SeasonReport`` (item 112): the generated per-season (quarter)
  platform report — growth, activity, content and integrity numbers.
"""

from __future__ import annotations

import hashlib

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class SearchQuery(models.Model):
    """One federated-search invocation (item 110)."""

    query = models.CharField(_("query"), max_length=120)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="search_queries",
    )
    results_total = models.PositiveIntegerField(_("total results"), default=0)
    zero_result_kinds = models.JSONField(
        _("kinds that returned nothing"), default=list, blank=True
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("search query")
        verbose_name_plural = _("search queries")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["-created_at"])]

    def __str__(self):
        return f"search {self.query!r} ({self.results_total})"


class WebhookEndpoint(models.Model):
    """An outbound webhook registration (item 107)."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="webhook_endpoints",
    )
    url = models.URLField(_("target URL"), max_length=500)
    events = models.JSONField(
        _("subscribed events"),
        default=list,
        help_text=_("e.g. ['submission.judged', 'contest.finished']"),
    )
    secret = models.CharField(_("signing secret"), max_length=64)
    is_active = models.BooleanField(_("active"), default=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("webhook endpoint")
        verbose_name_plural = _("webhook endpoints")
        ordering = ["-created_at"]

    def __str__(self):
        return f"webhook {self.url} ({len(self.events)} events)"


class WebhookDelivery(models.Model):
    """One delivery attempt (item 107) — the audit trail + retry state."""

    endpoint = models.ForeignKey(
        WebhookEndpoint, on_delete=models.CASCADE, related_name="deliveries"
    )
    event = models.CharField(_("event name"), max_length=64)
    payload = models.JSONField(_("payload"), default=dict)
    status_code = models.PositiveIntegerField(_("HTTP status"), null=True, blank=True)
    error = models.TextField(_("transport error"), blank=True, default="")
    delivered_at = models.DateTimeField(_("delivered at"), null=True, blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("webhook delivery")
        verbose_name_plural = _("webhook deliveries")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event} -> {self.endpoint_id} ({self.status_code})"


class Experiment(models.Model):
    """An A/B experiment (item 109): name + active window + arm split."""

    name = models.SlugField(_("name"), max_length=64, unique=True)
    description = models.CharField(_("description"), max_length=255, blank=True)
    variants = models.JSONField(
        _("variant names"),
        default=list,
        help_text=_("e.g. ['control', 'treatment'] — first is control"),
    )
    is_active = models.BooleanField(_("active"), default=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("experiment")
        verbose_name_plural = _("experiments")
        ordering = ["-created_at"]

    def __str__(self):
        return f"experiment {self.name} ({len(self.variants)} arms)"

    def variant_for(self, user_id: int) -> str:
        """Deterministic assignment: sha256(name:user) % len(variants)."""
        if not self.variants:
            return ""
        digest = hashlib.sha256(f"{self.name}:{user_id}".encode()).hexdigest()
        return self.variants[int(digest, 16) % len(self.variants)]


class ExperimentAssignment(models.Model):
    """A persisted arm assignment (item 109) — the exposure log."""

    experiment = models.ForeignKey(
        Experiment, on_delete=models.CASCADE, related_name="assignments"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="experiment_assignments",
    )
    variant = models.CharField(_("variant"), max_length=64)
    assigned_at = models.DateTimeField(_("assigned at"), auto_now_add=True)

    class Meta:
        verbose_name = _("experiment assignment")
        verbose_name_plural = _("experiment assignments")
        constraints = [
            models.UniqueConstraint(
                fields=["experiment", "user"], name="uniq_experiment_user"
            )
        ]

    def __str__(self):
        return f"{self.experiment_id}:{self.user_id}={self.variant}"


class SeasonReport(models.Model):
    """A generated quarterly platform report (item 112)."""

    season = models.CharField(
        _("season"),
        max_length=6,
        unique=True,
        help_text=_("e.g. 2026Q4"),
    )
    markdown = models.TextField(_("report body (markdown)"))
    generated_at = models.DateTimeField(_("generated at"), auto_now_add=True)

    class Meta:
        verbose_name = _("season report")
        verbose_name_plural = _("season reports")
        ordering = ["-season"]

    def __str__(self):
        return f"season report {self.season}"
