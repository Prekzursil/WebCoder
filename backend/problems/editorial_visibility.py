"""Publish-policy gate shared by problems.views and problems.serializers.
Lives in its own module so neither imports the other (py/cyclic-import).
"""

from problems.models import ProblemEditorial
from users.models import User


def editorial_visible_to(editorial, user):
    """Publish-policy gate for editorials (competitive roadmap EDT-1).

    - PUBLIC: anyone (who can see the problem — the viewset queryset already
      scopes that).
    - AFTER_AC: the requester has an AC submission on the problem, or is the
      problem's author / a verifier / an admin (staff need it to review).
    - MANUAL: author / verifier / admin only.
    Anonymous users never pass AFTER_AC or MANUAL.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return editorial.publish_policy == ProblemEditorial.PublishPolicy.PUBLIC

    is_staff = user.is_staff or user.role in [
        User.Roles.ADMIN,
        User.Roles.PROBLEM_VERIFIER,
    ]
    if is_staff or editorial.problem.author_id == user.id:
        return True
    if editorial.publish_policy == ProblemEditorial.PublishPolicy.PUBLIC:
        return True
    if editorial.publish_policy == ProblemEditorial.PublishPolicy.AFTER_AC:
        from submissions.models import Submission

        return Submission.objects.filter(
            user=user,
            problem_id=editorial.problem_id,
            verdict=Submission.VerdictStatus.ACCEPTED,
        ).exists()
    return False
