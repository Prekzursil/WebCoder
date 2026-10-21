import os
from django.core.management.base import BaseCommand
from users.models import User


class Command(BaseCommand):
    help = "Creates or updates a superuser from environment variables."

    def handle(self, *args, **options):
        username = os.environ.get("ADMIN_USER")
        email = os.environ.get("ADMIN_EMAIL")
        password = os.environ.get("ADMIN_PASS")

        if not all([username, email, password]):
            self.stdout.write(
                self.style.ERROR(
                    "ADMIN_USER, ADMIN_EMAIL, and ADMIN_PASS environment variables are required."
                )
            )
            return

        if not User.objects.filter(username=username).exists():
            User.objects.create_superuser(
                username, email, password, role=User.Roles.ADMIN
            )
            self.stdout.write(
                self.style.SUCCESS(f'Successfully created superuser "{username}"')
            )
        else:
            self.stdout.write(self.style.WARNING(f'User "{username}" already exists.'))
            user = User.objects.get(username=username)
            user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            # Live-stack proof (2026-10-21): a superuser whose role stayed the
            # BASIC default was permission-DENIED creating problems — DRF
            # permission classes check User.role, not just is_superuser
            # (users/permissions.py IsProblemCreator). Re-assert the ADMIN
            # role on every re-run so existing seeds are healed too.
            user.role = User.Roles.ADMIN
            user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f'Successfully updated password and permissions for "{username}"'
                )
            )
