"""DRF pagination classes (SPEC-GAPS D-B4).

Two shapes, set as the global default via ``REST_FRAMEWORK``:

- ``StandardPageNumberPagination`` — page-number pagination for stable
  catalogs (problems, tags, testcases, users, forum threads, leaderboard):
  ``{count, next, previous, results}``.
- ``NewestFirstCursorPagination`` (and subclasses) — cursor pagination for
  newest-first feeds where rows drift across page-number pages (submissions,
  notifications, forum posts): ``{next, previous, results}``.

Both accept ``?page_size=`` capped at ``max_page_size`` so no endpoint can
dump a whole table (previously every list returned the unbounded table as a
flat array).
"""

from rest_framework.pagination import CursorPagination, PageNumberPagination


class StandardPageNumberPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        # Zero-warnings policy: Django's paginator raises
        # UnorderedObjectListWarning for unordered querysets (page order
        # would be undefined). Rather than patching every viewset that
        # forgets Meta.ordering, the page-number paginator itself applies
        # a deterministic primary-key order as the floor. Querysets that
        # already carry an ordering (e.g. Problem's -creation_date) and
        # already-ranked plain lists (contest standings) pass through
        # untouched.
        if hasattr(queryset, "order_by") and not getattr(
            queryset, "ordered", False
        ):
            queryset = queryset.order_by("pk")
        return super().paginate_queryset(queryset, request, view=view)


class NewestFirstCursorPagination(CursorPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
    # Subclasses override ``ordering`` per resource. A trailing unique-key
    # tiebreaker (id) keeps cursor positions stable when timestamps collide.
    ordering = ("-created_at", "-id")
