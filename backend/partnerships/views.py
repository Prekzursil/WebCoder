"""Item 147 — public application + owner review endpoints.

- ``POST /api/v1/partnerships/apply/`` — public (anonymous schools may
  apply), throttled by IP (`partnership_apply`, 5/hour): the same
  anti-flood reasoning as the translation queue.
- ``GET /api/v1/partnerships/requests/`` — ADMIN: the review queue.
- ``PATCH /api/v1/partnerships/requests/{id}/`` — ADMIN: status +
  review note. PENDING→CONTACTED→ACTIVE/DECLINED only (no resurrection
  of DECLINED without a fresh application — the audit stays honest).
"""

from django.core.validators import EmailValidator, ValidationError
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import SchoolPartnershipRequest

_ALLOWED_TRANSITIONS = {
    SchoolPartnershipRequest.Status.PENDING: {
        SchoolPartnershipRequest.Status.CONTACTED,
        SchoolPartnershipRequest.Status.DECLINED,
    },
    SchoolPartnershipRequest.Status.CONTACTED: {
        SchoolPartnershipRequest.Status.ACTIVE,
        SchoolPartnershipRequest.Status.DECLINED,
    },
    SchoolPartnershipRequest.Status.ACTIVE: set(),
    SchoolPartnershipRequest.Status.DECLINED: set(),
}


def _row(request_row) -> dict:
    return {
        "id": request_row.pk,
        "school_name": request_row.school_name,
        "city": request_row.city,
        "country": request_row.country,
        "contact_name": request_row.contact_name,
        "contact_email": request_row.contact_email,
        "estimated_students": request_row.estimated_students,
        "message": request_row.message,
        "status": request_row.status,
        "review_note": request_row.review_note,
        "created_at": request_row.created_at,
    }


class ApplyView(APIView):
    """Public, throttled, validation-hardened application intake."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "partnership_apply"

    def post(self, request):
        data = request.data
        required = ("school_name", "city", "contact_name", "contact_email")
        missing = [
            field for field in required if not str(data.get(field) or "").strip()
        ]
        if missing:
            return Response(
                {"detail": f"missing fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        email = str(data["contact_email"]).strip()
        try:
            EmailValidator()(email)
        except ValidationError:
            return Response(
                {"detail": "invalid contact email"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        students = data.get("estimated_students", 0)
        try:
            students = max(0, int(students))
        except (TypeError, ValueError):
            return Response(
                {"detail": "estimated_students must be a number"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row = SchoolPartnershipRequest.objects.create(
            school_name=str(data["school_name"]).strip()[:200],
            city=str(data["city"]).strip()[:120],
            country=str(data.get("country") or "Romania").strip()[:120],
            contact_name=str(data["contact_name"]).strip()[:120],
            contact_email=email,
            estimated_students=students,
            message=str(data.get("message") or "").strip()[:4000],
        )
        return Response(
            {"id": row.pk, "status": row.status}, status=status.HTTP_201_CREATED
        )


class RequestsView(APIView):
    """GET the review queue (ADMIN)."""

    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]

    def get(self, request):
        rows = SchoolPartnershipRequest.objects.order_by("-created_at")[:200]
        return Response(
            {
                "pending": SchoolPartnershipRequest.objects.filter(
                    status=SchoolPartnershipRequest.Status.PENDING
                ).count(),
                "requests": [_row(row) for row in rows],
            }
        )


class ReviewView(APIView):
    """PATCH status + note (ADMIN), transition-guarded."""

    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]

    def patch(self, request, request_id):
        row = SchoolPartnershipRequest.objects.filter(pk=request_id).first()
        if row is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        new_status = str(request.data.get("status") or "").strip().upper()
        valid = {value for value in SchoolPartnershipRequest.Status.values}
        if new_status not in valid:
            return Response(
                {"detail": "invalid status"}, status=status.HTTP_400_BAD_REQUEST
            )
        allowed = _ALLOWED_TRANSITIONS[SchoolPartnershipRequest.Status(row.status)]
        if SchoolPartnershipRequest.Status(new_status) not in allowed:
            return Response(
                {
                    "detail": (
                        f"cannot move {row.status} → {new_status}; "
                        "declined/active requests need a fresh application"
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        row.status = new_status
        note = str(request.data.get("review_note") or "").strip()
        if note:
            row.review_note = note[:2000]
        row.save(update_fields=["status", "review_note"])
        return Response(_row(row))
