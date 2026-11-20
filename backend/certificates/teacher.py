"""Item 148 (wave G section K) — teacher certification exam.

A fixed multiple-choice exam over the classroom tooling and platform
policies (the "how do I run my class on WebCoder" knowledge a certified
teacher needs). Passing (≥ 80%) issues a TEACHER-kind certificate —
verified by the same public UUID verification page as every other
atestat.
"""

from django.utils import timezone

from .models import Certificate, TeacherCertAttempt, TeacherCertQuestion

#: Passing threshold (fraction).
PASS_THRESHOLD = 0.8


def active_questions():
    return list(TeacherCertQuestion.objects.filter(active=True).order_by("id"))


def grade_exam(user, answers: dict) -> dict:
    """Grade ``{question_id: chosen_index}``; issue the certificate on
    pass. Returns the attempt summary. Idempotent on the certificate
    side (_issue's get_or_create semantics)."""
    questions = active_questions()
    if not questions:
        return {"error": "exam not configured"}
    total = len(questions)
    correct = 0
    for question in questions:
        try:
            chosen = int(answers.get(str(question.pk), answers.get(question.pk, -1)))
        except (TypeError, ValueError):
            chosen = -1
        if chosen == question.correct_index:
            correct += 1
    score = correct / total
    passed = score >= PASS_THRESHOLD
    attempt = TeacherCertAttempt.objects.create(
        user=user, score=round(score, 4), passed=passed
    )
    certificate = None
    if passed:
        from .services import _issue

        certificate = _issue(
            user.id,
            Certificate.Kind.TEACHER,
            details={
                "exam_score": round(score, 4),
                "exam_questions": total,
                "passed_at": timezone.now().isoformat(),
            },
        )
    return {
        "attempt_id": attempt.pk,
        "correct": correct,
        "total": total,
        "score": round(score, 4),
        "passed": passed,
        # None when the certificate already existed (re-pass) — the
        # frontend links to /certificates either way.
        "certificate_uuid": str(certificate.uuid) if certificate else None,
    }


def seed_questions() -> int:
    """Idempotent seed of the 10-question bank (the management command
    and the nightly workflow both call this)."""
    bank = [
        (
            "What do students see when you publish a teme (assignment)?",
            [
                "Nothing until the school year ends",
                "The problems appear in their class feed with the deadline",
                "An email with the solutions attached",
            ],
            1,
        ),
        (
            "Can a student submit after a teme deadline passes?",
            [
                "Yes, unlimited late submissions with full credit",
                "Late submissions are marked late and capped by the teme policy",
                "No, the button disappears for everyone",
            ],
            1,
        ),
        (
            "What does exam mode do to a student's account?",
            [
                "Locks the site down to the exam teme for that student",
                "Grants access to all editorial solutions",
                "Raises their submission rate limits",
            ],
            0,
        ),
        (
            "How do you export class results for a report?",
            [
                "Screenshot the leaderboard",
                "The class export produces CSV per teme",
                "You cannot export results",
            ],
            1,
        ),
        (
            "A parent asks for their child's data (GDPR). What is the path?",
            [
                "The account settings' data export / deletion request flow",
                "There is no such path",
                "Only the school principal can request it",
            ],
            0,
        ),
        (
            "What is the AI-assistance policy for graded teme work?",
            [
                "Students must self-declare AI help; banned in rated rounds",
                "AI use is always allowed and undeclared",
                "AI use is always cheating",
            ],
            0,
        ),
        (
            "How are rated contests different from practice?",
            [
                "Rated contests affect the public rating ladder; practice never does",
                "Practice has tighter time limits",
                "There is no difference",
            ],
            0,
        ),
        (
            "A student's submission shows TLE. What does that mean?",
            [
                "The program printed too little output",
                "The program exceeded the time limit",
                "The program failed to compile",
            ],
            1,
        ),
        (
            "Who can see a student's private profile data?",
            [
                "Any teacher in any school",
                "Only the student (and guardians/school per policy); minors' profiles are protected",
                "All registered users",
            ],
            1,
        ),
        (
            "What should you do before a computer-science contest day?",
            [
                "Run the restore drill and check the status page",
                "Delete old submissions to make room",
                "Disable the judge to save resources",
            ],
            0,
        ),
    ]
    created = 0
    for text, choices, correct in bank:
        _, was_created = TeacherCertQuestion.objects.get_or_create(
            question=text,
            defaults={"choices": choices, "correct_index": correct, "active": True},
        )
        created += int(was_created)
    return created
