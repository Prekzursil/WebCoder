from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .tracks import TrackViewSet
from .views import (
    CurriculumViewSet,
    TagViewSet,
    ProblemViewSet,
    TestCaseViewSet,
)
from .tooling import (
    AssignmentSolutionsExportView,
    GenerateOutputsView,
    ImportPackageView,
    OfflineBundleView,
    SampleTestsDownloadView,
    StressTestView,
    ValidatorRunView,
)
from .community import (
    ArticleViewSet,
    CommunityEditorialDetailView,
    CommunityEditorialReviewView,
    ProblemCommunityEditorialsView,
    RelatedArticlesView,
)
from .presubmit import PreSubmitLintView, PreSubmitSamplesView
from .strength import TestStrengthView
from .random_problem import RandomProblemView

app_name = "problems"

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r"tags", TagViewSet, basename="tag")
router.register(r"problems", ProblemViewSet, basename="problem")
router.register(r"testcases", TestCaseViewSet, basename="testcase")
router.register(r"articles", ArticleViewSet, basename="article")
router.register(r"curriculum", CurriculumViewSet, basename="curriculum")
# X12 study tracks (competitive matrix row 8): curated ordered playlists.
router.register(r"tracks", TrackViewSet, basename="track")

# The API URLs are now determined automatically by the router.
urlpatterns = [
    # Wave C (EDT-3/EDT-6/COM-2): community editorials + article hub.
    path(
        "<int:problem_id>/community-editorials/",
        ProblemCommunityEditorialsView.as_view(),
        name="problem-community-editorials",
    ),
    path(
        "<int:problem_id>/related-articles/",
        RelatedArticlesView.as_view(),
        name="problem-related-articles",
    ),
    path(
        "community-editorials/<int:pk>/",
        CommunityEditorialDetailView.as_view(),
        name="community-editorial-detail",
    ),
    path(
        "community-editorials/<int:pk>/review/",
        CommunityEditorialReviewView.as_view(),
        name="community-editorial-review",
    ),
    # Wave C (JDG-11/13, UXP-3/4): authoring & integrity tooling.
    path("tools/stress/", StressTestView.as_view(), name="tools-stress"),
    # JDG-11 remainder: validator runner, expected-output generation and
    # the Kattis/Polygon package importer (archive lane, CNT-2-gated).
    path("tools/validate/", ValidatorRunView.as_view(), name="tools-validate"),
    path(
        "tools/generate-outputs/",
        GenerateOutputsView.as_view(),
        name="tools-generate-outputs",
    ),
    path(
        "tools/import-package/",
        ImportPackageView.as_view(),
        name="tools-import-package",
    ),
    path(
        "tools/assignment-solutions/<int:assignment_id>/",
        AssignmentSolutionsExportView.as_view(),
        name="tools-assignment-solutions",
    ),
    path(
        "<int:problem_id>/samples/",
        SampleTestsDownloadView.as_view(),
        name="problem-samples",
    ),
    # RO-6: the offline study bundle (statement + samples as one PDF).
    path(
        "<int:problem_id>/offline-bundle/",
        OfflineBundleView.as_view(),
        name="problem-offline-bundle",
    ),
    # Wave E items 8/9/10: pre-submit assistance — the static lint (with
    # the constraint-aware overflow reading) and the sample dress-rehearsal
    # run that costs no submission.
    # Wave E item 16: per-test catch-rate scoring for the authoring and
    # verification surfaces (author/verifier/admin only).
    path(
        "<int:problem_id>/test-strength/",
        TestStrengthView.as_view(),
        name="problem-test-strength",
    ),
    path(
        "<int:problem_id>/lint/",
        PreSubmitLintView.as_view(),
        name="problem-presubmit-lint",
    ),
    path(
        "<int:problem_id>/run-samples/",
        PreSubmitSamplesView.as_view(),
        name="problem-presubmit-samples",
    ),
    # Wave E item 24: the random-problem die. Mounted BEFORE the router so
    # the "random" path can never collide with the /{pk}/ detail route.
    path("random/", RandomProblemView.as_view(), name="problem-random"),
    path("", include(router.urls)),
]
