"""Quiz grading + per-student shuffling (EDU-7/EDU-8).

Pure functions shared by the submit endpoint, the teacher stats and the
gradebook so auto-grading has exactly one implementation.
"""

import hashlib


def shuffle_order(assignment, student_id: int) -> list[int]:
    """Deterministic variant order for one student (0..3).

    Seeded from (assignment, student) so a page reload (or a second device)
    shows the same order — the shuffle is presentation-only; grading maps
    choices back through the SAME permutation, so correctness is invariant.
    """
    order = list(range(4))
    if not assignment.quiz_shuffle:
        return order
    seed = int(
        hashlib.sha256(f"{assignment.id}:{student_id}".encode()).hexdigest()[:8], 16
    )
    for i in range(len(order) - 1, 0, -1):
        seed = (seed * 1103515245 + 12345) % (2**31)
        j = seed % (i + 1)
        order[i], order[j] = order[j], order[i]
    return order


def grade_answers(assignment, student, answers: dict) -> dict:
    """Grade one answer sheet against the assignment's quiz items.

    ``answers`` maps MCQItem id (as str or int) -> chosen variant INDEX in
    the student's displayed (shuffled) order; the permutation is undone
    before comparing with ``correct_index``. Missing items count wrong.
    Returns the QuizSubmission field payload.
    """
    from .models import AssignmentQuizItem

    items = list(
        AssignmentQuizItem.objects.filter(assignment=assignment)
        .select_related("item")
        .order_by("order", "id")
    )
    total = len(items)
    correct = 0
    for link in items:
        raw = answers.get(str(link.item_id), answers.get(link.item_id))
        if raw is None:
            continue
        try:
            displayed = int(raw)
        except (TypeError, ValueError):
            continue
        order = shuffle_order(assignment, student.id)
        # The UI displays variants in `order` sequence; choice k is the
        # original variant order[k]. Unshuffle, then compare.
        if 0 <= displayed < 4:
            original = order[displayed]
            if original == link.item.correct_index:
                correct += 1
    score = (correct / total) if total else 0.0
    return {
        "answers": {str(k): v for k, v in answers.items()},
        "score": score,
        "correct_count": correct,
        "total_count": total,
    }


def item_stats(assignment) -> list[dict]:
    """Per-item correctness across every attempt (teacher statistics)."""
    from .models import AssignmentQuizItem, QuizSubmission

    items = list(
        AssignmentQuizItem.objects.filter(assignment=assignment)
        .select_related("item")
        .order_by("order", "id")
    )
    submissions = list(
        QuizSubmission.objects.filter(assignment=assignment).select_related("student")
    )
    stats = []
    for link in items:
        attempts = 0
        correct = 0
        for submission in submissions:
            raw = (submission.answers or {}).get(str(link.item_id))
            if raw is None:
                continue
            order = shuffle_order(assignment, submission.student_id)
            try:
                displayed = int(raw)
            except (TypeError, ValueError):
                continue
            if 0 <= displayed < 4 and order[displayed] == link.item.correct_index:
                correct += 1
            attempts += 1
        stats.append(
            {
                "item_id": link.item_id,
                "order": link.order,
                "question_i18n": link.item.question_i18n,
                "attempts": attempts,
                "correct": correct,
                "correct_rate": (correct / attempts) if attempts else None,
            }
        )
    return stats
