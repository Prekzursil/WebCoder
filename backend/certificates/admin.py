from django.contrib import admin

from .models import Certificate


@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    """Read-mostly admin: atestats are derived, never hand-authored.

    Revocation (the only meaningful intervention) happens through the
    admin action or the revoke endpoint — both audited. Issuance stays
    out of the admin on purpose: a hand-written certificate would break
    the "leaderboard-derived" honesty guarantee.
    """

    list_display = ("serial", "kind", "user", "contest", "threshold", "status", "issued_at")
    list_filter = ("kind", "revoked_at")
    search_fields = ("serial", "user__username", "contest__title_i18n")
    readonly_fields = (
        "uuid",
        "serial",
        "user",
        "kind",
        "contest",
        "threshold",
        "details",
        "issued_at",
        "revoked_at",
    )
    actions = ["revoke_action"]

    @admin.action(description="Revoke selected certificates (integrity)")
    def revoke_action(self, request, queryset):
        from django.utils import timezone

        count = queryset.filter(revoked_at__isnull=True).update(
            revoked_at=timezone.now(),
            revoked_reason="revoked by admin action",
        )
        self.message_user(request, f"{count} certificate(s) revoked.")
