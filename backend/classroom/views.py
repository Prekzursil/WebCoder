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
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from notifications.models import Notification
from notifications.services import notify
from users.models import User
from webcoder_api.pagination import StandardPageNumberPagination

from .export import grid_csv
from .grid import assignment_grid
from .models import (
    Assignment,
    ClassMembership,
    ClassRoom,
    MCQItem,
    QuizSubmission,
    UploadedDeliverable,
)
from .permissions import IsTeacher, is_teacher
from .serializers import (
    AssignmentSerializer,
    ClassMembershipSerializer,
    MCQItemSerializer,
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
        if assignment.kind == Assignment.Kind.QUIZ:
            return Response(_quiz_grid_payload(assignment))
        if assignment.kind == Assignment.Kind.FILES:
            return Response(_files_grid_payload(assignment))
        data = assignment_grid(assignment)
        return Response(
            {
                "assignment_id": assignment.id,
                "kind": Assignment.Kind.PROBLEMS,
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


# ---------------------------------------------------------------------------
# Wave C: EDU-7 quiz/file teme + EDU-8 MCQ bank + EDU-4 exam status
# ---------------------------------------------------------------------------

class MCQItemViewSet(viewsets.ModelViewSet):
    """EDU-8 — the Bacalaureat-style MCQ bank.

    Reads are authenticated (bank browsing for teachers + students);
    writes are TEACHER/ADMIN. Filters: discipline, grade, bacYear, chapter.
    """

    serializer_class = MCQItemSerializer
    pagination_class = StandardPageNumberPagination

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsTeacher()]

    def get_queryset(self):
        qs = MCQItem.objects.all().select_related("chapter")
        params = self.request.query_params
        discipline = params.get("discipline")
        if discipline:
            qs = qs.filter(discipline__iexact=discipline)
        grade = params.get("grade")
        if grade:
            qs = qs.filter(grade=grade)
        bac_year = params.get("bacYear")
        if bac_year:
            qs = qs.filter(bac_year=bac_year)
        chapter = params.get("chapter")
        if chapter:
            qs = qs.filter(chapter_id=chapter)
        return qs.order_by("grade", "id")

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


def _quiz_payload(assignment, request):
    """Student-facing quiz sheet: per-student shuffled variant order, no
    correct indices; teachers additionally receive them for review."""
    from .quiz import shuffle_order

    links = list(
        assignment.quiz_items.select_related("item").order_by("order", "id")
    )
    items = []
    for link in links:
        order = shuffle_order(assignment, request.user.id)
        items.append(
            {
                "item_id": link.item_id,
                "order": link.order,
                "question_i18n": link.item.question_i18n,
                "variants_en": [link.item.variants_en[i] for i in order],
                "variants_ro": [link.item.variants_ro[i] for i in order],
                "correct_index": (
                    link.item.correct_index
                    if _can_manage_classroom(request.user, assignment.classroom)
                    else None
                ),
            }
        )
    return {
        "assignment": assignment.id,
        "kind": "QUIZ",
        "shuffle": assignment.quiz_shuffle,
        "state": assignment.state(),
        "items": items,
    }





def _fetch_assignment_or_404(pk, user):
    """Assignment visible to *user* (teacher of the class, member, or admin)."""
    from django.shortcuts import get_object_or_404

    assignment = get_object_or_404(
        Assignment.objects.select_related("classroom"), pk=pk
    )
    is_member = ClassMembership.objects.filter(
        classroom=assignment.classroom, student=user
    ).exists()
    if _can_manage_classroom(user, assignment.classroom) or is_member:
        return assignment
    return None


@api_view(["GET"])
def assignment_quiz_view(request, assignment_id):
    """GET /assignments/{id}/quiz/ — the student's shuffled sheet (EDU-7)."""
    if not request.user.is_authenticated:
        return Response({"detail": "Authentication required."}, status=401)
    assignment = _fetch_assignment_or_404(assignment_id, request.user)
    if assignment is None:
        return Response({"detail": "Not found."}, status=404)
    if assignment.kind != Assignment.Kind.QUIZ:
        return Response(
            {"detail": "This assignment is not a quiz."}, status=400
        )
    return Response(_quiz_payload(assignment, request))


@api_view(["POST"])
def quiz_submit_view(request, assignment_id):
    """POST /assignments/{id}/quiz/submit/ — auto-grade one attempt (EDU-8)."""
    if not request.user.is_authenticated:
        return Response({"detail": "Authentication required."}, status=401)
    assignment = _fetch_assignment_or_404(assignment_id, request.user)
    if assignment is None:
        return Response({"detail": "Not found."}, status=404)
    if assignment.kind != Assignment.Kind.QUIZ:
        return Response({"detail": "This assignment is not a quiz."}, status=400)
    if assignment.state() != Assignment.State.OPEN:
        return Response(
            {"detail": "The quiz window is closed (late work is not graded)."},
            status=400,
        )
    answers = request.data.get("answers")
    if not isinstance(answers, dict):
        return Response(
            {"answers": "Send {item_id: chosen_index}."}, status=400
        )
    from .quiz import grade_answers
    from .serializers import QuizSubmissionSerializer

    graded = grade_answers(assignment, request.user, answers)
    submission = QuizSubmission.objects.create(
        assignment=assignment, student=request.user, **graded
    )
    return Response(QuizSubmissionSerializer(submission).data, status=201)


@api_view(["GET"])
def quiz_stats_view(request, assignment_id):
    """GET /assignments/{id}/quiz/stats/ — per-item correctness (teacher)."""
    if not request.user.is_authenticated:
        return Response({"detail": "Authentication required."}, status=401)
    assignment = _fetch_assignment_or_404(assignment_id, request.user)
    if assignment is None:
        return Response({"detail": "Not found."}, status=404)
    if not _can_manage_classroom(request.user, assignment.classroom):
        return Response(
            {"detail": "Only the teacher can view quiz statistics."}, status=403
        )
    from .quiz import item_stats

    return Response(
        {"assignment": assignment.id, "items": item_stats(assignment)}
    )


@api_view(["GET", "POST"])
def deliverables_view(request, assignment_id):
    """GET/POST /assignments/{id}/deliverables/ — FILES teme (EDU-7)."""
    if not request.user.is_authenticated:
        return Response({"detail": "Authentication required."}, status=401)
    assignment = _fetch_assignment_or_404(assignment_id, request.user)
    if assignment is None:
        return Response({"detail": "Not found."}, status=404)
    is_teacher_view = _can_manage_classroom(request.user, assignment.classroom)
    if assignment.kind != Assignment.Kind.FILES:
        return Response(
            {"detail": "This assignment does not take file uploads."}, status=400
        )
    if request.method == "GET":
        qs = assignment.deliverables.select_related("student").order_by(
            "student__username", "-uploaded_at"
        )
        if not is_teacher_view:
            qs = qs.filter(student=request.user)
        return Response(
            {
                "assignment": assignment.id,
                "results": [
                    {
                        "id": d.id,
                        "student": {"id": d.student_id, "username": d.student.username},
                        "original_filename": d.original_filename,
                        "file": request.build_absolute_uri(d.file.url),
                        "uploaded_at": d.uploaded_at,
                    }
                    for d in qs
                ],
            }
        )
    # POST: policy-validated upload (member only, OPEN window).
    if is_teacher_view:
        return Response(
            {"detail": "Teachers cannot submit deliverables."}, status=403
        )
    if assignment.state() != Assignment.State.OPEN:
        return Response(
            {"detail": "The upload window is closed (late work is ignored)."},
            status=400,
        )
    upload = request.FILES.get("file")
    if upload is None:
        return Response({"file": "Attach a file under the 'file' key."}, status=400)
    allowed = [
        ext.strip().lower().lstrip(".")
        for ext in assignment.file_extensions.split(",")
        if ext.strip()
    ]
    name = upload.name or ""
    if allowed and not name.lower().endswith(tuple(f".{e}" for e in allowed)):
        return Response(
            {"file": f"Allowed extensions: {', '.join(allowed)}."}, status=400
        )
    if upload.size > assignment.max_file_mb * 1024 * 1024:
        return Response(
            {"file": f"Files may be at most {assignment.max_file_mb} MB."}, status=400
        )
    deliverable = UploadedDeliverable.objects.create(
        assignment=assignment,
        student=request.user,
        file=upload,
        original_filename=name,
    )
    return Response(
        {
            "id": deliverable.id,
            "assignment": assignment.id,
            "original_filename": deliverable.original_filename,
            "uploaded_at": deliverable.uploaded_at,
        },
        status=201,
    )


@api_view(["GET"])
def exam_mode_view(request):
    """GET /exam-mode/ — EDU-4 status for the SPA lockdown banner."""
    from .exam import active_exam

    if not request.user.is_authenticated:
        return Response({"active": False, "assignment": None})
    exam = active_exam(request.user)
    if exam is None:
        return Response({"active": False, "assignment": None})
    return Response(
        {
            "active": True,
            "assignment": {
                "id": exam.id,
                "title_i18n": exam.title_i18n,
                "classroom": exam.classroom.name,
                "due_at": exam.due_at,
            },
        }
    )


def _quiz_grid_payload(assignment) -> dict:
    """EDU-5 shape for QUIZ teme: per-student best attempt + item stats."""
    from .quiz import item_stats

    members = list(
        assignment.classroom.memberships.select_related("student").order_by(
            "student__username"
        )
    )
    best: dict[int, dict] = {}
    for submission in assignment.quiz_submissions.select_related("student"):
        current = best.get(submission.student_id)
        if current is None:
            best[submission.student_id] = {
                "score": submission.score,
                "correct_count": submission.correct_count,
                "total_count": submission.total_count,
                "submitted_at": submission.submitted_at,
                "attempts": 1,
            }
        else:
            # Every attempt counts; the best score/row wins display fields.
            current["attempts"] += 1
            if submission.score > current["score"]:
                current.update(
                    {
                        "score": submission.score,
                        "correct_count": submission.correct_count,
                        "total_count": submission.total_count,
                        "submitted_at": submission.submitted_at,
                    }
                )
    return {
        "assignment_id": assignment.id,
        "kind": Assignment.Kind.QUIZ,
        "students": [
            {"id": m.student_id, "username": m.student.username} for m in members
        ],
        "cells": {str(uid): cell for uid, cell in best.items()},
        "item_stats": item_stats(assignment),
    }


def _files_grid_payload(assignment) -> dict:
    """EDU-5 shape for FILES teme: who delivered, how often, last upload."""
    members = list(
        assignment.classroom.memberships.select_related("student").order_by(
            "student__username"
        )
    )
    uploads: dict[int, dict] = {}
    for deliverable in assignment.deliverables.select_related("student").order_by(
        "uploaded_at"
    ):
        uploads[deliverable.student_id] = {
            "count": uploads.get(deliverable.student_id, {}).get("count", 0) + 1,
            "last_filename": deliverable.original_filename,
            "last_uploaded_at": deliverable.uploaded_at,
        }
    return {
        "assignment_id": assignment.id,
        "kind": Assignment.Kind.FILES,
        "students": [
            {"id": m.student_id, "username": m.student.username} for m in members
        ],
        "cells": {str(uid): cell for uid, cell in uploads.items()},
    }
