from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class ScratchRun(models.Model):
    """Audit log for custom-invocation runs (competitive roadmap X7/JDG-6).

    A scratch run is not a submission: it executes user code on user-supplied
    input with fixed modest limits and returns the raw output. The row is
    the abuse-audit trail (who ran what) — the throttle is the real DoS
    guard, this is the record.
    """

    class Status(models.TextChoices):
        OK = "OK", _("OK")
        COMPILE_ERROR = "COMPILE_ERROR", _("Compile error")
        RUNTIME_ERROR = "RUNTIME_ERROR", _("Runtime error")
        TIMEOUT = "TIMEOUT", _("Timeout")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="scratch_runs",
        verbose_name=_("user"),
    )
    language = models.CharField(_("language"), max_length=20)
    source_code = models.TextField(_("source code"))
    stdin_data = models.TextField(_("stdin data"), blank=True, default="")
    stdout_data = models.TextField(_("stdout data"), blank=True, default="")
    error_data = models.TextField(_("error data"), blank=True, default="")
    status = models.CharField(
        _("status"), max_length=16, choices=Status.choices, default=Status.OK
    )
    execution_time_ms = models.IntegerField(_("execution time (ms)"), default=-1)
    memory_used_kb = models.IntegerField(_("memory used (KB)"), default=-1)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("scratch run")
        verbose_name_plural = _("scratch runs")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self):
        return f"ScratchRun {self.id} by {self.user_id} ({self.language})"
