from django.db import models, transaction
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .bookmarks import ProblemStar
from .models import (
    CurriculumNode,
    ProblemEditorial,
    ProblemRating,
    Tag,
    Problem,
    TestCase,
)
from .editorial_visibility import editorial_visible_to
from .serializers import (
    CurriculumNodeSerializer,
    TagSerializer,
    ProblemSerializer,
    ProblemDetailSerializer,
    ProblemEditorialSerializer,
    TestCaseSerializer,
)
from notifications.models import Notification
from notifications.services import notify
from users.models import User
from users.permissions import (
    IsProblemCreator,
    IsProblemVerifier,
    PrivilegedRoleRequires2FA,
    ProblemObjectPermissions,
)


def user_can_manage_editorial(user, problem):
    """Editorial write access: the problem's author, a verifier, or an admin."""
    if not (user and user.is_authenticated):
        return False
    if user.is_staff or user.role in [User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER]:
        return True
    return problem.author_id == user.id


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [
        permissions.IsAuthenticatedOrReadOnly
    ]  # Allow read for anyone, write for authenticated
    # More specific permissions for create/update/delete might be needed (e.g., only admins/verifiers)

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            # For write actions, TEMPORARILY allow any authenticated user for testing
            # TODO: Revert to IsAdminUser() or a more specific role-based permission later.
            return [permissions.IsAuthenticated()]
        return super().get_permissions()  # Default is IsAuthenticatedOrReadOnly


def _guard_contest_pin(problem: Problem, user) -> None:
    """CON-1: raise ValidationError when ``problem`` is on the board of a
    contest that has not finished and ``user`` is not an admin — statements,
    tests and checkers must stay frozen for the contest's lifetime."""
    is_admin = user.is_staff or (
        hasattr(user, "role") and user.role == User.Roles.ADMIN
    )
    if is_admin:
        return
    from django.utils import timezone as _tz

    from contests.models import ContestProblem

    pinned = ContestProblem.objects.filter(
        problem=problem, contest__end_at__gt=_tz.now()
    ).exists()
    if pinned:
        from rest_framework.exceptions import ValidationError

        raise ValidationError(
            {
                "detail": (
                    "This problem is part of an upcoming or running contest "
                    "and cannot be edited until that contest ends."
                )
            }
        )


class ProblemViewSet(viewsets.ModelViewSet):
    queryset = Problem.objects.all()  # Default queryset
    serializer_class = ProblemSerializer

    @action(detail=True, methods=["get"], url_path="statement-revisions")
    def statement_revisions(self, request, pk=None):
        """UXP-4 — the public statement history feed (newest first)."""
        from .models import StatementRevision

        problem = self.get_object()
        rows = (
            StatementRevision.objects.filter(problem=problem)
            .select_related("edited_by")
            .order_by("-created_at")[:20]
        )
        return Response(
            {
                "count": len(rows),
                "results": [
                    {
                        "id": row.id,
                        "note": row.note,
                        "edited_by": row.edited_by.username if row.edited_by else None,
                        "created_at": row.created_at,
                    }
                    for row in rows
                ],
            }
        )

    # permission_classes = [IsAuthorOrVerifierOrAdminOrReadOnly] # Replaced with more granular per-action

    def get_permissions(self):
        # OPS-2 (Wave D): with TWO_FACTOR_ENFORCE on, privileged-role
        # writes on the content supply chain (authoring + approval) are
        # refused until TOTP is enrolled — composes after the role gates.
        two_factor_gate = PrivilegedRoleRequires2FA
        if self.action == "create":
            self.permission_classes = [
                permissions.IsAuthenticated,
                IsProblemCreator,
                two_factor_gate,
            ]
        elif self.action in [
            "update",
            "partial_update",
            "destroy",
            "submit_for_approval",
        ]:
            self.permission_classes = [
                permissions.IsAuthenticated,
                ProblemObjectPermissions,
                two_factor_gate,
            ]
        elif self.action in ["approve_problem", "reject_problem"]:
            self.permission_classes = [
                permissions.IsAuthenticated,
                IsProblemVerifier,
                two_factor_gate,
            ]  # Or IsAdminUser
        elif self.action == "list" or self.action == "retrieve":
            self.permission_classes = [
                permissions.AllowAny
            ]  # Queryset handles visibility
        elif self.action == "bookmark":
            self.permission_classes = [permissions.IsAuthenticated]
        elif self.action in [
            "editorial",
            "statistics",
            "starters",
            "bookmarked",
            "statement_revisions",
            "related",
        ]:
            # Read-shaped actions: the queryset already scopes problem
            # visibility; the editorial action additionally enforces the
            # publish-policy gate inside.
            self.permission_classes = [permissions.AllowAny]
        elif self.action == "rate":
            self.permission_classes = [permissions.IsAuthenticated]
        elif self.action in ("unlock_source", "reveal_hint"):
            # Item F/D: per-user economy actions — any authenticated user;
            # the queryset scopes problem visibility.
            self.permission_classes = [permissions.IsAuthenticated]
        else:
            self.permission_classes = [
                permissions.IsAdminUser
            ]  # Default to admin for other actions
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProblemDetailSerializer  # Use detailed serializer for single problem view
        return ProblemSerializer

    def perform_create(self, serializer):
        # Automatically set the author to the current user on creation
        if self.request.user.is_authenticated:
            serializer.save(author=self.request.user)
        else:
            serializer.save()  # Or raise an error if anonymous users cannot create problems

    def perform_update(self, serializer):
        """CON-1: pin problem edits while the problem sits on the board of a
        contest that has not finished yet (upcoming or running) — mid-contest
        statement/test changes would silently invalidate live standings.
        Admins bypass; after end_at the problem reverts to normal editing
        (archive/upsolving mode).
        """
        from .revisions import record_revision

        _guard_contest_pin(serializer.instance, self.request.user)
        serializer.save()
        # UXP-4: statement history — a row lands whenever title/statement
        # materially changed; metadata-only saves stay out of the feed.
        record_revision(serializer.instance, edited_by=self.request.user)

    def get_queryset(self):
        # By default, show only APPROVED problems to non-staff/non-authors
        # Authors can see their own drafts/pending. Admins/Verifiers see all.
        user = self.request.user
        if user.is_authenticated:
            if user.is_staff or (
                hasattr(user, "role")
                and user.role in [User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER]
            ):
                qs = Problem.objects.all()  # Admins/Verifiers see all
            else:
                # Authenticated users see APPROVED problems and their own DRAFT/PENDING problems
                qs = Problem.objects.filter(
                    models.Q(status=Problem.ProblemStatus.APPROVED)
                    | (
                        models.Q(author=user)
                        & models.Q(
                            status__in=[
                                Problem.ProblemStatus.DRAFT,
                                Problem.ProblemStatus.PENDING_APPROVAL,
                            ]
                        )
                    )
                ).distinct()
        else:
            # Anonymous users only see APPROVED problems
            qs = Problem.objects.filter(status=Problem.ProblemStatus.APPROVED)
        # Scheduled content drops (item 131): future-dated APPROVED
        # problems stay hidden from non-staff/non-authors (and non-owners)
        # until the drop moment passes.
        from django.utils import timezone as _tz

        now = _tz.now()
        if user.is_authenticated and (
            user.is_staff
            or getattr(user, "role", "")
            in (User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER)
        ):
            pass  # staff/verifiers see scheduled problems (the calendar view)
        else:
            drop_gate = models.Q(publish_at__isnull=True) | models.Q(
                publish_at__lte=now
            )
            if user.is_authenticated:
                qs = (qs.filter(drop_gate) | qs.filter(author=user)).distinct()
            else:
                qs = qs.filter(drop_gate)
        # Curriculum browse axis (competitive roadmap EDU-9): filter by the
        # chapter/grade node the catalog is drilling into. Exact node match
        # v1 — the tree itself provides the drill-down ids.
        node_id = self.request.query_params.get("curriculum_node")
        if node_id:
            qs = qs.filter(curriculum_nodes__id=node_id)
        # Archive browse axis (competitive roadmap RO-6): the olympiad
        # archive's provenance fields are a first-class catalog filter —
        # browse by edition year, grade group, or "archive problems only".
        source_year = self.request.query_params.get("source_year")
        if source_year:
            qs = qs.filter(source_year=source_year)
        grade_group = self.request.query_params.get("grade_group")
        if grade_group:
            qs = qs.filter(grade_group=grade_group)
        if self.request.query_params.get("archive") in ("1", "true", "yes"):
            qs = qs.exclude(source_contest="", source_year__isnull=True, grade_group="")
        # DMOJ's "has editorial" catalog facet: problems that carry an
        # editorial row which is (or will become) visible — MANUAL rows are
        # staff-only by policy and therefore do not count as "has editorial".
        if self.request.query_params.get("has_editorial") in ("1", "true", "yes"):
            qs = qs.filter(
                editorial__publish_policy__in=[
                    ProblemEditorial.PublishPolicy.PUBLIC,
                    ProblemEditorial.PublishPolicy.AFTER_AC,
                ]
            ).distinct()
        # Server-side catalog text search (?search=). The web list filters
        # client-side over fetched pages (?q= is a web-only URL param), but
        # the mobile app and any API consumer paginate server-side and need
        # the filter applied before pagination. Semantics: the term is
        # split on whitespace and EVERY word must appear (case-insensitive)
        # in a title in ANY locale. Matching walks title_i18n's VALUES (not
        # the serialized JSON text — locale keys like "en" would collide
        # with real search terms) and filters by id before pagination. An
        # empty/blank term is ignored — it must never silently widen the
        # catalog (the quirk this closes: a ?search= the backend did not
        # implement returned the unfiltered catalog with a 200).
        search_term = (self.request.query_params.get("search") or "").strip()
        if search_term:
            words = search_term.lower().split()
            matched_ids = [
                row_id
                for row_id, titles in qs.values_list("id", "title_i18n")
                if all(
                    word
                    in " \n".join(
                        str(value)
                        for value in (titles or {}).values()
                        if isinstance(value, str)
                    ).lower()
                    for word in words
                )
            ]
            qs = qs.filter(id__in=matched_ids)
        # Catalog stats add-on (SPEC-GAPS D-B8): "X tried / Y solved" per
        # problem card. distinct=True keeps counts exact under the author
        # branch's .distinct().
        return qs.annotate(
            submission_count=models.Count("submissions"),
            solved_count=models.Count(
                "submissions",
                filter=models.Q(submissions__verdict="AC"),
                distinct=True,
            ),
            # DMOJ "has editorial" facet: an editorial row exists whose
            # publish policy is (or will become) reader-visible.
            has_editorial=models.Exists(
                ProblemEditorial.objects.filter(
                    problem=models.OuterRef("pk"),
                    publish_policy__in=[
                        ProblemEditorial.PublishPolicy.PUBLIC,
                        ProblemEditorial.PublishPolicy.AFTER_AC,
                    ],
                )
            ),
        )

    @action(detail=True, methods=["post"], url_path="submit-for-approval")
    def submit_for_approval(self, request, pk=None):
        problem = (
            self.get_object()
        )  # ProblemObjectPermissions will check if user is author
        # CNT-2/RO-6 rights gate: an imported problem (ledger row attached)
        # may not even enter the approval queue unless the covering row is
        # GRANTED — the pipeline is rights-checked by construction.
        if problem.import_source_id and not problem.import_source.allows_publication:
            return Response(
                {
                    "status": (
                        f"import source '{problem.import_source.name}' is "
                        f"{problem.import_source.status}; publication blocked"
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if problem.status == Problem.ProblemStatus.DRAFT:
            problem.status = Problem.ProblemStatus.PENDING_APPROVAL
            problem.verifier = None  # Clear verifier when resubmitting
            problem.verifier_feedback = None  # Clear old feedback
            problem.save()
            return Response(
                {"status": "problem submitted for approval"}, status=status.HTTP_200_OK
            )
        return Response(
            {
                "status": f"problem cannot be submitted for approval from state {problem.status}"
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"], url_path="approve")
    def approve_problem(self, request, pk=None):  # Renamed from 'approve'
        problem = self.get_object()  # IsProblemVerifier permission applied
        # CNT-2/RO-6: the GRANTED check re-runs at approve time — a ledger
        # row may have expired between submission and review.
        if problem.import_source_id and not problem.import_source.allows_publication:
            return Response(
                {
                    "status": (
                        f"import source '{problem.import_source.name}' is "
                        f"{problem.import_source.status}; cannot approve"
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if problem.status == Problem.ProblemStatus.PENDING_APPROVAL:
            # Item E: an editorial is MANDATORY before APPROVED — the full
            # solution walkthrough must exist before the problem reaches
            # the public catalog.
            editorial = getattr(problem, "editorial", None)
            editorial_ok = editorial is not None and bool(
                (editorial.content_ro or "").strip()
                or (editorial.content_en or "").strip()
            )
            if not editorial_ok:
                return Response(
                    {
                        "status": (
                            "problem cannot be approved without an editorial "
                            "(write the full solution walkthrough first)"
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Item G defense-in-depth: the declared point value must sit in
            # the difficulty band at approve time even if a caller bypassed
            # the serializer validation.
            from .economics import validate_target_points

            try:
                validate_target_points(problem.difficulty, problem.target_points)
            except Exception as exc:
                return Response(
                    {"status": f"problem cannot be approved: {exc}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            problem.status = Problem.ProblemStatus.APPROVED
            problem.verifier = request.user
            problem.verifier_feedback = request.data.get(
                "feedback", None
            )  # Optional approval feedback
            problem.save()
            transaction.on_commit(
                lambda: notify(
                    problem.author,
                    Notification.Verb.PROBLEM_APPROVED,
                    actor=request.user,
                    target=problem,
                    data={"feedback": problem.verifier_feedback},
                )
            )
            return Response({"status": "problem approved"}, status=status.HTTP_200_OK)
        return Response(
            {"status": f"problem cannot be approved from state {problem.status}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"], url_path="reject")
    def reject_problem(self, request, pk=None):  # Renamed from 'reject'
        problem = self.get_object()  # IsProblemVerifier permission applied
        feedback = request.data.get("feedback", None)
        if not feedback:
            return Response(
                {"feedback": "Feedback is required for rejection."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if problem.status == Problem.ProblemStatus.PENDING_APPROVAL:
            problem.status = Problem.ProblemStatus.PRIVATE
            problem.verifier = request.user
            problem.verifier_feedback = feedback
            problem.save()
            transaction.on_commit(
                lambda: notify(
                    problem.author,
                    Notification.Verb.PROBLEM_REJECTED,
                    actor=request.user,
                    target=problem,
                    data={"feedback": problem.verifier_feedback},
                )
            )
            return Response(
                {"status": "problem rejected and marked as private"},
                status=status.HTTP_200_OK,
            )
        return Response(
            {"status": f"problem cannot be rejected from state {problem.status}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["get", "put", "patch"], url_path="editorial")
    def editorial(self, request, pk=None):
        """Read (gated by publish policy) or write (author/verifier/admin).

        GET returns the editorial, 403 with a locked reason when the policy
        hides it, or 404 when none exists. PUT/PATCH create-or-update
        (editorials ride the problem's own visibility: the writer must
        already be able to see the problem).
        """
        problem = self.get_object()
        editorial = getattr(problem, "editorial", None)

        if request.method in ("PUT", "PATCH"):
            if not user_can_manage_editorial(request.user, problem):
                return Response(
                    {
                        "detail": (
                            "Only the problem author, verifiers or admins "
                            "may edit the editorial."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer = ProblemEditorialSerializer(
                editorial,
                data=request.data,
                partial=request.method == "PATCH",
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save(
                problem=problem,
                author=(editorial.author if editorial else request.user),
            )
            return Response(serializer.data)

        if editorial is None:
            return Response(
                {"detail": "No editorial for this problem."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not editorial_visible_to(editorial, request.user):
            return Response(
                {
                    "detail": "This editorial is locked by its publish policy.",
                    "publish_policy": editorial.publish_policy,
                    "locked": True,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            ProblemEditorialSerializer(editorial, context={"request": request}).data
        )

    @action(detail=True, methods=["post"], url_path="unlock-source")
    def unlock_source(self, request, pk=None):
        """Item F — the source-code unlock economy.

        The caller confirms the verbatim warning ("unlocking the source
        code before the problem is solved means the problem will NOT
        award points to this account") in the UI modal; this endpoint
        records the PERMANENT per-user-per-problem forfeiture and returns
        the reference source. Already-solved users get the source without
        a forfeit (their AC makes it free); already-forfeited users just
        re-fetch.
        """
        from .models import ProblemForfeit
        from .score_service import has_solved

        problem = self.get_object()
        solved = has_solved(request.user.id, problem.id)
        forfeit = ProblemForfeit.objects.filter(
            user=request.user, problem=problem
        ).first()
        if not solved and forfeit is None:
            forfeit = ProblemForfeit.objects.create(user=request.user, problem=problem)
        return Response(
            {
                "reference_solution_code": problem.reference_solution_code,
                "reference_language": problem.reference_language,
                "forfeited": forfeit is not None,
                "forfeited_at": forfeit.created_at if forfeit else None,
                "editorial_unlocked": solved or forfeit is not None,
            }
        )

    @action(detail=True, methods=["post"], url_path="hints/reveal")
    def reveal_hint(self, request, pk=None):
        """Item D — voluntarily reveal one hint tier (free, recorded).

        Body: {"tier": 1|2|3}. Revealing is idempotent per (user, problem,
        tier); the response carries the tier's content in the requester's
        locale (fallback chain like the statement) plus the fresh state.
        """
        from .models import HintReveal

        problem = self.get_object()
        tier = request.data.get("tier")
        if tier not in (1, 2, 3, "1", "2", "3"):
            return Response(
                {"detail": "tier must be 1, 2 or 3."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tier = int(tier)
        HintReveal.objects.get_or_create(
            user=request.user, problem=problem, tier=tier
        )
        from .hints import hint_state_for

        locale = getattr(request, "LANGUAGE_CODE", "en") or "en"
        return Response(hint_state_for(problem, request.user, locale[:2]))

    @action(detail=True, methods=["get"], url_path="statistics")
    def statistics(self, request, pk=None):
        """Per-problem statistics (competitive roadmap UXP-7 / X9 core).

        tried, solved (distinct AC users), acceptance rate, verdict
        distribution, per-language submission counts, and the satisfaction
        vote aggregate. Readable by anyone who can see the problem.
        """
        from submissions.models import Submission

        problem = self.get_object()
        subs = Submission.objects.filter(problem=problem)
        tried = subs.count()
        verdict_distribution = {
            row["verdict"]: row["n"]
            for row in subs.values("verdict").annotate(n=models.Count("id"))
        }
        solved = (
            subs.filter(verdict=Submission.VerdictStatus.ACCEPTED)
            .values("user_id")
            .distinct()
            .count()
        )
        language_counts = {
            row["language"]: row["n"]
            for row in subs.values("language").annotate(n=models.Count("id"))
        }
        # [wave G item 102] per-problem language stats: tried, distinct AC
        # users and the acceptance rate per language.
        language_stats = {}
        for row in subs.values("language").annotate(
            n=models.Count("id"),
            ac_users=models.Count(
                "user_id",
                filter=models.Q(verdict=Submission.VerdictStatus.ACCEPTED),
                distinct=True,
            ),
        ):
            language_stats[row["language"]] = {
                "tried": row["n"],
                "solved_users": row["ac_users"],
                "acceptance_rate": (
                    round(row["ac_users"] / row["n"], 4) if row["n"] else None
                ),
            }
        ratings = problem.ratings.aggregate(
            avg=models.Avg("rating"), count=models.Count("id")
        )
        return Response(
            {
                "problem": problem.id,
                "tried": tried,
                "solved": solved,
                "acceptance_rate": round(solved / tried, 4) if tried else None,
                "verdict_distribution": verdict_distribution,
                "language_counts": language_counts,
                "language_stats": language_stats,
                "rating_avg": round(ratings["avg"], 2)
                if ratings["avg"] is not None
                else None,
                "rating_count": ratings["count"],
            }
        )

    @action(detail=True, methods=["post"], url_path="rate")
    def rate(self, request, pk=None):
        """Three-level satisfaction vote (1=poor, 2=fine, 3=great); re-vote overwrites."""
        problem = self.get_object()
        rating_value = request.data.get("rating")
        if isinstance(rating_value, str) and rating_value in ("1", "2", "3"):
            rating_value = int(rating_value)
        if rating_value not in (1, 2, 3):
            return Response(
                {"rating": "Rating must be 1, 2 or 3."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ProblemRating.objects.update_or_create(
            user=request.user, problem=problem, defaults={"rating": rating_value}
        )
        aggregate = problem.ratings.aggregate(
            avg=models.Avg("rating"), count=models.Count("id")
        )
        return Response(
            {
                "rating_avg": round(aggregate["avg"], 2)
                if aggregate["avg"] is not None
                else None,
                "rating_count": aggregate["count"],
                "your_rating": rating_value,
            }
        )

    #: Difficulty proximity key for the related-problems ranking (row 6).
    _DIFFICULTY_ORDER = {
        Problem.DifficultyLevel.VERY_EASY: 0,
        Problem.DifficultyLevel.EASY: 1,
        Problem.DifficultyLevel.MEDIUM: 2,
        Problem.DifficultyLevel.HARD: 3,
    }

    @action(detail=True, methods=["get"], url_path="related")
    def related(self, request, pk=None):
        """Similar problems (competitive matrix row 6, the LeetCode
        "Similar Questions" / Codewars related-by-tag affordance).

        Candidates are APPROVED problems sharing >= 1 tag with the source,
        ranked by shared-tag count, then difficulty proximity, then id —
        the viewer's already-solved problems drop out unless
        ?include_solved=1 asks for them back. Tag-less sources fall back
        to same-difficulty problems by solve count (a weaker but honest
        "more like this").
        """
        from submissions.models import Submission

        problem = self.get_object()
        include_solved = request.query_params.get("include_solved") in (
            "1",
            "true",
            "yes",
        )
        solved_ids = set()
        if request.user.is_authenticated and not include_solved:
            solved_ids = set(
                Submission.objects.filter(
                    user=request.user, verdict=Submission.VerdictStatus.ACCEPTED
                ).values_list("problem_id", flat=True)
            )
        tag_ids = list(problem.tags.values_list("id", flat=True))
        base = Problem.objects.filter(status=Problem.ProblemStatus.APPROVED).exclude(
            pk=problem.pk
        )
        if tag_ids:
            candidates = list(
                base.filter(tags__in=tag_ids)
                .annotate(
                    shared_tags=models.Count(
                        "tags",
                        filter=models.Q(tags__in=tag_ids),
                        distinct=True,
                    )
                )
                .distinct()[:200]
            )
        else:
            candidates = list(
                base.filter(difficulty=problem.difficulty)
                .annotate(
                    shared_tags=models.Value(0),
                    solve_count=models.Count(
                        "submissions",
                        filter=models.Q(submissions__verdict="AC"),
                        distinct=True,
                    ),
                )
                .distinct()[:200]
            )
        source_rank = self._DIFFICULTY_ORDER.get(problem.difficulty, 2)
        if tag_ids:

            def rank(row):
                return (
                    -row.shared_tags,
                    abs(self._DIFFICULTY_ORDER.get(row.difficulty, 2) - source_rank),
                    row.pk,
                )

            candidates.sort(key=rank)
        else:
            candidates.sort(key=lambda row: (-row.solve_count, row.pk))
        rows = [row for row in candidates if row.pk not in solved_ids][:8]
        return Response(
            {
                "count": len(rows),
                "results": [
                    {
                        "id": row.pk,
                        "title_i18n": row.title_i18n,
                        "difficulty": row.difficulty,
                        "shared_tags": row.shared_tags,
                    }
                    for row in rows
                ],
            }
        )

    @action(detail=False, methods=["get"], url_path="starters")
    def starters(self, request):
        """Guided first-run trio (competitive roadmap ONB-1): one easy
        APPROVED problem per paradigm (curriculum chapter), in tree order —
        the /start page's data source. Falls back to the easiest APPROVED
        problems by creation order when no curriculum links exist yet.
        """
        picked_ids = []
        chapters = (
            CurriculumNode.objects.filter(
                kind=CurriculumNode.NodeKind.CHAPTER, parent__isnull=False
            )
            .select_related("parent")
            .order_by("parent__order", "parent__id", "order", "id")
        )
        for chapter in chapters:
            candidate = (
                chapter.problems.filter(
                    status=Problem.ProblemStatus.APPROVED,
                    difficulty=Problem.DifficultyLevel.EASY,
                )
                .order_by("id")
                .first()
            )
            if candidate is not None:
                picked_ids.append(candidate.id)
            if len(picked_ids) == 3:
                break
        if len(picked_ids) < 3:
            fallback = (
                Problem.objects.filter(
                    status=Problem.ProblemStatus.APPROVED,
                    difficulty=Problem.DifficultyLevel.EASY,
                )
                .exclude(id__in=picked_ids)
                .order_by("id")
            )
            for problem in fallback:
                picked_ids.append(problem.id)
                if len(picked_ids) == 3:
                    break
        qs = Problem.objects.filter(id__in=picked_ids).annotate(
            submission_count=models.Count("submissions"),
            solved_count=models.Count(
                "submissions",
                filter=models.Q(submissions__verdict="AC"),
                distinct=True,
            ),
        )
        data = sorted(qs, key=lambda p: picked_ids.index(p.id))
        return Response(
            ProblemSerializer(data, many=True, context={"request": request}).data
        )

    @action(detail=True, methods=["post", "delete"], url_path="bookmark")
    def bookmark(self, request, pk=None):
        """Toggle (POST) or remove (DELETE) the requester's star (UXP-6).

        POST is idempotent-create (starring twice keeps one row); DELETE is
        idempotent too. Returns the problem's total star count.
        """
        problem = self.get_object()
        if request.method == "DELETE":
            ProblemStar.objects.filter(user=request.user, problem=problem).delete()
        else:
            ProblemStar.objects.get_or_create(user=request.user, problem=problem)
        return Response(
            {
                "problem": problem.id,
                "starred": request.method == "POST",
                "star_count": problem.stars.count(),
            }
        )

    @action(detail=False, methods=["get"], url_path="bookmarked")
    def bookmarked(self, request):
        """The requester's starred problem ids (UXP-6) — cheap id set for
        the catalog's star column."""
        if not request.user.is_authenticated:
            return Response({"starred_ids": []})
        ids = ProblemStar.objects.filter(user=request.user).values_list(
            "problem_id", flat=True
        )
        return Response({"starred_ids": list(ids)})


class CurriculumViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only curriculum tree (competitive roadmap EDU-9 / RO-1).

    GET /api/v1/curriculum/ — the full versioned tree (grades with nested
    chapters) and per-node APPROVED problem counts; the pbinfo-style browse
    spine. GET /api/v1/curriculum/{id}/ — one node.
    """

    serializer_class = CurriculumNodeSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        # List returns the tree roots (grades with nested chapters); any
        # node — a chapter — is retrievable directly for drill-down links.
        if self.action == "retrieve":
            return CurriculumNode.objects.all()
        return CurriculumNode.objects.filter(parent__isnull=True)


class TestCaseViewSet(viewsets.ModelViewSet):
    queryset = TestCase.objects.all()
    serializer_class = TestCaseSerializer
    # Permissions for test cases should be tied to the parent problem's permissions
    # This means if a user can edit a problem, they can manage its test cases.
    # The perform_create and perform_update/destroy methods will handle this.
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Filter test cases based on the problem_id if provided in query_params
        # Or, if nested, this might be handled by the router
        problem_id = self.request.query_params.get("problem_id")
        if problem_id:
            return TestCase.objects.filter(problem_id=problem_id)
        return TestCase.objects.all()

    def perform_create(self, serializer):
        problem = serializer.validated_data["problem"]
        # Check if user has permission to modify the problem (implies they can add test cases)
        # We use ProblemObjectPermissions for this check.
        problem_permission_check = ProblemObjectPermissions()
        if not problem_permission_check.has_object_permission(
            self.request, self, problem
        ):
            self.permission_denied(
                self.request,
                message="You do not have permission to add test cases to this problem.",
            )
        _guard_contest_pin(problem, self.request.user)
        serializer.save()

    def perform_update(self, serializer):
        problem = serializer.instance.problem  # Get problem from existing test case
        problem_permission_check = ProblemObjectPermissions()
        if not problem_permission_check.has_object_permission(
            self.request, self, problem
        ):
            self.permission_denied(
                self.request,
                message="You do not have permission to update test cases for this problem.",
            )
        _guard_contest_pin(problem, self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        problem = instance.problem
        problem_permission_check = ProblemObjectPermissions()
        if not problem_permission_check.has_object_permission(
            self.request, self, problem
        ):
            self.permission_denied(
                self.request,
                message="You do not have permission to delete test cases for this problem.",
            )
        _guard_contest_pin(problem, self.request.user)
        instance.delete()


# models import moved to the top
