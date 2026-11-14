from django.urls import path

from . import views

app_name = "certificates"

urlpatterns = [
    path(
        "verify/<uuid:certificate_uuid>/",
        views.CertificateVerifyView.as_view(),
        name="verify",
    ),
    path("mine/", views.MyCertificatesView.as_view(), name="mine"),
    path("", views.UserCertificatesView.as_view(), name="by-user"),
    path(
        "<int:pk>/revoke/",
        views.RevokeCertificateView.as_view(),
        name="revoke",
    ),
]
