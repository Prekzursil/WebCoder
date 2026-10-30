from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from notifications.models import Notification
from notifications.services import notify
from webcoder_api.pagination import (
    NewestFirstCursorPagination,
    StandardPageNumberPagination,
)

from .models import Post, PostVote, Report, Thread
from .permissions import IsAuthorOrModerator, IsModerator, is_moderator
from .serializers import (
    PostCreateSerializer,
    PostSerializer,
    PostUpdateSerializer,
    ReportCreateSerializer,
    ReportSerializer,
    ThreadCreateSerializer,
    ThreadListSerializer,
    ThreadUpdateSerializer,
    VoteSerializer,
)


class ThreadViewSet(viewsets.ModelViewSet):
    """Forum threads: public read (hidden threads only for moderators),
    authenticated create (thread + first post atomically), author/moderator
    edit, soft delete, moderator pin/lock toggles."""

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        if self.action in ("pin", "lock"):
            return [permissions.IsAuthenticated(), IsModerator()]
        # create / update / partial_update / destroy
        return [permissions.IsAuthenticated(), IsAuthorOrModerator()]

    def get_serializer_class(self):
        if self.action == "create":
            return ThreadCreateSerializer
        if self.action in ("update", "partial_update"):
            return ThreadUpdateSerializer
        return ThreadListSerializer

    def perform_update(self, serializer):
        # COM-6: the announcement flag is a moderator-only news lever —
        # strip it from ordinary authors' payloads.
        if "is_announcement" in serializer.validated_data and not is_moderator(
            self.request.user
        ):
            if serializer.instance.is_announcement != serializer.validated_data[
                "is_announcement"
            ]:
                serializer.validated_data.pop("is_announcement")
        serializer.save()

    def get_queryset(self):
        qs = Thread.objects.select_related("author", "problem")
        user = self.request.user
        if not is_moderator(user):
            qs = qs.filter(is_hidden=False)
        elif self.request.query_params.get("include_hidden", "").lower() not in (
            "1",
            "true",
        ):
            qs = qs.filter(is_hidden=False)
        # COM-6: ?announcements=1 — the admin news panel feed.
        if self.request.query_params.get("announcements", "") in ("1", "true"):
            qs = qs.filter(is_announcement=True)
        problem_id = self.request.query_params.get("problem_id")
        if problem_id:
            qs = qs.filter(problem_id=problem_id)
        # EDT-4: filter threads by writing language.
        lang = self.request.query_params.get("lang", "")
        if lang in ("ro", "en"):
            qs = qs.filter(lang=lang)
        # COM-2: editorial-discussion threads vs problem threads.
        topic = self.request.query_params.get("topic", "")
        if topic == "editorial":
            qs = qs.filter(editorial__isnull=False)
        elif topic == "problem":
            qs = qs.filter(editorial__isnull=True)
        editorial_id = self.request.query_params.get("editorial_id")
        if editorial_id:
            qs = qs.filter(editorial_id=editorial_id)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            thread = Thread.objects.create(
                title=serializer.validated_data["title"],
                problem=serializer.validated_data.get("problem"),
                editorial=serializer.validated_data.get("editorial"),
                lang=serializer.validated_data.get("lang", "") or "",
                author=request.user,
                post_count=1,
                last_activity=timezone.now(),
            )
            Post.objects.create(
                thread=thread,
                author=request.user,
                content=serializer.validated_data["content"],
            )
        return Response(
            ThreadListSerializer(thread, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        """Soft delete: hidden threads keep their audit trail."""
        thread = self.get_object()
        thread.is_hidden = True
        thread.save(update_fields=["is_hidden"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def pin(self, request, pk=None):
        thread = self.get_object()
        thread.is_pinned = not thread.is_pinned
        thread.save(update_fields=["is_pinned"])
        return Response({"is_pinned": thread.is_pinned})

    @action(detail=True, methods=["post"])
    def lock(self, request, pk=None):
        thread = self.get_object()
        thread.is_locked = not thread.is_locked
        thread.save(update_fields=["is_locked"])
        return Response({"is_locked": thread.is_locked})


class PostCursorPagination(NewestFirstCursorPagination):
    # New replies must not shift pages inside a thread.
    ordering = ("created_at", "id")


def _thread_from_url(thread_pk):
    return Thread.objects.get(pk=thread_pk)


class PostListCreateView(generics.ListCreateAPIView):
    """GET /forum/threads/{id}/posts/ + POST to reply.

    Cursor-paginated on created_at so new replies don't shift pages."""

    permission_classes = [permissions.AllowAny]
    pagination_class = PostCursorPagination
    serializer_class = PostSerializer

    def get_queryset(self):
        qs = Post.objects.filter(
            thread_id=self.kwargs["thread_pk"]
        ).select_related("author", "parent")
        user = self.request.user
        if not is_moderator(user):
            qs = qs.filter(is_hidden=False)
        return qs.order_by("created_at", "id")

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def create(self, request, *args, **kwargs):
        try:
            thread = _thread_from_url(self.kwargs["thread_pk"])
        except Thread.DoesNotExist:
            return Response(
                {"thread": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if thread.is_locked:
            return Response(
                {"thread": "This thread is locked."}, status=status.HTTP_400_BAD_REQUEST
            )
        if thread.is_hidden:
            return Response(
                {"thread": "This thread is hidden."}, status=status.HTTP_400_BAD_REQUEST
            )
        serializer = PostCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        parent = serializer.validated_data.get("parent")
        if parent is not None and parent.thread_id != thread.pk:
            return Response(
                {"parent": "Parent post belongs to another thread."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # COM-1: the spoiler flag only means something inside a
        # problem-scoped thread (a global thread has nothing to spoil).
        is_spoiler = bool(serializer.validated_data.get("is_spoiler"))
        if is_spoiler and thread.problem_id is None:
            return Response(
                {"is_spoiler": "Spoiler posts are only allowed inside "
                 "problem-scoped threads."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            post = Post.objects.create(
                thread=thread,
                author=request.user,
                content=serializer.validated_data["content"],
                parent=parent,
                is_spoiler=is_spoiler,
            )
            Thread.objects.filter(pk=thread.pk).update(
                post_count=F("post_count") + 1, last_activity=timezone.now()
            )
            transaction.on_commit(
                lambda: notify(
                    thread.author,
                    Notification.Verb.THREAD_REPLY,
                    actor=post.author,
                    target=thread,
                    data={"post_id": post.id, "title": thread.title},
                )
            )
        return Response(
            PostSerializer(post, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )


class PostDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /forum/posts/{id}/ — soft delete, author edit."""

    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrModerator]
    serializer_class = PostSerializer

    def get_queryset(self):
        qs = Post.objects.select_related("author", "thread")
        if not is_moderator(self.request.user):
            qs = qs.filter(is_hidden=False)
        return qs

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return PostUpdateSerializer
        return PostSerializer

    def perform_update(self, serializer):
        serializer.save(is_edited=True)

    def perform_destroy(self, instance):
        instance.is_hidden = True
        instance.hidden_reason = instance.hidden_reason or "removed by author/moderator"
        instance.save(update_fields=["is_hidden", "hidden_reason"])


class VoteView(generics.GenericAPIView):
    """POST /forum/posts/{id}/vote/ with {value: 1 | -1 | 0}.

    0 removes the vote; otherwise the (user, post) vote is created or
    updated, then the denormalized net score is recomputed with Sum.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = VoteSerializer

    def get_queryset(self):
        return Post.objects.all()

    def post(self, request, *args, **kwargs):
        try:
            post = Post.objects.get(pk=kwargs["pk"])
        except Post.DoesNotExist:
            return Response({"post": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        value = serializer.validated_data["value"]
        if value not in (1, -1, 0):
            return Response(
                {"value": "Must be 1, -1, or 0."}, status=status.HTTP_400_BAD_REQUEST
            )
        # RAT-10 (competitive roadmap): votes count only from accounts with
        # at least one accepted submission — the anti-brigading trust floor.
        from community_depth import services as community_services

        if not community_services.user_has_ac(request.user):
            return Response(
                {"detail": "Solve a problem before voting."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if value == 0:
            PostVote.objects.filter(user=request.user, post=post).delete()
        else:
            PostVote.objects.update_or_create(
                user=request.user, post=post, defaults={"value": value}
            )
        score = post.votes.aggregate(s=Sum("value"))["s"] or 0
        # RAT-10: clamp small negatives to 0 for display and auto-hide at
        # the threshold (audit trail stays) — rules see the RAW sum.
        community_services.apply_vote_rules(post, raw_score=score)
        post.save(update_fields=["upvotes", "is_hidden", "hidden_reason"])
        return Response({"upvotes": post.upvotes})


class ReportViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Report queue: authenticated create (duplicate reporter+post 409),
    moderator list/retrieve + resolve/dismiss."""

    queryset = Report.objects.select_related("reporter", "post", "resolved_by")
    serializer_class = ReportSerializer

    def get_permissions(self):
        if self.action == "create":
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsModerator()]

    def get_serializer_class(self):
        if self.action == "create":
            return ReportCreateSerializer
        return ReportSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = serializer.validated_data.get("post")
        if post is not None and Report.objects.filter(
            reporter=request.user, post=post
        ).exists():
            return Response(
                {"detail": "You already reported this post."},
                status=status.HTTP_409_CONFLICT,
            )
        report = serializer.save(reporter=request.user)
        return Response(
            ReportSerializer(report).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        report = self.get_object()
        resolve_action = request.data.get("action")
        if resolve_action not in ("resolved", "dismissed"):
            return Response(
                {"action": "Must be 'resolved' or 'dismissed'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        report.status = (
            Report.Status.RESOLVED
            if resolve_action == "resolved"
            else Report.Status.DISMISSED
        )
        report.resolution_note = request.data.get("note", "")
        report.resolved_by = request.user
        report.save(update_fields=["status", "resolution_note", "resolved_by"])
        return Response(ReportSerializer(report).data)
