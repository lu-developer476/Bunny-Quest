import json
from datetime import timedelta
from uuid import UUID

from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.db import connection, transaction
from django.db.models import Avg, Count, Max, Sum
from django.http import HttpRequest, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .forms import ProfileForm, SignUpForm
from .models import GameScore, GameSession


def home(request):
    top_scores = GameScore.objects.select_related("user")[:5]
    totals = GameScore.objects.aggregate(
        games=Count("id"),
        carrots=Sum("carrots"),
        record=Max("score"),
    )
    return render(request, "core/home.html", {"top_scores": top_scores, "totals": totals})


@ensure_csrf_cookie
def game(request):
    default_nickname = "Visitante"
    if request.user.is_authenticated:
        default_nickname = request.user.player_profile.bunny_name or request.user.username
    return render(request, "core/game.html", {"default_nickname": default_nickname})


def leaderboard(request):
    period = request.GET.get("period", "all")
    scores = GameScore.objects.select_related("user")
    if period == "today":
        scores = scores.filter(created_at__date=timezone.localdate())
    elif period == "week":
        scores = scores.filter(created_at__gte=timezone.now() - timedelta(days=7))
    else:
        period = "all"
    return render(
        request,
        "core/leaderboard.html",
        {"scores": scores[:100], "period": period},
    )


def signup(request):
    if request.user.is_authenticated:
        return redirect("profile")
    if request.method == "POST":
        form = SignUpForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, "¡Tu madriguera ya está lista!")
            return redirect("profile")
    else:
        form = SignUpForm()
    return render(request, "registration/signup.html", {"form": form})


@require_POST
def logout_view(request):
    logout(request)
    messages.info(request, "Sesión cerrada. El bosque te espera.")
    return redirect("home")


@login_required
def profile(request):
    player_profile = request.user.player_profile
    if request.method == "POST":
        form = ProfileForm(request.POST, instance=player_profile)
        if form.is_valid():
            form.save()
            messages.success(request, "Perfil actualizado.")
            return redirect("profile")
    else:
        form = ProfileForm(instance=player_profile)

    scores = request.user.scores.all()[:10]
    stats = request.user.scores.aggregate(
        games=Count("id"),
        best_score=Max("score"),
        carrots=Sum("carrots"),
        average=Avg("score"),
    )
    return render(
        request,
        "core/profile.html",
        {"form": form, "scores": scores, "stats": stats},
    )


@require_POST
def api_start_session(request: HttpRequest):
    active_cutoff = timezone.now() - timedelta(hours=2)
    GameSession.objects.filter(used=False, started_at__lt=active_cutoff).update(used=True)
    session = GameSession.objects.create(
        user=request.user if request.user.is_authenticated else None,
        user_agent=request.headers.get("User-Agent", "")[:255],
    )
    return JsonResponse({"token": str(session.token), "started_at": session.started_at.isoformat()})


@require_POST
def api_submit_score(request: HttpRequest):
    try:
        data = json.loads(request.body or "{}")
        token = UUID(str(data.get("token", "")))
        nickname = str(data.get("nickname", "")).strip()[:24]
        score = int(data.get("score", 0))
        carrots = int(data.get("carrots", 0))
        level = int(data.get("level", 1))
        duration_ms = int(data.get("duration_ms", 0))
    except (ValueError, TypeError, json.JSONDecodeError):
        return JsonResponse({"error": "Datos de partida inválidos."}, status=400)

    if not nickname:
        return JsonResponse({"error": "Ingresá un apodo."}, status=400)
    if not (0 <= score <= 1_000_000 and 0 <= carrots <= 100_000 and 1 <= level <= 100):
        return JsonResponse({"error": "Puntaje fuera de rango."}, status=400)
    if not (2_000 <= duration_ms <= 7_200_000):
        return JsonResponse({"error": "Duración de partida inválida."}, status=400)

    with transaction.atomic():
        try:
            game_session = GameSession.objects.select_for_update().get(token=token)
        except GameSession.DoesNotExist:
            return JsonResponse({"error": "Sesión de juego inexistente."}, status=404)

        if game_session.used:
            return JsonResponse({"error": "Esta sesión ya fue utilizada."}, status=409)

        elapsed_ms = int((timezone.now() - game_session.started_at).total_seconds() * 1000)
        if elapsed_ms < 1_500 or elapsed_ms > 7_500_000:
            return JsonResponse({"error": "La sesión expiró."}, status=400)

        # Control anti-manipulación básico. Es deliberadamente generoso para no castigar
        # equipos lentos, pestañas en segundo plano o futuras mejoras del juego.
        max_plausible_score = max(10_000, int(elapsed_ms / 1000 * 3_600) + 10_000)
        if score > max_plausible_score:
            return JsonResponse({"error": "El puntaje no supera la validación del bosque."}, status=400)

        game_session.used = True
        game_session.finished_at = timezone.now()
        game_session.save(update_fields=["used", "finished_at"])

        record = GameScore.objects.create(
            session=game_session,
            user=request.user if request.user.is_authenticated else None,
            nickname=nickname,
            score=score,
            carrots=carrots,
            level=level,
            duration_ms=duration_ms,
        )

    rank = GameScore.objects.filter(score__gt=record.score).count() + 1
    return JsonResponse(
        {
            "ok": True,
            "id": record.pk,
            "rank": rank,
            "message": f"Puntaje guardado. Puesto #{rank}.",
        },
        status=201,
    )


@require_GET
def api_leaderboard(request):
    rows = list(
        GameScore.objects.values("nickname", "score", "carrots", "level", "created_at")[:10]
    )
    for row in rows:
        row["created_at"] = row["created_at"].isoformat()
    return JsonResponse({"results": rows})


@require_GET
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return JsonResponse({"status": "ok", "database": "ok"})
    except Exception:
        return JsonResponse({"status": "error", "database": "unavailable"}, status=503)
