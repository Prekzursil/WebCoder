from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CurriculumViewSet,
    TagViewSet,
    ProblemViewSet,
    TestCaseViewSet,
)
from .community import (
    ArticleViewSet,
    CommunityEditorialDetailView,
    CommunityEditorialReviewView,
    ProblemCommunityEditorialsView,
    RelatedArticlesView,
)

app_name = "problems"

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r"tags", TagViewSet, basename="tag")
router.register(r"problems", ProblemViewSet, basename="problem")
router.register(r"testcases", TestCaseViewSet, basename="testcase")
router.register(r"articles", ArticleViewSet, basename="article")
router.register(r"curriculum", CurriculumViewSet, basename="curriculum")

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
    path("", include(router.urls)),
]
