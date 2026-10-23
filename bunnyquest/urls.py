from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path

from core import views

admin.site.site_header = "Bunny Quest — Administración"
admin.site.site_title = "Bunny Quest"
admin.site.index_title = "Gestión del bosque"

urlpatterns = [
    path("robots.txt", views.robots_txt, name="robots_txt"),
    path("sitemap.xml", views.sitemap_xml, name="sitemap_xml"),
    path("admin/", admin.site.urls),
    path("", include("core.urls")),
    path(
        "cuenta/ingresar/",
        auth_views.LoginView.as_view(template_name="registration/login.html"),
        name="login",
    ),
    path("cuenta/salir/", views.logout_view, name="logout"),
]
