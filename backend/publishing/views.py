"""Publishing API (wave F items 62/63/64).

Endpoints under /api/v1/community/ (mounted by publishing/urls.py):

- ``GET/POST  blogs/``          published blog hub / create (auth)
- ``GET/PATCH/DELETE blogs/{slug}/``  read anyone; edit own
- ``GET       blogs/mine/``     the caller's posts incl. drafts
- ``GET       wiki/``           wiki hub
- ``GET/PUT   wiki/{slug}/``    read; edit (auth, revision written)
- ``GET       wiki/{slug}/history/``
- ``POST      wiki/{slug}/revert/{revision_id}/``   moderator revert
- ``GET/POST  wa-help/``        the explain-my-WA queue
- ``POST      wa-help/{id}/answers/``               answer a request
- ``POST      wa-help/{id}/accept/{answer_id}/``    asker accepts
"""

from django.contrib.auth import get_user_model
from django.utils.text import slugify
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from webcoder_api.pagination import StandardPageNumberPagination

from submissions.models import Submission

from .models import BlogPost, WaHelpAnswer, WaHelpRequest, WikiPage, WikiRevision

User = get_user_model()


def _is_moderator(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or user.is_staff or getattr(user, "role", "") == "ADMIN")
    )


# ---------------------------------------------------------------- blogs (62)


class BlogPostSerializer(serializers.ModelSerializer):
    author_username = serializers.CharField(source="author.username", read_only=True)

    class Meta:
        model = BlogPost
        fields = [
            "id",
            "author",
            "author_username",
            "title",
            "slug",
            "body",
            "lang",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author", "author_username", "slug", "created_at"]

    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        base = slugify(validated_data["title"]) or "post"
        slug = base
        suffix = 2
        while BlogPost.objects.filter(slug=slug).exists():
            slug = f"{base}-{suffix}"
            suffix += 1
        validated_data["slug"] = slug
        return super().create(validated_data)


class BlogPagination(StandardPageNumberPagination):
    page_size = 15


class BlogPostViewSet(viewsets.ModelViewSet):
    """Blog posts: the published hub for everyone, the full lifecycle for
    the author."""

    serializer_class = BlogPostSerializer
    pagination_class = BlogPagination
    lookup_field = "slug"

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = BlogPost.objects.select_related("author").all()
        if self.action == "list":
            author = self.request.query_params.get("author", "").strip()
            if author:
                qs = qs.filter(author__username=author)
            user = self.request.user
            mine = self.request.query_params.get("mine", "") in ("1", "true")
            if mine and user.is_authenticated:
                return qs.filter(author=user)
            # The hub lists PUBLISHED posts (+ the caller's own drafts so
            # authors see their pending work in place).
            if user.is_authenticated:
                return qs.filter(status=BlogPost.Status.PUBLISHED) | qs.filter(
                    author=user
                )
            return qs.filter(status=BlogPost.Status.PUBLISHED)
        return qs

    def perform_create(self, serializer):
        serializer.save()

    def update(self, request, *args, **kwargs):
        post = self.get_object()
        if post.author_id != request.user.id and not _is_moderator(request.user):
            return Response(
                {"detail": "Only the author may edit this post."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        post = self.get_object()
        if post.author_id != request.user.id and not _is_moderator(request.user):
            return Response(
                {"detail": "Only the author may delete this post."},
                status=status.HTTP_403_FORBIDDEN,
            )
        post.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------------- wiki (63)


class WikiPageSerializer(serializers.ModelSerializer):
    updated_by_username = serializers.CharField(
        source="updated_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model = WikiPage
        fields = [
            "slug",
            "title_ro",
            "title_en",
            "body_ro",
            "body_en",
            "updated_by_username",
            "updated_at",
        ]
        read_only_fields = ["slug", "updated_by_username", "updated_at"]


class WikiPageView(APIView):
    """GET/PUT /community/wiki/{slug}/ — the member-editable wiki: PUT
    creates or updates the page and snapshots a revision."""

    def get(self, request, slug):
        page = WikiPage.objects.filter(slug=slug).first()
        if page is None:
            return Response({"detail": "No such wiki page."}, status=404)
        return Response(WikiPageSerializer(page).data)

    def put(self, request, slug):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Sign in to edit the wiki."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        payload = WikiPageSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        page, created = WikiPage.objects.get_or_create(
            slug=slug,
            defaults={
                "title_ro": data["title_ro"],
                "title_en": data.get("title_en", ""),
                "body_ro": data["body_ro"],
                "body_en": data.get("body_en", ""),
                "updated_by": request.user,
            },
        )
        if not created:
            page.title_ro = data["title_ro"]
            page.title_en = data.get("title_en", "")
            page.body_ro = data["body_ro"]
            page.body_en = data.get("body_en", "")
            page.updated_by = request.user
            page.save()
        WikiRevision.objects.create(
            page=page,
            title_ro=page.title_ro,
            title_en=page.title_en,
            body_ro=page.body_ro,
            body_en=page.body_en,
            editor=request.user,
            note=(request.data.get("note") or "")[:200],
        )
        return Response(
            WikiPageSerializer(page).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class WikiListView(APIView):
    """GET /community/wiki/ — the wiki hub (slugs + titles)."""

    def get(self, request):
        pages = WikiPage.objects.all().order_by("slug")
        return Response(
            {
                "count": pages.count(),
                "results": [
                    {
                        "slug": page.slug,
                        "title_ro": page.title_ro,
                        "title_en": page.title_en,
                        "updated_at": page.updated_at,
                    }
                    for page in pages
                ],
            }
        )


class WikiHistoryView(APIView):
    """GET /community/wiki/{slug}/history/ — the revision feed."""

    def get(self, request, slug):
        page = WikiPage.objects.filter(slug=slug).first()
        if page is None:
            return Response({"detail": "No such wiki page."}, status=404)
        revisions = page.revisions.select_related("editor").order_by("-created_at")
        return Response(
            {
                "count": revisions.count(),
                "results": [
                    {
                        "id": revision.id,
                        "editor": revision.editor.username if revision.editor else None,
                        "note": revision.note,
                        "created_at": revision.created_at,
                    }
                    for revision in revisions
                ],
            }
        )


class WikiRevertView(APIView):
    """POST /community/wiki/{slug}/revert/{revision_id}/ — moderators roll
    the page back to a snapshot (itself recorded as a new revision)."""

    def post(self, request, slug, revision_id):
        if not _is_moderator(request.user):
            return Response(
                {"detail": "Moderator only."}, status=status.HTTP_403_FORBIDDEN
            )
        page = WikiPage.objects.filter(slug=slug).first()
        revision = WikiRevision.objects.filter(pk=revision_id, page=page).first()
        if page is None or revision is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        page.title_ro = revision.title_ro
        page.title_en = revision.title_en
        page.body_ro = revision.body_ro
        page.body_en = revision.body_en
        page.updated_by = request.user
        page.save()
        WikiRevision.objects.create(
            page=page,
            title_ro=page.title_ro,
            title_en=page.title_en,
            body_ro=page.body_ro,
            body_en=page.body_en,
            editor=request.user,
            note=f"revert to revision {revision.id}",
        )
        return Response(WikiPageSerializer(page).data)


# ----------------------------------------------------------- WA help (64)


class WaHelpSerializer(serializers.ModelSerializer):
    asker_username = serializers.CharField(source="asker.username", read_only=True)
    problem_title = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()

    class Meta:
        model = WaHelpRequest
        fields = [
            "id",
            "submission",
            "asker",
            "asker_username",
            "problem_title",
            "question",
            "status",
            "answers",
            "created_at",
        ]
        read_only_fields = ["id", "asker", "asker_username", "status", "created_at"]

    def get_problem_title(self, obj):
        return obj.submission.problem.title_i18n if obj.submission else None

    def get_answers(self, obj):
        return [
            {
                "id": answer.id,
                "author": answer.author.username,
                "body": answer.body,
                "is_accepted": answer.is_accepted,
                "created_at": answer.created_at,
            }
            for answer in obj.answers.select_related("author").order_by("created_at")
        ]


class WaHelpCreateSerializer(serializers.Serializer):
    submission_id = serializers.IntegerField()
    question = serializers.CharField(max_length=4000)

    def validate(self, attrs):
        request = self.context["request"]
        submission = (
            Submission.objects.filter(pk=attrs["submission_id"], user=request.user)
            .select_related("problem")
            .first()
        )
        if submission is None:
            raise serializers.ValidationError(
                {"submission_id": "Your own submission only."}
            )
        if submission.verdict == Submission.VerdictStatus.ACCEPTED:
            raise serializers.ValidationError(
                {"submission_id": "Ask for help on a submission that is NOT accepted."}
            )
        attrs["submission"] = submission
        return attrs


class WaHelpAnswerSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=8000)


class WaHelpView(APIView):
    """GET /community/wa-help/ — the queue (open requests + the caller's
    own); POST — open a request on one of the caller's failed submissions."""

    def get(self, request):
        qs = WaHelpRequest.objects.select_related(
            "asker", "submission__problem"
        ).order_by("-created_at")
        user = request.user
        if user.is_authenticated:
            helped = set(
                WaHelpAnswer.objects.filter(author=user).values_list(
                    "request_id", flat=True
                )
            )
            rows = [
                row
                for row in qs
                if row.status == WaHelpRequest.Status.OPEN
                or row.asker_id == user.id
                or row.id in helped
            ]
        else:
            rows = list(qs.filter(status=WaHelpRequest.Status.OPEN))
        return Response(
            {
                "count": len(rows),
                "results": WaHelpSerializer(rows, many=True).data,
            }
        )

    def post(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Sign in to ask for help."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        payload = WaHelpCreateSerializer(
            data=request.data, context={"request": request}
        )
        payload.is_valid(raise_exception=True)
        row = WaHelpRequest.objects.create(
            submission=payload.validated_data["submission"],
            asker=request.user,
            question=payload.validated_data["question"],
        )
        return Response(WaHelpSerializer(row).data, status=status.HTTP_201_CREATED)


class WaHelpAnswerView(APIView):
    """POST /community/wa-help/{id}/answers/ — a helper answers."""

    def post(self, request, request_id):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Sign in to answer."}, status=status.HTTP_401_UNAUTHORIZED
            )
        help_request = WaHelpRequest.objects.filter(pk=request_id).first()
        if help_request is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        payload = WaHelpAnswerSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        answer = WaHelpAnswer.objects.create(
            request=help_request,
            author=request.user,
            body=payload.validated_data["body"],
        )
        return Response(
            {
                "id": answer.id,
                "author": answer.author.username,
                "body": answer.body,
                "is_accepted": False,
                "created_at": answer.created_at,
            },
            status=status.HTTP_201_CREATED,
        )


class WaHelpAcceptView(APIView):
    """POST /community/wa-help/{id}/accept/{answer_id}/ — the asker accepts
    one answer; the request closes and the helper earns honor."""

    def post(self, request, request_id, answer_id):
        if not request.user.is_authenticated:
            return Response({"detail": "Sign in."}, status=status.HTTP_401_UNAUTHORIZED)
        help_request = WaHelpRequest.objects.filter(pk=request_id).first()
        answer = WaHelpAnswer.objects.filter(pk=answer_id, request=help_request).first()
        if help_request is None or answer is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if help_request.asker_id != request.user.id:
            return Response(
                {"detail": "Only the asker accepts an answer."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if help_request.status == WaHelpRequest.Status.ANSWERED:
            return Response(
                {"detail": "Already answered."}, status=status.HTTP_409_CONFLICT
            )
        answer.is_accepted = True
        answer.save(update_fields=["is_accepted"])
        help_request.status = WaHelpRequest.Status.ANSWERED
        help_request.save(update_fields=["status"])
        return Response({"detail": "Accepted.", "answer": answer_id})
