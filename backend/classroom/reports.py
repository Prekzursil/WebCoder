"""Wave E classroom analytics + documents (items 41/42/43/44).

- :func:`effort_board` (item 43): rank students by EFFORT inside a
  class — total counted attempts and distinct active days across the
  class's assignments — the leaderboard that rewards grinding, not just
  acing (the mid-tier motivator pbinfo-style boards miss).
- :func:`failure_heatmap` (item 44): the students × problems matrix of
  failure intensity (0 = solved best, 1 = zero score, attempts counted)
  plus per-problem class failure rates — the teacher's at-a-glance
  "where the class hurts" view.
- :func:`exam_pdf` (item 41): the assignment's statements + per-problem
  points as one printable PDF (offline exams; reuses the dependency-free
  writer from problems.pdf_bundle).
- :func:`report_card_pdf` (item 42): a per-student parent report card —
  every assignment in the class with per-problem best scores, totals and
  late flags, rendered as PDF for the "catalog electronic" era parents
  actually read.
"""

from __future__ import annotations

from django.utils.translation import gettext_lazy as _

from problems.pdf_bundle import build_pdf

from .grid import assignment_grid


def _class_assignments(classroom):
    return list(classroom.assignments.order_by("-available_from"))


def effort_board(classroom) -> dict:
    """Item 43: per-student effort metrics across the class's teme."""
    from submissions.models import Submission

    assignments = _class_assignments(classroom)
    windows = [(a, a.available_from, a.effective_due_at) for a in assignments]
    members = list(
        classroom.memberships.select_related("student").order_by("student__username")
    )

    rows = []
    for member in members:
        student = member.student
        attempts = 0
        active_days: set[str] = set()
        solved = 0
        for assignment, start, end in windows:
            subs = Submission.objects.filter(
                user=student,
                problem__in=[
                    ap.problem_id for ap in assignment.assignment_problems.all()
                ],
                submission_time__gte=start,
                submission_time__lte=end,
            )
            attempts += subs.count()
            active_days.update(sub.submission_time.date().isoformat() for sub in subs)
            solved_problems = {
                sub.problem_id
                for sub in subs
                if sub.verdict == Submission.VerdictStatus.ACCEPTED
            }
            solved += len(solved_problems)
        rows.append(
            {
                "user_id": student.id,
                "username": student.username,
                "attempts": attempts,
                "active_days": len(active_days),
                "problems_solved": solved,
            }
        )
    # Effort order: attempts first, then active days, then solves.
    rows.sort(key=lambda r: (-r["attempts"], -r["active_days"], -r["problems_solved"]))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    return {"count": len(rows), "results": rows}


def failure_heatmap(classroom) -> dict:
    """Item 44: students × problems failure intensity per assignment."""
    out = []
    for assignment in _class_assignments(classroom)[:10]:
        grid = assignment_grid(assignment)
        students = grid["students"]
        problems = grid["problems"]
        cells = grid["cells"]
        matrix = []
        failure_by_problem: dict[int, list[float]] = {}
        for student in students:
            row = []
            for ap in problems:
                cell = cells.get((student.id, ap.problem_id))
                if cell is None:
                    intensity = None  # never attempted — distinct from failed
                else:
                    best = cell["best_score"] or 0
                    intensity = 1.0 - (best / ap.points if ap.points else 1.0)
                failure_by_problem.setdefault(ap.problem_id, []).append(
                    intensity if intensity is not None else 1.0
                )
                row.append(
                    {
                        "problem_id": ap.problem_id,
                        "intensity": round(intensity, 3)
                        if intensity is not None
                        else None,
                        "attempts": cell["attempts"] if cell else 0,
                        "verdict": cell["verdict"] if cell else None,
                    }
                )
            matrix.append(
                {"user_id": student.id, "username": student.username, "cells": row}
            )
        rates = [
            {
                "problem_id": ap.problem_id,
                "label": ap.label,
                "failure_rate": round(
                    sum(failure_by_problem.get(ap.problem_id, []))
                    / max(1, len(failure_by_problem.get(ap.problem_id, []))),
                    3,
                ),
            }
            for ap in problems
        ]
        out.append(
            {
                "assignment_id": assignment.id,
                "title_i18n": assignment.title_i18n,
                "problems": [
                    {
                        "problem_id": ap.problem_id,
                        "label": ap.label,
                        "points": ap.points,
                    }
                    for ap in problems
                ],
                "students": matrix,
                "failure_rates": rates,
            }
        )
    return {"count": len(out), "assignments": out}


def exam_pdf(assignment) -> bytes:
    """Item 41: statements + points, one printable PDF."""
    sections = []
    title = (
        (assignment.title_i18n or {}).get("ro")
        or (assignment.title_i18n or {}).get("en")
        or "Tema"
    )
    sections.append((str(_("Exam sheet")), title))
    for ap in assignment.assignment_problems.select_related("problem").order_by(
        "order", "id"
    ):
        problem = ap.problem
        statement = (
            (problem.statement_i18n or {}).get("ro")
            or (problem.statement_i18n or {}).get("en")
            or ""
        )
        heading = f"{ap.label}. {(problem.title_i18n or {}).get('ro') or (problem.title_i18n or {}).get('en', '')} ({ap.points}p)"
        sections.append((heading, statement))
    return build_pdf(sections)


def report_card_pdf(classroom, student) -> bytes:
    """Item 42: the parent report card across every tema in the class."""
    sections = []
    sections.append((str(_("Report card")), f"{classroom.name} — {student.username}"))
    for assignment in _class_assignments(classroom):
        grid = assignment_grid(assignment)
        cells = grid["cells"]
        title = (
            (assignment.title_i18n or {}).get("ro")
            or (assignment.title_i18n or {}).get("en")
            or ""
        )
        lines = []
        total = 0.0
        max_total = 0
        for ap in grid["problems"]:
            max_total += ap.points
            cell = cells.get((student.id, ap.problem_id))
            if cell is None:
                lines.append(f"{ap.label}: —")
                continue
            total += cell["best_score"] or 0
            late = " (intarziat)" if cell["late"] else ""
            lines.append(
                f"{ap.label}: {cell['best_score']:g}/{ap.points}p, {cell['attempts']} incercari{late}"
            )
        lines.append(f"Total: {total:g}/{max_total}p")
        sections.append((title, "\n".join(lines)))
    return build_pdf(sections)
