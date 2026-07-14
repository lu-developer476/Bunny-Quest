from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path

from core import views

admin.site.site_header = "Conejo Aventura — Administración"
admin.site.site_title = "Conejo Aventura"
admin.site.index_title = "Gestión del bosque"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("core.urls")),
    path(
        "cuenta/ingresar/",
        auth_views.LoginView.as_view(template_name="registration/login.html"),
        name="login",
    ),
    path("cuenta/salir/", views.logout_view, name="logout"),
]
