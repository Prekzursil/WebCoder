"""Exam endpoints for item 148 (wave G section K).

- ``GET  /api/v1/certifications/teacher-exam/`` — the active question
  bank WITHOUT correct answers (any authenticated teacher-role user).
- ``POST /api/v1/certifications/teacher-exam/`` — grade
  ``{answers: {"<question_id>": <choice_index>}}``; ≥ 80% issues the
  TEACHER atestat (idempotent — re-passing keeps the original).
"""

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView


def _is_teacher(user) -> bool:
    return bool(user and user.is_authenticated and user.role in ("TEACHER", "ADMIN"))


class TeacherExamView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_teacher(request.user):
            return Response(
                {"detail": "Teacher role required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        from certificates.teacher import active_questions

        questions = active_questions()
        if not questions:
            return Response(
                {"detail": "exam not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                "pass_threshold": 0.8,
                "questions": [
                    {
                        "id": question.pk,
                        "question": question.question,
                        "choices": question.choices,
                    }
                    for question in questions
                ],
            }
        )

    def post(self, request):
        if not _is_teacher(request.user):
            return Response(
                {"detail": "Teacher role required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        from certificates.teacher import grade_exam

        answers = request.data.get("answers")
        if not isinstance(answers, dict) or not answers:
            return Response(
                {"detail": "answers object required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = grade_exam(request.user, answers)
        if result.get("error"):
            return Response(
                {"detail": result["error"]},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(result, status=status.HTTP_200_OK)
