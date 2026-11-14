"""Certificate API — public verification + holder lists + admin revoke.

- ``GET /api/v1/certificates/verify/<uuid>/`` — ANONYMOUS: the employer /
  teacher flow (H-120 verifiable participation certificates). Answers
  VALID or REVOKED (with reason) — a revoked atestat stays answerable.
- ``GET /api/v1/certificates/mine/`` — the holder's list (paginated).
- ``GET /api/v1/certificates/?username=`` — public per-user list for
  profiles; LEG-2: minors never appear.
- ``POST /api/v1/certificates/<pk>/revoke/`` — admin integrity action
  (DQ / rollback aftermath), audit-logged via the admin log.
"""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import IsAdminUser

from .models import Certificate
from .serializers import CertificateSerializer


class CertificateVerifyView(APIView):
    """Anonymous verification by the public UUID printed on the atestat."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, certificate_uuid):
        certificate = get_object_or_404(
            Certificate.objects.select_related("user"), uuid=certificate_uuid
        )
        return Response(CertificateSerializer(certificate).data)


class MyCertificatesView(ListAPIView):
    """The logged-in holder's atestats (newest first, paginated)."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CertificateSerializer

    def get_queryset(self):
        return (
            Certificate.objects.filter(user=self.request.user)
            .select_related("user")
            .order_by("-issued_at", "-id")
        )


class UserCertificatesView(ListAPIView):
    """Public per-user list (``?username=``) for profile pages.

    Minors are excluded end-to-end (LEG-2): their atestats exist for the
    holder and the direct verification URL, but never surface in public
    listings.
    """

    permission_classes = [permissions.AllowAny]
    serializer_class = CertificateSerializer

    def get_queryset(self):
        queryset = (
            Certificate.objects.filter(user__is_minor=False, user__is_active=True)
            .select_related("user")
            .order_by("-issued_at", "-id")
        )
        username = self.request.query_params.get("username")
        if username:
            queryset = queryset.filter(user__username=username)
        return queryset


class RevokeCertificateView(APIView):
    """Admin integrity action: revoke with a mandatory reason."""

    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        certificate = get_object_or_404(Certificate, pk=pk)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"detail": "A revocation reason is required."}, status=400)
        certificate.revoked_at = certificate.revoked_at or timezone.now()
        certificate.revoked_reason = certificate.revoked_reason or reason[:200]
        certificate.save(update_fields=["revoked_at", "revoked_reason"])
        return Response(CertificateSerializer(certificate).data)
