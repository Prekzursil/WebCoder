"""Community content API (competitive roadmap Wave C).

EDT-3 community editorials (author-attributed rows on the approval queue),
EDT-6 articles (tag-linked lecture layer), COM-2 editorial threads, and
the UGC license surface the terms grant (LEG round-2 extension).
"""

from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User
from webcoder_api.pagination import StandardPageNumberPagination

from .models import Article, CommunityEditorial, Problem, Tag

#: The license every community editorial carries (ToS "terms_content_body"):
#: text is CC BY-SA 4.0 so the community can reuse and translate with
#: attribution; code submissions stay the author's with a platform-display
#: right (that half is surfaced on the solutions endpoint, COM-7).
UGC_TEXT_LICENSE = "CC BY-SA 4.0"


class CommunityEditorialSerializer(serializers.ModelSerializer):
    author_username = serializers.CharField(source="author.username", read_only=True)
    # The license rides every payload so clients can display it without
    # hardcoding legal text (round-2 LEG extension: licensing ships WITH
    # the UGC surface it governs).
    license = serializers.SerializerMethodField()

    class Meta:
        model = CommunityEditorial
        fields = [
            "id",
            "problem",
            "author",
            "author_username",
            "title",
            "body",
            "lang",
            "status",
            "verifier_feedback",
            "is_hidden",
            "license",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "author",
            "status",
            "verifier_feedback",
            "is_hidden",
            "created_at",
            "updated_at",
        ]

    def get_license(self, obj):
        return UGC_TEXT_LICENSE


class CommunityEditorialCreateSerializer(serializers.Serializer):
    """POST body: title/body/lang (+ optional draft flag)."""

    title = serializers.CharField(max_length=200)
    body = serializers.CharField()
    lang = serializers.ChoiceField(choices=["ro", "en"], default="en")
    submit = serializers.BooleanField(
        default=True, help_text="False keeps the row a private draft."
    )


class CommunityEditorialReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])
    feedback = serializers.CharField(required=False, allow_blank=True, default="")


def _can_review(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or user.is_staff
            or getattr(user, "role", "")
            in (User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER)
        )
    )


def _can_author(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (
            _can_review(user)
            or getattr(user, "role", "")
            in (User.Roles.PROBLEM_CREATOR, User.Roles.TEACHER)
        )
    )


def community_editorials_for(problem: Problem, user):
    """Visible rows: APPROVED + not hidden for everyone; the author's own
    rows in any state; staff/moderators see everything."""
    qs = CommunityEditorial.objects.filter(problem=problem).select_related("author")
    if user is None or not user.is_authenticated:
        return qs.filter(status=CommunityEditorial.Status.APPROVED, is_hidden=False)
    if _can_review(user):
        return qs
    from django.db.models import Q

    return qs.filter(
        Q(status=CommunityEditorial.Status.APPROVED, is_hidden=False) | Q(author=user)
    )


class ProblemCommunityEditorialsView(APIView):
    """GET/POST /problems/{problem_id}/community-editorials/ (EDT-3).

    GET lists visible rows (+ ?lang= filter, EDT-4); POST creates a
    community editorial as the caller's own (CREATOR/TEACHER+), PENDING by
    default or DRAFT when submit=false.
    """

    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardPageNumberPagination

    def get(self, request, problem_id):
        problem = get_object_or_404(Problem, pk=problem_id)
        qs = community_editorials_for(problem, request.user)
        lang = request.query_params.get("lang", "")
        if lang in ("ro", "en"):
            qs = qs.filter(lang=lang)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            CommunityEditorialSerializer(page, many=True).data
        )

    def post(self, request, problem_id):
        if not _can_author(request.user):
            return Response(
                {
                    "detail": "Only creators, teachers and verifiers may write editorials."
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        problem = get_object_or_404(Problem, pk=problem_id)
        payload = CommunityEditorialCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        editorial = CommunityEditorial.objects.create(
            problem=problem,
            author=request.user,
            title=payload.validated_data["title"],
            body=payload.validated_data["body"],
            lang=payload.validated_data["lang"],
            status=(
                CommunityEditorial.Status.PENDING
                if payload.validated_data["submit"]
                else CommunityEditorial.Status.DRAFT
            ),
        )
        return Response(
            CommunityEditorialSerializer(editorial).data,
            status=status.HTTP_201_CREATED,
        )


class CommunityEditorialDetailView(APIView):
    """GET/PATCH/DELETE /community-editorials/{id}/ (EDT-3).

    Authors edit their own rows (an edit resubmits for review — the
    content changed, so the approval must too); verifiers/admins do
    anything; readers read visible rows only.
    """

    def get(self, request, pk):
        editorial = get_object_or_404(
            CommunityEditorial.objects.select_related("problem"), pk=pk
        )
        visible = (
            community_editorials_for(editorial.problem, request.user)
            .filter(pk=pk)
            .exists()
        )
        if not visible:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(CommunityEditorialSerializer(editorial).data)

    def patch(self, request, pk):
        editorial = get_object_or_404(CommunityEditorial, pk=pk)
        user = request.user
        if not (
            user
            and user.is_authenticated
            and (editorial.author_id == user.id or _can_review(user))
        ):
            return Response(
                {"detail": "Only the author or a verifier may edit."},
                status=status.HTTP_403_FORBIDDEN,
            )
        data = request.data
        for field in ("title", "body", "lang"):
            if field in data:
                setattr(editorial, field, data[field])
        if data.get("submit"):
            editorial.status = CommunityEditorial.Status.PENDING
        editorial.save()
        return Response(CommunityEditorialSerializer(editorial).data)

    def delete(self, request, pk):
        editorial = get_object_or_404(CommunityEditorial, pk=pk)
        user = request.user
        if not (
            user
            and user.is_authenticated
            and (editorial.author_id == user.id or _can_review(user))
        ):
            return Response(
                {"detail": "Only the author or a verifier may delete."},
                status=status.HTTP_403_FORBIDDEN,
            )
        editorial.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommunityEditorialReviewView(APIView):
    """POST /community-editorials/{id}/review/ — the approval queue arm.

    VERIFIER/ADMIN only; approve publishes, reject records feedback. The
    author is notified through the D-B10 service.
    """

    def post(self, request, pk):
        editorial = get_object_or_404(CommunityEditorial, pk=pk)
        if not _can_review(request.user):
            return Response(
                {"detail": "Verifier only."}, status=status.HTTP_403_FORBIDDEN
            )
        payload = CommunityEditorialReviewSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        decision = payload.validated_data["decision"]
        feedback = payload.validated_data["feedback"]
        if decision == "approve":
            editorial.status = CommunityEditorial.Status.APPROVED
        else:
            editorial.status = CommunityEditorial.Status.REJECTED
        editorial.verifier = request.user
        editorial.verifier_feedback = feedback
        editorial.save()
        if editorial.author_id:
            from notifications.models import Notification
            from notifications.services import notify

            notify(
                editorial.author,
                Notification.Verb.SYSTEM,
                actor=request.user,
                target=editorial,
                data={
                    "kind": "editorial_review",
                    "decision": decision,
                    "title": editorial.title,
                },
            )
        return Response(CommunityEditorialSerializer(editorial).data)


class ArticleSerializer(serializers.ModelSerializer):
    author_username = serializers.CharField(source="author.username", read_only=True)
    tags = serializers.SlugRelatedField(
        many=True, slug_field="slug", queryset=Tag.objects.all(), required=False
    )
    license = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = [
            "id",
            "title_i18n",
            "body_ro",
            "body_en",
            "tags",
            "author",
            "author_username",
            "status",
            "verifier_feedback",
            "is_hidden",
            "license",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "author",
            "status",
            "verifier_feedback",
            "is_hidden",
            "created_at",
            "updated_at",
        ]

    def get_license(self, obj):
        return UGC_TEXT_LICENSE


class ArticleViewSet(viewsets.ModelViewSet):
    """EDT-6 article hub: approved reads for everyone (hidden excluded),
    authoring for CREATOR/TEACHER (rows enter PENDING), review for
    VERIFIER/ADMIN. ``/articles/{id}/related-problems/`` lists the
    problems sharing at least one tag — the reverse of the problem page's
    "related reading" strip.
    """

    serializer_class = ArticleSerializer
    pagination_class = StandardPageNumberPagination

    def get_permissions(self):
        if self.action in ("list", "retrieve", "related_problems"):
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = Article.objects.all().select_related("author").prefetch_related("tags")
        if user is not None and user.is_authenticated and _can_review(user):
            base = qs
        else:
            base = qs.filter(is_hidden=False, status=Article.Status.APPROVED)
            if user is not None and user.is_authenticated:
                base = base | qs.filter(author=user)
        tag = self.request.query_params.get("tag", "")
        if tag:
            base = base.filter(tags__slug=tag)
        return base.distinct()

    def create(self, request, *args, **kwargs):
        if not _can_author(request.user):
            return Response(
                {"detail": "Only creators, teachers and verifiers may write articles."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        article = serializer.save(author=request.user, status=Article.Status.PENDING)
        return Response(ArticleSerializer(article).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        article = self.get_object()
        user = request.user
        if not (
            user
            and user.is_authenticated
            and (article.author_id == user.id or _can_review(user))
        ):
            return Response(
                {"detail": "Only the author or a verifier may edit."},
                status=status.HTTP_403_FORBIDDEN,
            )
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(article, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        # Author edits resubmit for review; verifiers may set the status
        # directly (the review arm of the lifecycle).
        if _can_review(user) and "status" in request.data:
            new_status = request.data["status"]
            if new_status not in Article.Status.values:
                return Response(
                    {"status": "Unknown status."}, status=status.HTTP_400_BAD_REQUEST
                )
            serializer.save(status=new_status)
        else:
            serializer.save(status=Article.Status.PENDING)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        article = self.get_object()
        user = request.user
        if not (
            user
            and user.is_authenticated
            and (article.author_id == user.id or _can_review(user))
        ):
            return Response(
                {"detail": "Only the author or a verifier may delete."},
                status=status.HTTP_403_FORBIDDEN,
            )
        article.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="related-problems")
    def related_problems(self, request, pk=None):
        article = self.get_object()
        slugs = list(article.tags.values_list("slug", flat=True))
        problems = (
            (
                Problem.objects.filter(
                    status=Problem.ProblemStatus.APPROVED, tags__slug__in=slugs
                )
                .distinct()
                .order_by("-creation_date")[:20]
            )
            if slugs
            else Problem.objects.none()
        )
        return Response(
            {
                "count": len(problems),
                "results": [
                    {"id": p.id, "title_i18n": p.title_i18n, "difficulty": p.difficulty}
                    for p in problems
                ],
            }
        )


class RelatedArticlesView(APIView):
    """GET /problems/{problem_id}/related-articles/ — the problem page's
    "related reading" strip (EDT-6): approved articles sharing >= 1 tag."""

    def get(self, request, problem_id):
        problem = get_object_or_404(Problem, pk=problem_id)
        slugs = list(problem.tags.values_list("slug", flat=True))
        articles = (
            (
                Article.objects.filter(
                    is_hidden=False,
                    status=Article.Status.APPROVED,
                    tags__slug__in=slugs,
                )
                .distinct()
                .order_by("-created_at")[:10]
            )
            if slugs
            else Article.objects.none()
        )
        return Response(
            {
                "count": len(articles),
                "results": ArticleSerializer(articles, many=True).data,
            }
        )
