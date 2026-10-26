"""Regression locks for the zero-warnings policy (owner mandate).

Three warning families were driven to zero at the source (no blanket
pytest.ini ignores):

1. ``UnorderedObjectListWarning`` — ``StandardPageNumberPagination`` now
   applies a deterministic ``pk`` floor order to unordered querysets.
2. ``InsecureKeyLengthWarning`` — ``settings_ci`` installs a test-only
   ≥32-byte JWT signing key when the gate env key is shorter.
3. ``PytestCollectionWarning`` — ``problems.models.TestCase`` carries
   ``__test__ = False`` so the collector skips the Django model; locked
   here because the warning itself is only visible as suite noise.
"""

import warnings

import pytest
from django.conf import settings
from django.core.paginator import UnorderedObjectListWarning
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from problems.models import Tag
from webcoder_api.pagination import StandardPageNumberPagination


def _drf_request():
    """A DRF request (query_params) for direct paginator calls."""
    return Request(APIRequestFactory().get("/x"))


@pytest.mark.django_db
def test_page_number_pagination_orders_unordered_queryset():
    """Paginating an unordered queryset must not warn (pk floor order)."""
    paginator = StandardPageNumberPagination()
    with warnings.catch_warnings():
        warnings.simplefilter("error", UnorderedObjectListWarning)
        # Tag has no Meta.ordering, so the raw queryset is unordered —
        # the paginator must make it deterministic before Django sees it.
        result = paginator.paginate_queryset(Tag.objects.all(), _drf_request())
    assert list(result) == list(Tag.objects.order_by("pk"))


def test_page_number_pagination_keeps_explicit_ordering():
    """An explicitly ordered queryset passes through untouched."""

    class _Ordered:
        ordered = True

        def order_by(self, *field_names):
            self.called_with = field_names
            return self

    sentinel = _Ordered()
    # The ordering decision happens before super(), so the stub records
    # any re-ordering attempt and the AttributeError from Django's
    # paginator aborts harmlessly afterwards.
    try:
        StandardPageNumberPagination().paginate_queryset(sentinel, _drf_request())
    except Exception:
        pass
    assert not getattr(sentinel, "called_with", None), (
        "explicitly ordered querysets must not be re-ordered"
    )


def test_ci_signing_key_meets_jwt_length_floor():
    """settings_ci must hand SIMPLE_JWT a ≥32-byte HMAC key."""
    key = settings.SIMPLE_JWT["SIGNING_KEY"]
    assert len(key) >= 32, (
        "PyJWT >= 2.10 warns on HMAC keys < 32 bytes (RFC 7518 §3.2)"
    )
    assert settings.SIMPLE_JWT["VERIFYING_KEY"] == key


def test_problems_testcase_model_is_not_collected_as_test():
    """``problems.models.TestCase`` is a Django model, not a test class."""
    from problems import models

    assert models.TestCase.__test__ is False
