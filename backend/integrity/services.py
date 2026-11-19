"""Integrity scanning + heuristics (wave G items 113/114/115/117).

- ``similarity(a, b)``: language-aware token-stream Jaccard over k-gram
  shingles (a Dolos-lite in pure Python — no external service, no
  network). Advisory only.
- ``scan_problem_plagiarism``: pairwise scan over one problem's
  submissions (same problem, distinct users) — the contest/homework
  corpus the roadmap names.
- ``scan_boilerplate``: submission vs the problem's code template /
  starter — flags "the learner only submitted the skeleton".
- ``multi_account_clusters``: shared-IP clustering over the captured
  submission IPs (item 115).
- ``abuse_queue``: the unified moderation queue across forum reports,
  message reports and similarity flags, with SLA aging (item 117).
"""

from __future__ import annotations

import hashlib
import re
from collections import defaultdict

from django.utils import timezone

from forum.models import Report
from messaging.models import MessageReport
from submissions.models import Submission

from .models import SimilarityFlag

#: Tokens per shingle. 4-grams over normalized token streams.
K = 4
#: Scores at/above this create a flag (advisory threshold).
FLAG_THRESHOLD = 0.85
#: Boilerplate flags when the submission is ≥ this similar to the template.
BOILERPLATE_THRESHOLD = 0.95

_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|\d+")


def tokenize(source: str) -> list[str]:
    """Language-agnostic token stream (identifiers + numbers)."""
    return _TOKEN_RE.findall(source or "")


def shingles(source: str, k: int = K) -> set[str]:
    """Hashed k-gram shingle set over the token stream."""
    tokens = tokenize(source)
    out = set()
    for i in range(max(0, len(tokens) - k + 1)):
        gram = "\x00".join(tokens[i : i + k])
        out.add(hashlib.sha1(gram.encode()).hexdigest()[:16])
    return out


def similarity(a: str, b: str) -> float:
    """Jaccard similarity of the two sources' shingle sets (0..1)."""
    sa, sb = shingles(a), shingles(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def scan_problem_plagiarism(problem, *, since=None, limit: int = 200) -> int:
    """Pairwise scan over one problem's submissions (item 113).

    Only cross-user pairs are considered; the most recent ``limit``
    submissions in the window. Returns the number of OPEN flags created
    (existing pairs are skipped — scans are idempotent).
    """
    qs = Submission.objects.filter(problem=problem).order_by("-submission_time")
    if since is not None:
        qs = qs.filter(submission_time__gte=since)
    subs = list(qs[:limit])
    existing = set(
        SimilarityFlag.objects.filter(
            kind=SimilarityFlag.Kind.PLAGIARISM,
            submission__problem=problem,
        ).values_list("submission_id", "other_submission_id")
    )
    created = 0
    for i, left in enumerate(subs):
        for right in subs[i + 1 :]:
            if left.user_id == right.user_id:
                continue
            if (left.id, right.id) in existing or (right.id, left.id) in existing:
                continue
            score = similarity(left.code, right.code)
            if score < FLAG_THRESHOLD:
                continue
            SimilarityFlag.objects.create(
                kind=SimilarityFlag.Kind.PLAGIARISM,
                submission=left,
                other_submission=right,
                score=round(score, 4),
            )
            existing.add((left.id, right.id))
            created += 1
    return created


def scan_boilerplate(problem) -> int:
    """Flag submissions that are ≈ the problem's template (item 114)."""
    templates = [
        t
        for t in (problem.code_template, getattr(problem, "starter_code", None) or "")
        if t and t.strip()
    ]
    if not templates:
        return 0
    existing = set(
        SimilarityFlag.objects.filter(
            kind=SimilarityFlag.Kind.BOILERPLATE,
            submission__problem=problem,
        ).values_list("submission_id", flat=True)
    )
    created = 0
    for sub in Submission.objects.filter(problem=problem).exclude(id__in=existing):
        best = max((similarity(sub.code, t) for t in templates), default=0.0)
        if best >= BOILERPLATE_THRESHOLD:
            SimilarityFlag.objects.create(
                kind=SimilarityFlag.Kind.BOILERPLATE,
                submission=sub,
                other_submission=None,
                score=round(best, 4),
            )
            created += 1
    return created


def multi_account_clusters(min_shared_ips: int = 2):
    """Shared-IP clustering (item 115) — advisory, admin-facing.

    Clusters accounts that submitted from ≥``min_shared_ips`` common
    distinct IPs. Advisory signal only — a school NAT looks identical to
    a farm, so nothing auto-punishes.
    """
    # .order_by() clears Submission.Meta ordering — it would leak into
    # the SELECT and break DISTINCT (the same trap statistics.py notes).
    rows = (
        Submission.objects.exclude(ip_address__isnull=True)
        .order_by()
        .values("user_id", "ip_address")
        .distinct()
    )
    by_ip: dict[str, set[int]] = defaultdict(set)
    by_user: dict[int, set[str]] = defaultdict(set)
    for row in rows:
        by_ip[row["ip_address"]].add(row["user_id"])
        by_user[row["user_id"]].add(row["ip_address"])

    # IP → user-pairs sharing it; keep pairs sharing ≥ min_shared_ips IPs.
    pair_ips: dict[tuple[int, int], set[str]] = defaultdict(set)
    for users in by_ip.values():
        users = sorted(users)
        for i, a in enumerate(users):
            for b in users[i + 1 :]:
                pair_ips[(a, b)].update(by_user[a] & by_user[b])
    clusters = []
    for (a, b), ips in pair_ips.items():
        if len(ips) >= min_shared_ips:
            clusters.append(
                {
                    "user_ids": [a, b],
                    "shared_ips": sorted(ips),
                    "shared_count": len(ips),
                }
            )
    clusters.sort(key=lambda row: -row["shared_count"])
    return clusters[:50]


#: The abuse-queue SLA: first moderator response within this window.
SLA_HOURS = 48


def _age_hours(created_at) -> float:
    delta = timezone.now() - created_at
    return delta.total_seconds() / 3600.0


def abuse_queue():
    """The unified moderation queue with SLA aging (item 117).

    Every open report (forum + messaging) and every OPEN similarity
    flag, oldest first, with ``sla_due_in_hours`` and ``sla_breached``.
    """
    items = []

    for report in Report.objects.filter(status=Report.Status.OPEN):
        age = _age_hours(report.created_at)
        items.append(
            {
                "kind": "forum_report",
                "id": report.id,
                "created_at": report.created_at,
                "age_hours": round(age, 1),
                "sla_due_in_hours": round(SLA_HOURS - age, 1),
                "sla_breached": age > SLA_HOURS,
                "reporter_id": report.reporter_id,
                "reason": report.reason,
            }
        )

    for report in MessageReport.objects.filter(status=MessageReport.Status.OPEN):
        age = _age_hours(report.created_at)
        items.append(
            {
                "kind": "message_report",
                "id": report.id,
                "created_at": report.created_at,
                "age_hours": round(age, 1),
                "sla_due_in_hours": round(SLA_HOURS - age, 1),
                "sla_breached": age > SLA_HOURS,
                "reporter_id": report.reporter_id,
                "reason": report.reason,
            }
        )

    for flag in SimilarityFlag.objects.filter(status=SimilarityFlag.Status.OPEN):
        age = _age_hours(flag.created_at)
        items.append(
            {
                "kind": "similarity_flag",
                "id": flag.id,
                "created_at": flag.created_at,
                "age_hours": round(age, 1),
                "sla_due_in_hours": round(SLA_HOURS - age, 1),
                "sla_breached": age > SLA_HOURS,
                "reporter_id": None,
                "reason": flag.kind,
            }
        )

    items.sort(key=lambda row: row["created_at"])
    open_count = len(items)
    breached = sum(1 for row in items if row["sla_breached"])
    return {
        "items": items,
        "open_count": open_count,
        "sla_breached_count": breached,
        "sla_hours": SLA_HOURS,
    }
