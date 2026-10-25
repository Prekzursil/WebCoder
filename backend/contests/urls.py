from rest_framework.routers import DefaultRouter

from . import views

app_name = "contests"

router = DefaultRouter()
router.register(r"", views.ContestViewSet, basename="contest")

urlpatterns = router.urls
