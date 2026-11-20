"""Item 138 (wave G section J) — seed the load-test virtual users.

Creates ``load01..loadNN`` (zero-padded) with the shared drill password,
idempotent by username. Used by the nightly prod-like e2e workflow and
by local OPR-4 drills before running tools/loadtest/replay.mjs.
"""

from django.core.management.base import BaseCommand

from users.models import User


class Command(BaseCommand):
    help = "Create the N synthetic load-test users (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=30)
        parser.add_argument("--prefix", type=str, default="load")
        parser.add_argument(
            "--password",
            type=str,
            default="LoadPass-2026!x",
            help="Shared password for every seeded user.",
        )

    def handle(self, *args, **options):
        count = options["count"]
        prefix = options["prefix"]
        created = 0
        for index in range(1, count + 1):
            username = f"{prefix}{index:02d}"
            user, was_created = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username}@loadtest.invalid"},
            )
            # Password is set unconditionally: re-runs converge to the
            # requested credential instead of leaving stale hashes.
            user.set_password(options["password"])
            user.save(update_fields=["password"])
            created += int(was_created)
        self.stdout.write(
            f"load users ready: {count} total, {created} created (prefix={prefix})"
        )
