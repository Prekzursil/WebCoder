from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SubmissionViewSet, SubmissionCreateView

app_name = "submissions"

# Create a router and register our viewsets with it.
# SubmissionViewSet handles list and retrieve. Create is separate.
router = DefaultRouter()
router.register(r'submissions', SubmissionViewSet, basename='submission')

# The API URLs are now determined automatically by the router for list/retrieve.
# Add a separate path for creating submissions.
urlpatterns = [
    path('', include(router.urls)),
    path('submit/', SubmissionCreateView.as_view(), name='submission_create'),
]
