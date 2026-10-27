from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    PostDetailView,
    PostListCreateView,
    ReportViewSet,
    ThreadViewSet,
    VoteView,
)

app_name = "forum"

router = DefaultRouter()
router.register(r"threads", ThreadViewSet, basename="thread")
router.register(r"reports", ReportViewSet, basename="report")

urlpatterns = [
    # Nested posts: list/create inside a thread, detail on a post, vote.
    path(
        "threads/<int:thread_pk>/posts/",
        PostListCreateView.as_view(),
        name="thread-posts",
    ),
    path("posts/<int:pk>/", PostDetailView.as_view(), name="post-detail"),
    path("posts/<int:pk>/vote/", VoteView.as_view(), name="post-vote"),
    path("", include(router.urls)),
]
