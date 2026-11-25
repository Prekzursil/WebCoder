from django.urls import path

from . import views

app_name = "ops"

urlpatterns = [
    # Public aggregate status (items 135/139) — uptime-monitor friendly.
    path("status/", views.StatusFeedView.as_view(), name="status"),
    # Admin-only operator surfaces.
    path("errors/", views.ErrorsView.as_view(), name="errors"),
    path("costs/", views.CostsView.as_view(), name="costs"),
    path("autoscale/", views.AutoscaleView.as_view(), name="autoscale"),
]
