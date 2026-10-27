"""Classroom API (competitive roadmap Wave B: EDU-1/2/3/5/6).

Surface (all under ``/api/v1/classroom/``):

- ``GET/POST /classes/``                    teacher: list own / create
- ``GET/PATCH/DELETE /classes/{id}/``       owning teacher (or ADMIN)
- ``GET /classes/{id}/members/``            roster (owning teacher/ADMIN)
- ``POST /classes/join/``                   student self-join (code [+pw])
- ``GET /my-classes/``                      student: memberships + counts
- ``GET/POST /assignments/?classroomId=``   teacher CRUD (list: teacher's
  classes for teachers, member's classes for students)
- ``GET/PATCH/DELETE /assignments/{id}/``   owning teacher; members read
- ``GET /assignments/{id}/grid/``           EDU-5 progress matrix (teacher)
- ``GET /assignments/{id}/export/``         EDU-6 CSV gradebook (teacher)
- ``GET /my-assignments/``                  student: assignments + my state

Publishing an assignment notifies every class member (D-B10), wrapped in
``transaction.on_commit`` per the notifications service contract.
"""

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from notifications.models import Notification
from notifications.services import notify
from users.models import User
from webcoder_api.pagination import StandardPageNumberPagination

from .export import grid_csv
from .grid import assignment_grid
from .models import Assignment, ClassMembership, ClassRoom
from .permissions import IsTeacher, is_teacher
from .serializers import (
    AssignmentSerializer,
    ClassMembershipSerializer,
    ClassRoomSerializer,
    JoinClassSerializer,
)


def _can_manage_classroom(user, classroom) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (
            classroom.teacher_id == user.id
            or user.role == User.Roles.ADMIN
            or user.is_superuser
        )
    )


class ClassRoomViewSet(viewsets.ModelViewSet):
    """Teacher-owned classes (EDU-1). Students reach theirs via my-classes."""

    serializer_class = ClassRoomSerializer
    pagination_class = StandardPageNumberPagination

    def get_permissions(self):
        if self.action in ("list", "retrieve", "join", "my_classes"):
            # Reads narrow via the scoped queryset; the write paths below
            # stay teacher-only.
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsTeacher()]

    def get_queryset(self):
        user = self.request.user
        qs = ClassRoom.objects.select_related("teacher").all()
        if user.role == User.Roles.ADMIN or user.is_superuser:
            return qs
        if is_teacher(user):
            # Teachers see their own classes — never another teacher's
            # roster (the join code stays the owner's secret either way).
            return qs.filter(teacher=user)
        # Non-teachers only see classes they joined.
        return qs.filter(memberships__student=user)

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        # Scoped queryset: teachers see their classes, students the ones
        # they joined, admins everything; anything else 404s.
        return Response(self.get_serializer(self.get_object()).data)

    # update/destroy/members need no extra guards: IsTeacher gates the
    # action and the teacher-scoped queryset 404s every non-owner
    # (students 403 at the permission layer, foreign teachers 404).

    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        """Roster for the owning teacher / ADMIN (EDU-1 member list)."""
        classroom = self.get_object()
        memberships = classroom.memberships.select_related("student").all()
        return Response(ClassMembershipSerializer(memberships, many=True).data)

    @action(detail=False, methods=["post"], url_path="join")
    def join(self, request):
        """Student self-join with code (+ optional password) — EDU-1.

        Wrong code and wrong password both answer 400 ``invalid_code_or_password``
        so the endpoint cannot be used to enumerate codes.
        """
        self.throttle_classes = [ScopedRateThrottle]
        self.throttle_scope = "auth"  # reuse the strict credential scope
        serializer = JoinClassSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"].strip().upper()
        password = serializer.validated_data.get("password", "")
        classroom = ClassRoom.objects.filter(join_code=code).first()
        if classroom is None or not classroom.check_join_password(password):
            return Response(
                {"detail": "invalid_code_or_password"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not classroom.is_open:
            return Response(
                {"detail": "This class is closed for joining."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        membership, created = ClassMembership.objects.get_or_create(
            classroom=classroom, student=request.user
        )
        if not created:
            return Response(
                {"detail": "Already a member of this class.",
                 "classroom_id": classroom.id},
                status=status.HTTP_200_OK,
            )
        return Response(
            {
                "detail": "Joined.",
                "classroom_id": classroom.id,
                "membership_id": membership.id,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="my-classes")
    def my_classes(self, request):
        """The caller's memberships with class meta + open-assignment count."""
        memberships = (
            ClassMembership.objects.filter(student=request.user)
            .select_related("classroom", "classroom__teacher")
            .order_by("-joined_at")
        )
        now = timezone.now()
        results = []
        for membership in memberships:
            classroom = membership.classroom
            open_count = sum(
                1
                for a in classroom.assignments.all()
                if a.state(now) == Assignment.State.OPEN
            )
            results.append(
                {
                    "membership_id": membership.id,
                    "joined_at": membership.joined_at,
                    "classroom": ClassRoomSerializer(
                        classroom, context=self.get_serializer_context()
                    ).data,
                    "open_assignments": open_count,
                }
            )
        return Response({"results": results})


class AssignmentViewSet(viewsets.ModelViewSet):
    """Assignments (teme) with windows + lifecycle (EDU-2/EDU-3).

    Teachers manage their classes' assignments; members read. Creating an
    assignment notifies the class (D-B10 nav badge, pbinfo's "you have
    homework" signal).
    """

    serializer_class = AssignmentSerializer
    pagination_class = StandardPageNumberPagination

    def get_permissions(self):
        if self.action in ("list", "retrieve", "my_assignments", "grid", "export"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsTeacher()]

    def get_queryset(self):
        user = self.request.user
        qs = Assignment.objects.select_related("classroom", "classroom__teacher")
        classroom_id = self.request.query_params.get("classroomId")
        if classroom_id:
            qs = qs.filter(classroom_id=classroom_id)
        if user.role == User.Roles.ADMIN or user.is_superuser:
            return qs
        if is_teacher(user):
            return qs.filter(classroom__teacher=user)
        return qs.filter(classroom__memberships__student=user)

    def perform_create(self, serializer):
        assignment = serializer.save()
        members = [
            m.student
            for m in assignment.classroom.memberships.select_related("student")
        ]

        def _notify_members():
            for member in members:
                notify(
                    member,
                    Notification.Verb.ASSIGNMENT_PUBLISHED,
                    actor=self.request.user,
                    target=assignment,
                    data={"classroom": assignment.classroom.name},
                )

        transaction.on_commit(_notify_members)

    def retrieve(self, request, *args, **kwargs):
        # The scoped queryset already restricts rows to the caller's own
        # classes (teachers) or joined classes (students); unknown ids 404.
        return Response(self.get_serializer(self.get_object()).data)

    # Same reasoning as ClassRoomViewSet: IsTeacher + the scoped queryset
    # already restrict writes to the owning teacher / ADMIN.

    @action(detail=True, methods=["get"])
    def grid(self, request, pk=None):
        """EDU-5 progress matrix — owning teacher / ADMIN only."""
        assignment = self.get_object()
        if not _can_manage_classroom(request.user, assignment.classroom):
            return Response(
                {"detail": "Only the teacher can view the progress grid."},
                status=status.HTTP_403_FORBIDDEN,
            )
        data = assignment_grid(assignment)
        return Response(
            {
                "assignment_id": assignment.id,
                "students": [
                    {"id": s.id, "username": s.username} for s in data["students"]
                ],
                "problems": [
                    {
                        "id": ap.id,
                        "problem_id": ap.problem_id,
                        "label": ap.label,
                        "points": ap.points,
                        "title_i18n": ap.problem.title_i18n,
                    }
                    for ap in data["problems"]
                ],
                # JSON keys must be strings: "student_id:problem_id" -> cell.
                "cells": {
                    f"{student_id}:{problem_id}": cell
                    for (student_id, problem_id), cell in data["cells"].items()
                },
            }
        )

    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        """EDU-6 CSV gradebook — owning teacher / ADMIN only."""
        assignment = self.get_object()
        if not _can_manage_classroom(request.user, assignment.classroom):
            return Response(
                {"detail": "Only the teacher can export the gradebook."},
                status=status.HTTP_403_FORBIDDEN,
            )
        csv_content = grid_csv(assignment)
        response = HttpResponse(csv_content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="assignment-{assignment.id}-grades.csv"'
        )
        return response

    @action(detail=False, methods=["get"], url_path="my-assignments")
    def my_assignments(self, request):
        """Student view: assignments across my classes with my progress.

        pbinfo's persistent "you have homework" signal — one row per
        assignment, state derived (SCHEDULED/OPEN/CLOSED), plus per-problem
        best score so the teme page needs no extra round-trip.
        """
        memberships = ClassMembership.objects.filter(
            student=request.user
        ).values_list("classroom_id", flat=True)
        assignments = (
            Assignment.objects.filter(classroom_id__in=list(memberships))
            .select_related("classroom")
            .prefetch_related("assignment_problems")
            .order_by("-available_from")
        )
        now = timezone.now()
        results = []
        for assignment in assignments:
            problems = []
            solved = 0
            for ap in assignment.assignment_problems.all():
                best = None
                subs = ap.problem.submissions.filter(
                    user=request.user,
                    submission_time__gte=assignment.available_from,
                    submission_time__lte=assignment.effective_due_at,
                ).order_by("id")
                for sub in subs:
                    score = sub.score if sub.score is not None else 0
                    if best is None or score > best:
                        best = score
                if best is not None and best >= ap.points:
                    solved += 1
                problems.append(
                    {
                        "problem_id": ap.problem_id,
                        "label": ap.label,
                        "points": ap.points,
                        "best_score": best,
                    }
                )
            results.append(
                {
                    "id": assignment.id,
                    "classroom_id": assignment.classroom_id,
                    "classroom_name": assignment.classroom.name,
                    "title_i18n": assignment.title_i18n,
                    "description": assignment.description,
                    "available_from": assignment.available_from,
                    "due_at": assignment.due_at,
                    "late_until": assignment.late_until,
                    "is_exam": assignment.is_exam,
                    "state": assignment.state(now),
                    "problems": problems,
                    "solved_count": solved,
                }
            )
        return Response({"results": results})
