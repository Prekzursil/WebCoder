"""Wave E item 45 — structured courses (Scratch→Python first).

A course is an ordered sequence of lessons; a lesson blends the surfaces
that already exist: a theory card (reading), optional drills (practice),
and one or more problems (the assignment — any problem, including block/
partial-code problems, because the lesson references problems and the
problem page already renders the right editor).

The first seeded course is the Scratch→Python bridge: read the concept,
drill it, then solve the corresponding starter-pack problem — the gentlest
possible on-ramp onto text code from the block editor.
"""

from __future__ import annotations

SEED_COURSES = [
    {
        "slug": "scratch-to-python",
        "en": "From blocks to Python",
        "ro": "De la blocuri la Python",
        "desc_en": "Six lessons that carry a block programmer to text code: the same ideas, now typed.",
        "desc_ro": "Șase lecțiuni care duc un programator cu blocuri la cod text: aceleași idei, acum tastate.",
        "lessons": [
            {
                "title_en": "Say hello (print)",
                "title_ro": "Salută (print)",
                "theory_tag": "implementation",
                "drill_kinds": ["READ_CODE"],
                "problem_slugs": ["hello-judge"],
            },
            {
                "title_en": "Read input",
                "title_ro": "Citește date",
                "theory_tag": "implementation",
                "drill_kinds": [],
                "problem_slugs": ["greet-friend", "sum-a-b"],
            },
            {
                "title_en": "Repeat yourself (loops)",
                "title_ro": "Repetă (bucle)",
                "theory_tag": "loops",
                "drill_kinds": ["READ_CODE", "COMPLEXITY"],
                "problem_slugs": ["count-to-n", "sum-1-to-n"],
            },
            {
                "title_en": "Keep many things (lists)",
                "title_ro": "Păstrează multe (liste)",
                "theory_tag": "arrays",
                "drill_kinds": [],
                "problem_slugs": ["max-in-array", "array-sum"],
            },
            {
                "title_en": "Put them in order (sorting)",
                "title_ro": "Pune-le în ordine (sortare)",
                "theory_tag": "sorting",
                "drill_kinds": ["COMPLEXITY"],
                "problem_slugs": ["sort-three", "array-sort"],
            },
            {
                "title_en": "Find fast (binary search)",
                "title_ro": "Caută rapid (căutare binară)",
                "theory_tag": "binary-search",
                "drill_kinds": ["COMPLEXITY"],
                "problem_slugs": ["binary-search"],
            },
        ],
    },
]


def seed_courses() -> tuple[int, int]:
    """Idempotent by course slug; returns (courses, lessons) created.

    Lesson content resolves against the starter pack (theory cards and
    drills from the learning seeds, problems by slug); a course created
    once keeps its lessons forever — later runs skip by slug.
    """
    from problems import seed_data
    from problems.models import Problem

    from .models import Course, Drill, Lesson, LessonDrill, TheoryCard

    by_slug = {p["slug"]: p for p in seed_data.PROBLEMS}
    titles_by_slug = {slug: entry["title_en"] for slug, entry in by_slug.items()}

    created_courses = created_lessons = 0
    for spec in SEED_COURSES:
        if Course.objects.filter(slug=spec["slug"]).exists():
            continue
        course = Course.objects.create(
            slug=spec["slug"],
            title_i18n={"en": spec["en"], "ro": spec["ro"]},
            description_i18n={"en": spec["desc_en"], "ro": spec["desc_ro"]},
            is_public=True,
        )
        created_courses += 1
        for order, lesson_spec in enumerate(spec["lessons"], start=1):
            theory = TheoryCard.objects.filter(
                tag__slug=lesson_spec["theory_tag"]
            ).first()
            lesson = Lesson.objects.create(
                course=course,
                order=order,
                title_i18n={
                    "en": lesson_spec["title_en"],
                    "ro": lesson_spec["title_ro"],
                },
                theory_card=theory,
            )
            created_lessons += 1
            for drill_order, kind in enumerate(lesson_spec["drill_kinds"], start=1):
                drill = Drill.objects.filter(kind=kind).first()
                if drill is not None:
                    LessonDrill.objects.create(
                        lesson=lesson, drill=drill, order=drill_order
                    )
            titles = [
                titles_by_slug[s]
                for s in lesson_spec["problem_slugs"]
                if s in titles_by_slug
            ]
            problems = Problem.objects.filter(title_i18n__en__in=titles)
            by_title = {p.title_i18n.get("en"): p for p in problems}
            for p_order, title in enumerate(titles, start=1):
                problem = by_title.get(title)
                if problem is not None:
                    lesson.problems.add(problem, through_defaults={"order": p_order})
    return created_courses, created_lessons
