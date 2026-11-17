"""Wave E learning-engine API (items 29/30/33/34/35).

All endpoints are read-only derivations over the caller's own data (plus
the public skill graph and theory cards). Authenticated throughout —
these are personal learning surfaces.
"""

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from problems.models import Tag
from users.statistics import tag_skill_profile

from .engine import mistake_profile, practice_plan, review_queue
from .models import SkillEdge, TheoryCard


class ReviewQueueView(APIView):
    """GET /api/v1/learning/review-queue/ (item 29)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cards = review_queue(request.user)
        return Response(
            {
                "count": len(cards),
                "due": sum(1 for c in cards if c["due"]),
                "results": cards,
            }
        )


class PracticePlanView(APIView):
    """GET /api/v1/learning/practice-plan/ (item 34)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(practice_plan(request.user))


class MistakeProfileView(APIView):
    """GET /api/v1/learning/mistake-profile/ (item 35)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(mistake_profile(request.user))


class SkillGraphView(APIView):
    """GET /api/v1/learning/skills/ (item 30): the tag graph with the
    caller's mastery per node. A node is unlocked when every incoming
    prerequisite has at least one AC from this user."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = tag_skill_profile(request.user)
        # tag_skill_profile keys rows by the tag's EN name (slug fallback)
        # and carries solved/attempted/points — the graph maps that onto
        # slugs and derives a 0-100 mastery bar from ladder points.
        rows = {row["tag"]: row for row in profile.get("tags", [])}
        edges = list(SkillEdge.objects.select_related("from_tag", "to_tag"))
        solved_tags = {
            tag.slug
            for tag in Tag.objects.all()
            if rows.get((tag.name_i18n or {}).get("en") or tag.slug, {}).get(
                "solved", 0
            )
            > 0
        }
        nodes = []
        for tag in Tag.objects.all():
            name = (tag.name_i18n or {}).get("en") or tag.slug
            row = rows.get(name)
            prereqs = [e.from_tag.slug for e in edges if e.to_tag_id == tag.id]
            unlocked = all(p in solved_tags for p in prereqs)
            points = row["points"] if row else 0
            nodes.append(
                {
                    "slug": tag.slug,
                    "name_i18n": tag.name_i18n,
                    "prerequisites": prereqs,
                    "unlocked": unlocked,
                    "solved": row["solved"] if row else 0,
                    "attempted": row["attempted"] if row else 0,
                    "points": points,
                }
            )
        return Response(
            {
                "count": len(nodes),
                "edges": [
                    {"from": e.from_tag.slug, "to": e.to_tag.slug} for e in edges
                ],
                "nodes": nodes,
                "suggestion": profile.get("practice_next"),
            }
        )


class TheoryCardsView(APIView):
    """GET /api/v1/learning/theory/?tag= (item 33): the public deck."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        qs = TheoryCard.objects.select_related("tag").order_by("order", "id")
        tag_slug = request.query_params.get("tag")
        if tag_slug:
            qs = qs.filter(tag__slug=tag_slug)
        return Response(
            {
                "count": qs.count(),
                "results": [
                    {
                        "id": card.id,
                        "tag": card.tag.slug,
                        "front_ro": card.front_ro,
                        "front_en": card.front_en,
                        "back_ro": card.back_ro,
                        "back_en": card.back_en,
                    }
                    for card in qs
                ],
            }
        )


class DrillsView(APIView):
    """GET /api/v1/learning/drills/?kind= (items 36/37/38): the deck.

    Options ride the payload WITHOUT the answer (answers go through the
    answer endpoint); explanations are revealed on a correct reply.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from .models import Drill

        qs = Drill.objects.select_related("tag").order_by("kind", "order", "id")
        kind = request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        rows = [
            {
                "id": d.id,
                "kind": d.kind,
                "tag": d.tag.slug,
                "code": d.payload.get("code", ""),
                "question_ro": d.payload.get("question_ro", ""),
                "question_en": d.payload.get("question_en", ""),
                "options_ro": d.payload.get("options_ro"),
                "options_en": d.payload.get("options_en"),
            }
            for d in qs
        ]
        return Response({"count": len(rows), "results": rows})


class DrillAnswerView(APIView):
    """POST /api/v1/learning/drills/{id}/answer/ {answer}: check + reveal."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, drill_id: int):
        from .drills import check_answer
        from .models import Drill

        drill = Drill.objects.filter(pk=drill_id).first()
        if drill is None:
            return Response({"detail": "Not found."}, status=404)
        correct, error = check_answer(drill, request.data.get("answer"))
        payload = drill.payload or {}
        return Response(
            {
                "correct": correct,
                "error": error,
                # The explanation is the reward: revealed only on a
                # correct reply (cheap spoiler gate; the code is public).
                "explanation_ro": payload.get("explanation_ro") if correct else "",
                "explanation_en": payload.get("explanation_en") if correct else "",
                "accepted": payload.get("accepted") if correct else None,
            }
        )


class DailyDrillsView(APIView):
    """GET /api/v1/learning/drills/daily/ (item 40): the deterministic
    warmup set — one drill per kind, same for everyone today."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from .drills import daily_drills

        rows = [
            {
                "id": d.id,
                "kind": d.kind,
                "tag": d.tag.slug,
                "code": (d.payload or {}).get("code", ""),
                "question_ro": (d.payload or {}).get("question_ro", ""),
                "question_en": (d.payload or {}).get("question_en", ""),
                "options_ro": (d.payload or {}).get("options_ro"),
                "options_en": (d.payload or {}).get("options_en"),
            }
            for d in daily_drills()
        ]
        return Response({"count": len(rows), "results": rows})
