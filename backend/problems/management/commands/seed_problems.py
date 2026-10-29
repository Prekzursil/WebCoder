"""Seed the bilingual starter pack (ONB-1 / X4 + EDU-10 gimnaziu).

Creates (idempotently, matched on the English title):
- the curriculum taxonomy v1 tree (grades 9-10),
- the paradigm tags,
- ~19 classic + 10 gimnaziu (grades 5-8) beginner problems with RO/EN
  statements, progressive hints, real
  test data (first test is a visible sample) and difficulty_source=SEED,
- a few AFTER_AC editorials.

Safe to re-run: existing entries are left untouched. The seed author is a
dedicated CREATOR account so seeded content is attributable and removable.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from problems.models import (
    CurriculumNode,
    Problem,
    ProblemEditorial,
    Tag,
    TestCase,
)
from problems import seed_data
from users.models import User

SEED_AUTHOR_USERNAME = "seed_author"


def get_or_create_seed_author():
    author, _ = User.objects.get_or_create(
        username=SEED_AUTHOR_USERNAME,
        defaults={"role": User.Roles.PROBLEM_CREATOR, "is_active": True},
    )
    return author


class Command(BaseCommand):
    help = "Seed the bilingual starter pack (curriculum tree, tags, problems, editorials)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created without writing anything.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        created_problems = skipped = 0

        tags_by_slug = self._seed_tags(dry_run)
        nodes_by_slug = self._seed_curriculum(dry_run)
        author = get_or_create_seed_author()

        for entry in seed_data.PROBLEMS:
            if Problem.objects.filter(
                title_i18n__en=entry["title_en"]
            ).exists():
                skipped += 1
                continue
            problem = Problem(
                title_i18n={"en": entry["title_en"], "ro": entry["title_ro"]},
                statement_i18n={
                    "en": entry["statement_en"],
                    "ro": entry["statement_ro"],
                },
                author=author,
                status=Problem.ProblemStatus.APPROVED,
                verifier=author,
                difficulty=entry["difficulty"],
                difficulty_source=Problem.DifficultySource.SEED,
                # EDU-10: the gimnaziu ladder carries its segment facet so
                # the archive browse axis can filter grades 5-8.
                grade_group=entry.get("grade_group", ""),
                hints_en=entry["hints_en"],
                hints_ro=entry["hints_ro"],
            )
            if not dry_run:
                problem.save()
                problem.tags.set(
                    [tags_by_slug[slug] for slug in entry["tags"]]
                )
                problem.curriculum_nodes.set(
                    [nodes_by_slug[slug] for slug in entry["chapters"]]
                )
                for order, test in enumerate(entry["tests"]):
                    TestCase.objects.create(
                        problem=problem,
                        input_data=test["input"],
                        expected_output_data=test["expected"],
                        is_sample=test["sample"],
                        points=test["points"],
                        order=order,
                    )
                editorial = seed_data.EDITORIALS.get(entry["slug"])
                if editorial:
                    ProblemEditorial.objects.create(
                        problem=problem,
                        content_en=editorial["content_en"],
                        content_ro=editorial["content_ro"],
                        publish_policy=ProblemEditorial.PublishPolicy.AFTER_AC,
                        author=author,
                    )
            created_problems += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"seed_problems: created={created_problems} skipped(existing)={skipped}"
                f"{' (dry run)' if dry_run else ''}"
            )
        )

    def _seed_tags(self, dry_run):
        tags_by_slug = {}
        for tag_def in seed_data.TAGS:
            if dry_run:
                tags_by_slug[tag_def["slug"]] = None
                continue
            tag, _ = Tag.objects.get_or_create(
                slug=tag_def["slug"],
                defaults={"name_i18n": {"en": tag_def["en"], "ro": tag_def["ro"]}},
            )
            tags_by_slug[tag_def["slug"]] = tag
        return tags_by_slug

    def _seed_curriculum(self, dry_run):
        nodes_by_slug = {}
        for grade in seed_data.CURRICULUM:
            grade_node = self._node(grade, None, dry_run)
            nodes_by_slug[grade["slug"]] = grade_node
            for chapter in grade["children"]:
                nodes_by_slug[chapter["slug"]] = self._node(
                    chapter, grade_node, dry_run
                )
        return nodes_by_slug

    def _node(self, spec, parent, dry_run):
        if dry_run:
            return None
        node, _ = CurriculumNode.objects.get_or_create(
            slug=spec["slug"],
            defaults={
                "kind": spec["kind"],
                "name_i18n": {"en": spec["en"], "ro": spec["ro"]},
                "parent": parent,
                "order": spec["order"],
                "version": "v1",
            },
        )
        return node
