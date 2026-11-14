"""Curated study tracks API (SPEC-GAPS X12 · competitive matrix row 8).

The ordered, curator-owned problem playlists every major judge ships
(LeetCode Explore cards, HackerRank practice domains, infoarena's
educational track). Public tracks list on the hub with per-viewer
progress; unlisted tracks stay reachable by slug for class use. Writes are
curator-gated (CREATOR/TEACHER/VERIFIER/ADMIN) and ride the global SP4
throttles every endpoint shares; reads are paginated (D-B4).
"""

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from users.models import User
from webcoder_api.pagination import StandardPageNumberPagination

from .models import Problem, ProblemList, ProblemListItem


def _can_curate(user) -> bool:
    """CREATOR/TEACHER and above may assemble tracks (the CON-9 role set)."""
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or user.is_staff
            or getattr(user, "role", "")
            in (
                User.Roles.ADMIN,
                User.Roles.PROBLEM_VERIFIER,
                User.Roles.PROBLEM_CREATOR,
                User.Roles.TEACHER,
            )
        )
    )


def _can_manage(track, user) -> bool:
    """The owner (or ADMIN/verifier staff) may edit a track."""
    if not (user and user.is_authenticated):
        return False
    if track.owner_id == user.id:
        return True
    return bool(
        user.is_superuser
        or user.is_staff
        or getattr(user, "role", "") in (User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER)
    )


def _unique_slug(title: str) -> str:
    """slugify(title) with a -2/-3… suffix on collision."""
    base = slugify(title) or "track"
    candidate, suffix = base, 1
    while ProblemList.objects.filter(slug=candidate).exists():
        suffix += 1
        candidate = "%s-%d" % (base, suffix)
    return candidate


def _solved_problem_ids(user, problem_ids) -> set:
    """Distinct APPROVED-track problems `user` has an AC on."""
    if user is None or not user.is_authenticated or not problem_ids:
        return set()
    return set(
        user.submissions.filter(problem_id__in=problem_ids, verdict="AC")
        .values_list("problem_id", flat=True)
        .distinct()
    )


class TrackSerializer(serializers.ModelSerializer):
    """Hub row: metadata + item count + the viewer's solved count."""

    owner_username = serializers.CharField(source="owner.username", read_only=True)
    item_count = serializers.SerializerMethodField()
    solved_count = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = ProblemList
        fields = [
            "slug",
            "title_i18n",
            "description_i18n",
            "owner_username",
            "is_public",
            "is_owner",
            "item_count",
            "solved_count",
            "created_at",
            "updated_at",
        ]

    def _viewer(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return user if (user and user.is_authenticated) else None

    def get_item_count(self, obj) -> int:
        count = getattr(obj, "prefetched_item_count", None)
        if count is None:
            count = obj.items.count()
        return count

    def get_solved_count(self, obj):
        viewer = self._viewer()
        if viewer is None:
            return None
        return len(
            _solved_problem_ids(
                viewer, list(obj.items.values_list("problem_id", flat=True))
            )
        )

    def get_is_owner(self, obj) -> bool:
        viewer = self._viewer()
        return bool(viewer and obj.owner_id == viewer.id)


class TrackItemSerializer(serializers.Serializer):
    """One ordered problem inside a track, with the viewer's solved flag."""

    problem_id = serializers.IntegerField()
    title_i18n = serializers.JSONField(source="problem.title_i18n")
    difficulty = serializers.CharField(source="problem.difficulty")
    position = serializers.IntegerField()
    is_solved = serializers.SerializerMethodField()

    def get_is_solved(self, obj) -> bool:
        solved_ids = self.context.get("solved_ids") or set()
        return obj.problem_id in solved_ids


class TrackDetailSerializer(TrackSerializer):
    items = serializers.SerializerMethodField()

    class Meta(TrackSerializer.Meta):
        fields = TrackSerializer.Meta.fields + ["items"]

    def get_items(self, obj):
        qs = obj.items.select_related("problem").order_by("position", "id")
        if not _can_curate(self._viewer()):
            # Public readers only ever see APPROVED members (D-J3 gate).
            qs = qs.filter(problem__status=Problem.ProblemStatus.APPROVED)
        rows = list(qs)
        solved_ids = _solved_problem_ids(
            self._viewer(), [item.problem_id for item in rows]
        )
        return TrackItemSerializer(
            rows, many=True, context={"solved_ids": solved_ids}
        ).data


class TrackCreateSerializer(serializers.Serializer):
    """POST body for a new track: EN title required, RO mirror optional."""

    title_en = serializers.CharField(max_length=200)
    title_ro = serializers.CharField(max_length=200, required=False, allow_blank=True)
    description_en = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, default=""
    )
    description_ro = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, default=""
    )
    is_public = serializers.BooleanField(default=True)


class TrackUpdateSerializer(serializers.Serializer):
    """PATCH body: any subset of the bilingual text + visibility fields."""

    title_en = serializers.CharField(max_length=200, required=False)
    title_ro = serializers.CharField(max_length=200, required=False, allow_blank=True)
    description_en = serializers.CharField(
        max_length=2000, required=False, allow_blank=True
    )
    description_ro = serializers.CharField(
        max_length=2000, required=False, allow_blank=True
    )
    is_public = serializers.BooleanField(required=False)


class ProblemIdSerializer(serializers.Serializer):
    problem_id = serializers.IntegerField()


class MoveProblemSerializer(ProblemIdSerializer):
    direction = serializers.ChoiceField(choices=["up", "down"])


class TrackViewSet(viewsets.ModelViewSet):
    """/api/v1/problems/tracks/ — public hub + curator authoring."""

    lookup_field = "slug"
    lookup_value_regex = "[^/]+"
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        qs = ProblemList.objects.select_related("owner").annotate(
            prefetched_item_count=Count("items")
        )
        staff = user.is_authenticated and (
            user.is_staff
            or getattr(user, "role", "")
            in (User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER)
        )
        if not staff:
            # Everyone sees public tracks; owners additionally see their
            # own unlisted ones (class-handout slugs). Anonymous viewers
            # get the public-only set (an unsaved user in an FK filter is
            # invalid, hence the conditional clause).
            condition = Q(is_public=True)
            if user.is_authenticated:
                condition |= Q(owner=user)
            qs = qs.filter(condition)
        return qs

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TrackDetailSerializer
        return TrackSerializer

    def create(self, request):
        if not _can_curate(request.user):
            return Response(
                {"detail": "Only creators, teachers and verifiers may build tracks."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = TrackCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        track = ProblemList.objects.create(
            title_i18n={
                "en": data["title_en"],
                "ro": data.get("title_ro") or data["title_en"],
            },
            description_i18n={
                "en": data.get("description_en", ""),
                "ro": data.get("description_ro", ""),
            },
            slug=_unique_slug(data["title_en"]),
            owner=request.user,
            is_public=data["is_public"],
        )
        return Response(
            TrackSerializer(track, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        """Full PUT mirrors PATCH here: both apply the partial text update."""
        return self.partial_update(request, *args, **kwargs)

    def partial_update(self, request, slug=None):
        track = get_object_or_404(ProblemList, slug=slug)
        if not _can_manage(track, request.user):
            return Response(
                {"detail": "Only the owner or a verifier may edit this track."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = TrackUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        title = dict(track.title_i18n or {})
        description = dict(track.description_i18n or {})
        if "title_en" in data:
            title["en"] = data["title_en"]
        if "title_ro" in data:
            title["ro"] = data["title_ro"]
        if "description_en" in data:
            description["en"] = data["description_en"]
        if "description_ro" in data:
            description["ro"] = data["description_ro"]
        track.title_i18n = title
        track.description_i18n = description
        if "is_public" in data:
            track.is_public = data["is_public"]
        track.save()
        return Response(TrackSerializer(track, context={"request": request}).data)

    def destroy(self, request, slug=None):
        track = get_object_or_404(ProblemList, slug=slug)
        if not _can_manage(track, request.user):
            return Response(
                {"detail": "Only the owner or a verifier may delete this track."},
                status=status.HTTP_403_FORBIDDEN,
            )
        track.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="add-problem")
    def add_problem(self, request, slug=None):
        track = get_object_or_404(ProblemList, slug=slug)
        if not _can_manage(track, request.user):
            return Response(
                {"detail": "Only the owner or a verifier may edit this track."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = ProblemIdSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        problem = Problem.objects.filter(
            pk=payload.validated_data["problem_id"]
        ).first()
        if problem is None:
            return Response(
                {"detail": "Problem not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if problem.status != Problem.ProblemStatus.APPROVED:
            # Tracks only ever reference the APPROVED pool (the CON-9
            # discipline): a public playlist must not leak drafts.
            return Response(
                {"detail": "Only APPROVED problems may join a track."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _, created = ProblemListItem.objects.get_or_create(
            list=track, problem=problem, defaults={"position": track.items.count() + 1}
        )
        if not created:
            return Response(
                {"detail": "Problem already in this track."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            TrackDetailSerializer(track, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="remove-problem")
    def remove_problem(self, request, slug=None):
        track = get_object_or_404(ProblemList, slug=slug)
        if not _can_manage(track, request.user):
            return Response(
                {"detail": "Only the owner or a verifier may edit this track."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = ProblemIdSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        deleted, _ = ProblemListItem.objects.filter(
            list=track, problem_id=payload.validated_data["problem_id"]
        ).delete()
        if not deleted:
            return Response(
                {"detail": "Problem not in this track."},
                status=status.HTTP_404_NOT_FOUND,
            )
        _renumber(track)
        return Response(TrackDetailSerializer(track, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="move-problem")
    def move_problem(self, request, slug=None):
        track = get_object_or_404(ProblemList, slug=slug)
        if not _can_manage(track, request.user):
            return Response(
                {"detail": "Only the owner or a verifier may edit this track."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = MoveProblemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        ordered = list(track.items.order_by("position", "id"))
        index = next(
            (
                i
                for i, item in enumerate(ordered)
                if item.problem_id == payload.validated_data["problem_id"]
            ),
            None,
        )
        if index is None:
            return Response(
                {"detail": "Problem not in this track."},
                status=status.HTTP_404_NOT_FOUND,
            )
        direction = payload.validated_data["direction"]
        swap_with = index - 1 if direction == "up" else index + 1
        if swap_with < 0 or swap_with >= len(ordered):
            return Response(
                {"detail": "Already at the edge of the track."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Assign index-derived positions: deterministic even when the two
        # rows carried equal positions.
        item, other = ordered[index], ordered[swap_with]
        item.position, other.position = swap_with + 1, index + 1
        item.save(update_fields=["position"])
        other.save(update_fields=["position"])
        _renumber(track)
        return Response(TrackDetailSerializer(track, context={"request": request}).data)


def _renumber(track: ProblemList) -> None:
    """Re-seal 1..n positions after a removal or swap."""
    for new_position, item in enumerate(
        track.items.order_by("position", "id"), start=1
    ):
        if item.position != new_position:
            item.position = new_position
            item.save(update_fields=["position"])
