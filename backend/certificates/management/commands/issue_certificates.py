"""Backfill/audit command for Wave D atestats (idempotent).

Run once when the feature deploys (derives every historical rated-contest
participation, rating milestone and solve milestone), and after any manual
data surgery that bypassed the event hooks. Safe to run repeatedly —
issuance is get_or_create under per-kind uniqueness.

Usage:
    python manage.py issue_certificates            # derive, no notifications
    python manage.py issue_certificates --notify   # also notify holders
"""

from django.core.management.base import BaseCommand

from certificates.services import backfill


class Command(BaseCommand):
    help = "Idempotently derive contest/rating/solve atestats from history."

    def add_arguments(self, parser):
        parser.add_argument(
            "--notify",
            action="store_true",
            help="Notify newly-certified holders (off by default: replaying "
            "history must never spam).",
        )

    def handle(self, *args, **options):
        counts = backfill(notify_users=options["notify"])
        total = sum(counts.values())
        for key, value in counts.items():
            self.stdout.write(f"{key}: {value} issued")
        self.stdout.write(
            self.style.SUCCESS(
                f"done — {total} new certificate(s); existing rows untouched"
            )
        )
