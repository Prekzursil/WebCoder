from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import LanguageCatalogView, TranslationProposalViewSet

app_name = "translations"  # noqa: F841 — used by the namespaced include()

router = DefaultRouter()
router.register(
    r"proposals", TranslationProposalViewSet, basename="translation-proposals"
)

urlpatterns = [
    # GET /api/v1/translations/languages/ — translatable catalog (public).
    path("languages/", LanguageCatalogView.as_view(), name="translation-languages"),
    path("", include(router.urls)),
]
