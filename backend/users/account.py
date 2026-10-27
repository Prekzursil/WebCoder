"""GDPR account control (competitive roadmap round-2 LEG-1 / SPEC-GAPS X5).

- ``POST /users/me/export/``  — machine-readable dump of everything the
  platform stores about the requester (profile + submissions + forum
  activity + scratch runs + ratings).
- ``POST /users/me/delete/``  — soft delete: the account is deactivated and
  PII (username/email) anonymized immediately; user-authored side content
  (scratch runs, ratings, votes) is purged after ``PURGE_DELAY_DAYS`` by the
  ``purge_deleted_users`` beat task. Submissions and leaderboard rows are
  deliberately retained with the anonymized identity — deleting them would
  corrupt public judge history and standings (the roadmap's COM-7
  display-right model); the retention decision is recorded in the runbook.

/terms and /privacy pages live on the frontend; this module is the data
side of the compliance story.
"""

import json

from django.utils import timezone

#: Days between soft delete and side-content purge.
PURGE_DELAY_DAYS = 30


def build_account_export(user) -> dict:
    """Everything we hold on one user, ready for a JSON response/attachment."""
    from forum.models import Post, PostVote, Thread
    from problems.models import ProblemRating
    from scratch.models import ScratchRun
    from submissions.models import Submission, SubmissionTestResult

    submissions = []
    for submission in Submission.objects.filter(user=user).select_related(
        "problem"
    ):
        submissions.append(
            {
                "id": submission.id,
                "problem_id": submission.problem_id,
                "problem_title": submission.problem.title_i18n.get("en"),
                "language": submission.language,
                "code": submission.code,
                "verdict": submission.verdict,
                "score": submission.score,
                "submission_time": submission.submission_time.isoformat(),
                "test_results": [
                    {
                        "test_case": result.test_case_id,
                        "verdict": result.verdict,
                        "time_ms": result.execution_time_ms,
                        "memory_kb": result.memory_used_kb,
                    }
                    for result in SubmissionTestResult.objects.filter(
                        submission=submission
                    )
                ],
            }
        )

    return {
        "exported_at": timezone.now().isoformat(),
        "profile": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "date_joined": user.date_joined.isoformat(),
        },
        "submissions": submissions,
        "forum_threads": list(
            Thread.objects.filter(author=user).values(
                "id", "title", "created_at"
            )
        ),
        "forum_posts": list(
            Post.objects.filter(author=user).values("id", "thread_id", "content", "created_at")
        ),
        "forum_votes": list(
            PostVote.objects.filter(user=user).values("id", "post_id", "value")
        ),
        "problem_ratings": list(
            ProblemRating.objects.filter(user=user).values("id", "problem_id", "rating")
        ),
        "scratch_runs": list(
            ScratchRun.objects.filter(user=user).values(
                "id", "language", "status", "created_at"
            )
        ),
    }


def export_as_attachment(user) -> tuple[str, str]:
    """(filename, json_body) for the download response."""
    payload = build_account_export(user)
    stamp = timezone.now().strftime("%Y%m%d")
    return (
        f"webcoder-account-export-{user.username}-{stamp}.json",
        json.dumps(payload, indent=2, ensure_ascii=False, default=str),
    )


def soft_delete_account(user) -> None:
    """Deactivate + anonymize PII; schedule the side-content purge."""
    from .models import User

    now = timezone.now()
    user.is_active = False
    user.email = ""
    user.username = f"deleted_user_{user.id}"
    user.set_unusable_password()
    user.scheduled_purge_at = now + timezone.timedelta(days=PURGE_DELAY_DAYS)
    user.save(
        update_fields=["is_active", "email", "username", "password", "scheduled_purge_at"]
    )


def purge_deleted_users() -> int:
    """Beat task body: purge side content of users past their purge date.

    Returns the number of users purged. Submissions/leaderboard rows stay
    (judge-history integrity, anonymized identity); everything the user
    authored that is *only* theirs goes.
    """
    from forum.models import Post, PostVote, Thread
    from problems.models import ProblemRating
    from scratch.models import ScratchRun

    from .models import User

    due = User.objects.filter(
        is_active=False, scheduled_purge_at__lte=timezone.now()
    )
    purged = 0
    for user in due:
        ScratchRun.objects.filter(user=user).delete()
        ProblemRating.objects.filter(user=user).delete()
        PostVote.objects.filter(user=user).delete()
        Post.objects.filter(author=user).update(is_hidden=True, hidden_reason="author account deleted")
        Thread.objects.filter(author=user).update(is_hidden=True)
        user.scheduled_purge_at = None
        user.save(update_fields=["scheduled_purge_at"])
        purged += 1
    return purged
