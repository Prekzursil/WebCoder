from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "classroom"

router = DefaultRouter()
router.register(r"classes", views.ClassRoomViewSet, basename="classroom")
router.register(r"assignments", views.AssignmentViewSet, basename="assignment")

urlpatterns = list(router.urls)
