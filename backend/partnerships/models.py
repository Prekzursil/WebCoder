"""Item 147 (wave G section K) — school partnerships program.

A school applies via the public throttled endpoint; owners review the
queue in the admin surface and move requests through
PENDING → CONTACTED → ACTIVE / DECLINED. The public /schools page
explains the program (DPA, teacher tooling, onboarding) and links the
DPA template.
"""

from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class SchoolPartnershipRequest(models.Model):
    """One school's program application (staff-reviewed, never auto-approved)."""

    class Status(models.TextChoices):
        PENDING = "PENDING", _("pending review")
        CONTACTED = "CONTACTED", _("owner contacted the school")
        ACTIVE = "ACTIVE", _("partnership active")
        DECLINED = "DECLINED", _("declined")

    created_at = models.DateTimeField(_("created at"), default=timezone.now)
    school_name = models.CharField(_("school name"), max_length=200)
    city = models.CharField(_("city"), max_length=120)
    country = models.CharField(_("country"), max_length=120, default="Romania")
    contact_name = models.CharField(_("contact name"), max_length=120)
    contact_email = models.EmailField(_("contact email"))
    # Teachers estimate; drives the onboarding plan, nothing else.
    estimated_students = models.PositiveIntegerField(_("estimated students"), default=0)
    message = models.TextField(_("message"), blank=True)
    status = models.CharField(
        _("status"), max_length=16, choices=Status.choices, default=Status.PENDING
    )
    review_note = models.TextField(_("review note"), blank=True)

    class Meta:
        verbose_name = _("school partnership request")
        verbose_name_plural = _("school partnership requests")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.school_name} ({self.city}) — {self.status}"
