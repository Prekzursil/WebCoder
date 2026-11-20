from django.core.management.base import BaseCommand

from certificates.teacher import seed_questions


class Command(BaseCommand):
    help = "Seed the teacher-certification exam question bank (idempotent)."

    def handle(self, *args, **options):
        created = seed_questions()
        self.stdout.write(f"teacher exam bank ready ({created} new questions)")
