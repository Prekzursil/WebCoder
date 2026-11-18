"""Statement study aids (wave G items 78 + 92).

``/api/v1/problems/problems/{id}/annotations/`` — the caller's private
statement annotations: list (GET), create (POST), delete (DELETE with
?annotation_id=). Quotes anchor to a statement excerpt; notes are the
reader's own markdown. Never public.

``/api/v1/problems/problems/{id}/statement-pack/`` — a self-contained
HTML "offline pack": statement (both locales), limits, samples with
their localized comments and the hint ladder inlined, printable and
readable with zero connectivity. The PWA service worker caches the fetch
(network-first HTML strategy), so a saved pack is also the offline copy.
"""

from django.utils.html import escape
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Problem, StatementAnnotation, TestCase


class AnnotationSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    quote = serializers.CharField(max_length=500)
    note = serializers.CharField(max_length=4000)
    updated_at = serializers.DateTimeField(read_only=True)


class AnnotationsView(APIView):
    """Private per-user statement annotations (wave G item 78)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, problem_id):
        rows = StatementAnnotation.objects.filter(
            user=request.user, problem_id=problem_id
        )
        return Response(
            AnnotationSerializer(
                [
                    {
                        "id": row.id,
                        "quote": row.quote,
                        "note": row.note,
                        "updated_at": row.updated_at,
                    }
                    for row in rows
                ],
                many=True,
            ).data
        )

    def post(self, request, problem_id):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AnnotationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = StatementAnnotation.objects.create(
            user=request.user,
            problem=problem,
            quote=serializer.validated_data["quote"],
            note=serializer.validated_data["note"],
        )
        return Response(
            {
                "id": row.id,
                "quote": row.quote,
                "note": row.note,
                "updated_at": row.updated_at,
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, problem_id):
        annotation_id = request.query_params.get("annotation_id")
        if annotation_id is None:
            return Response(
                {"detail": "annotation_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted, _ = StatementAnnotation.objects.filter(
            user=request.user, problem_id=problem_id, pk=annotation_id
        ).delete()
        if not deleted:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"deleted": annotation_id})


def _lang_dict(value):
    if isinstance(value, dict):
        return value
    return {"ro": str(value or ""), "en": str(value or "")}


def build_statement_pack(problem, locale="en") -> str:
    """Assemble the self-contained HTML pack (wave G item 92).

    Everything inlines: minimal print-friendly CSS, the statement in the
    requested locale (other locale as a collapsed section), limits,
    samples with localized comments, and the hint ladder. No network
    references — the file opens offline on any device.
    """
    titles = _lang_dict(problem.title_i18n)
    statements = _lang_dict(problem.statement_i18n)
    title = (
        titles.get(locale)
        or titles.get("en")
        or titles.get("ro")
        or f"Problem {problem.id}"
    )
    statement = (
        statements.get(locale) or statements.get("en") or statements.get("ro") or ""
    )
    other_locale = "ro" if locale == "en" else "en"
    other_statement = statements.get(other_locale, "")
    other_title = titles.get(other_locale, title)

    parts = []
    parts.append(
        "<!DOCTYPE html><html lang='%s'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<title>%s — WebCoder offline pack</title><style>"
        "body{font-family:Georgia,'Times New Roman',serif;max-width:760px;"
        "margin:2rem auto;padding:0 1rem;line-height:1.65;color:#111}"
        "h1{font-size:1.4rem}h2{font-size:1.05rem;border-bottom:1px solid #999;"
        "padding-bottom:4px;margin-top:2rem}pre{background:#f4f4f4;padding:10px;"
        "border-radius:6px;overflow-x:auto;font-size:0.85rem}"
        ".meta{color:#555;font-size:0.85rem}.sample{margin-bottom:1rem}"
        "details{margin-top:1rem}footer{margin-top:3rem;color:#777;"
        "font-size:0.75rem;border-top:1px solid #ccc;padding-top:8px}"
        "</style></head><body>" % (escape(locale), escape(title))
    )
    parts.append(f"<h1>{escape(title)}</h1>")
    parts.append(
        '<p class="meta">WebCoder offline statement pack · problem #%d · '
        "time limit %s ms · memory limit %s KB</p>"
        % (problem.id, problem.default_time_limit_ms, problem.default_memory_limit_kb)
    )
    parts.append("<h2>Statement</h2>")
    parts.append(
        "".join(
            f"<p>{escape(line)}</p>" if line.strip() else "<br>"
            for line in statement.splitlines()
        )
        or "<p>(no statement)</p>"
    )
    hint_list = (
        (problem.hints_en if locale == "en" else problem.hints_ro)
        or (problem.hints_ro if locale == "en" else problem.hints_en)
        or []
    )
    if hint_list:
        parts.append("<h2>Hints</h2><ol>")
        parts.extend(f"<li>{escape(h)}</li>" for h in hint_list)
        parts.append("</ol>")
    samples = TestCase.objects.filter(problem=problem, is_sample=True).order_by("order")
    if samples.exists():
        parts.append("<h2>Samples</h2>")
        for index, test in enumerate(samples, start=1):
            comment = (
                (test.comment_en if locale == "en" else test.comment_ro)
                or (test.comment_ro if locale == "en" else test.comment_en)
                or ""
            )
            comment_html = f'<p class="meta">{escape(comment)}</p>' if comment else ""
            parts.append(
                '<div class="sample">%s<p><strong>Input %d</strong></p>'
                "<pre>%s</pre><p><strong>Output %d</strong></p><pre>%s</pre></div>"
                % (
                    comment_html,
                    index,
                    escape(test.input_data),
                    index,
                    escape(test.expected_output_data),
                )
            )
    if other_statement:
        parts.append(
            "<details><summary>%s (%s)</summary><h2>%s</h2>%s</details>"
            % (
                escape(other_title),
                escape(other_locale),
                escape(other_title),
                "".join(
                    f"<p>{escape(line)}</p>" if line.strip() else "<br>"
                    for line in other_statement.splitlines()
                ),
            )
        )
    parts.append(
        "<footer>Generated by WebCoder — solve at your own pace; this copy "
        "has no judge. Statement © its authors.</footer></body></html>"
    )
    return "".join(parts)


class StatementPackView(APIView):
    """GET — the self-contained offline statement pack (wave G item 92)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, problem_id):
        problem = Problem.objects.filter(
            pk=problem_id, status=Problem.ProblemStatus.APPROVED
        ).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        locale = request.query_params.get("lang", "en")
        if locale not in ("en", "ro"):
            locale = "en"
        html = build_statement_pack(problem, locale)
        return Response({"problem_id": problem.id, "lang": locale, "html": html})
