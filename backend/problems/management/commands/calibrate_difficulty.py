"""Recalibrate problem difficulty from real AC rates (roadmap CNT-3).

Author-assigned difficulty is a guess until attempts exist. Once a problem
has at least --min-tried submissions, recompute:

    acceptance = distinct AC users / total submissions

and map it to a band (>= 0.55 EASY, >= 0.25 MEDIUM, else HARD), setting
difficulty_source=CALIBRATED. RAT-4 ladder weights and RAT-7 tag bars then
consume trustworthy labels. Run periodically (celery beat or manually);
idempotent — re-running only changes labels when the band moves.
"""

from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from problems.models import Problem
from submissions.models import Submission

EASY_THRESHOLD = 0.55
MEDIUM_THRESHOLD = 0.25


def band_for(acceptance):
    if acceptance >= EASY_THRESHOLD:
        return Problem.DifficultyLevel.EASY
    if acceptance >= MEDIUM_THRESHOLD:
        return Problem.DifficultyLevel.MEDIUM
    return Problem.DifficultyLevel.HARD


class Command(BaseCommand):
    help = "Recalibrate APPROVED problem difficulty from acceptance rate (CNT-3)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--min-tried",
            type=int,
            default=10,
            help="Minimum submissions before a problem is recalibrated.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print planned changes without writing.",
        )

    def handle(self, *args, **options):
        min_tried = options["min_tried"]
        dry_run = options["dry_run"]
        changed = 0

        problems = (
            Problem.objects.filter(status=Problem.ProblemStatus.APPROVED)
            .annotate(
                tried=Count("submissions"),
                solved=Count(
                    "submissions",
                    filter=Q(submissions__verdict=Submission.VerdictStatus.ACCEPTED),
                    distinct=True,
                ),
            )
            .filter(tried__gte=min_tried)
        )

        for problem in problems:
            acceptance = problem.solved / problem.tried
            target = band_for(acceptance)
            if problem.difficulty == target:
                continue
            self.stdout.write(
                f"problem {problem.id} ({problem}): {problem.difficulty} -> "
                f"{target} (acceptance {acceptance:.2f}, n={problem.tried})"
            )
            if not dry_run:
                problem.difficulty = target
                problem.difficulty_source = Problem.DifficultySource.CALIBRATED
                problem.save(update_fields=["difficulty", "difficulty_source"])
            changed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"calibrate_difficulty: changed={changed}{' (dry run)' if dry_run else ''}"
            )
        )
