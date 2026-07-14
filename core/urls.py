from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("jugar/", views.game, name="game"),
    path("ranking/", views.leaderboard, name="leaderboard"),
    path("cuenta/registro/", views.signup, name="signup"),
    path("cuenta/perfil/", views.profile, name="profile"),
    path("api/game/start/", views.api_start_session, name="api_start_session"),
    path("api/game/score/", views.api_submit_score, name="api_submit_score"),
    path("api/leaderboard/", views.api_leaderboard, name="api_leaderboard"),
    path("health/", views.health, name="health"),
]
