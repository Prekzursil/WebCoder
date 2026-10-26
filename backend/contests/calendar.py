"""ICS contest calendar feed (competitive roadmap CON-10).

``GET /api/v1/contests/calendar.ics`` — text/calendar with every PUBLIC
contest from the recent past (30 days) through the future, ready for Google
Calendar / Outlook subscription. PRIVATE contests never appear.
"""

from datetime import timedelta

from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateformat import format as dt_format

from .models import Contest

#: How far back finished public contests stay in the feed.
CALENDAR_PAST_DAYS = 30


def _ics_escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _dt_utc(value) -> str:
    # ICS UTC timestamp: yyyymmddThhmmssZ
    return dt_format(value, "YmdHis") + "Z"


def build_calendar(contests) -> str:
    now = timezone.now()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//WebCoder//Contests//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_ics_escape('WebCoder contests')}",
    ]
    for contest in contests:
        title = ""
        if isinstance(contest.title_i18n, dict):
            title = contest.title_i18n.get("en") or contest.title_i18n.get("ro") or ""
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:contest-{contest.id}@webcoder",
                f"DTSTAMP:{_dt_utc(now)}",
                f"DTSTART:{_dt_utc(contest.start_at)}",
                f"DTEND:{_dt_utc(contest.end_at)}",
                f"SUMMARY:{_ics_escape(title)}",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


def calendar_ics(request):
    cutoff = timezone.now() - timedelta(days=CALENDAR_PAST_DAYS)
    contests = (
        Contest.objects.filter(
            visibility=Contest.Visibility.PUBLIC, start_at__gte=cutoff
        )
        .order_by("start_at")
        .exclude(end_at__lt=timezone.now() - timedelta(days=CALENDAR_PAST_DAYS))
    )
    body = build_calendar(contests)
    response = HttpResponse(body, content_type="text/calendar; charset=utf-8")
    response["Content-Disposition"] = 'inline; filename="webcoder-contests.ics"'
    return response
