from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TagViewSet, ProblemViewSet, TestCaseViewSet

app_name = "problems"

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'problems', ProblemViewSet, basename='problem')
router.register(r'testcases', TestCaseViewSet, basename='testcase')

# The API URLs are now determined automatically by the router.
urlpatterns = [
    path('', include(router.urls)),
]
