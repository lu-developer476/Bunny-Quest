import json
from datetime import timedelta
from uuid import UUID

from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.db import connection, transaction
from django.db.models import Avg, Count, Max, Q, Sum
from django.http import HttpRequest, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .forms import ProfileForm, SignUpForm
from .models import GameScore, GameSession
from .services import achievements_for_profile, daily_missions_for, unlock_achievements_for


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
    context = {"default_nickname": default_nickname}
    if request.user.is_authenticated:
        context["daily_missions"] = daily_missions_for(request.user)
        context["player_profile"] = request.user.player_profile
    return render(request, "core/game.html", context)


def leaderboard(request):
    period = request.GET.get("period", "all")
    board = request.GET.get("board", "score")
    mode = request.GET.get("mode", GameSession.MODE_NORMAL)
    valid_modes = {key for key, _ in GameSession.GAME_MODES}
    if mode not in valid_modes:
        mode = GameSession.MODE_NORMAL
    scores = GameScore.objects.select_related("user", "user__player_profile").filter(mode=mode)
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())

    if period == "today":
        scores = scores.filter(created_at__date=today)
        period_label = "hoy"
    elif period == "week":
        # Semana calendario: se puede “reiniciar” naturalmente cada lunes.
        scores = scores.filter(created_at__date__gte=week_start)
        period_label = "esta semana"
    else:
        period = "all"
        period_label = "histórico"

    if board == "carrots":
        scores = scores.order_by("-carrots", "duration_ms", "created_at")
        board_title = "Ranking de zanahorias"
    elif board == "level":
        scores = scores.order_by("-level", "-score", "created_at")
        board_title = "Ranking de nivel máximo"
    else:
        board = "score"
        scores = scores.order_by("-score", "created_at")
        board_title = "Ranking por puntaje"

    top_scores = list(scores[:100])
    my_position = None
    my_scores = []
    if request.user.is_authenticated:
        user_filter = Q(user=request.user)
        my_best = scores.filter(user_filter).first()
        if my_best:
            better = scores.filter(pk__in=scores.values("pk"))
            if board == "carrots":
                better = better.filter(Q(carrots__gt=my_best.carrots) | Q(carrots=my_best.carrots, duration_ms__lt=my_best.duration_ms))
            elif board == "level":
                better = better.filter(Q(level__gt=my_best.level) | Q(level=my_best.level, score__gt=my_best.score))
            else:
                better = better.filter(score__gt=my_best.score)
            my_position = better.count() + 1
        my_scores = list(scores.filter(user_filter)[:5])

    return render(
        request,
        "core/leaderboard.html",
        {
            "scores": top_scores,
            "period": period,
            "period_label": period_label,
            "board": board,
            "board_title": board_title,
            "mode": mode,
            "game_modes": GameSession.GAME_MODES,
            "my_position": my_position,
            "my_scores": my_scores,
        },
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
        form = ProfileForm(request.POST, instance=player_profile, user=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, "Perfil actualizado.")
            return redirect("profile")
    else:
        form = ProfileForm(instance=player_profile, user=request.user)

    scores = list(request.user.scores.all()[:10])
    best_score = request.user.scores.order_by("-score", "created_at").first()
    best_combo_score = request.user.scores.order_by("-max_combo", "created_at").first()
    for item in scores:
        badges = []
        if best_score and item.pk == best_score.pk:
            badges.append("récord")
        if best_combo_score and item.pk == best_combo_score.pk and item.max_combo >= 5:
            badges.append("combo")
        if best_score and item.pk != best_score.pk and best_score.score and item.score >= best_score.score * 0.9:
            badges.append("casi")
        item.profile_badges = badges
    stats = request.user.scores.aggregate(
        games=Count("id"),
        best_score=Max("score"),
        carrots=Sum("carrots"),
        average=Avg("score"),
    )
    return render(
        request,
        "core/profile.html",
        {
            "form": form,
            "scores": scores,
            "stats": stats,
            "achievement_cards": achievements_for_profile(request.user),
            "daily_missions": daily_missions_for(request.user),
            "best_score": best_score,
            "daily_streak": _daily_streak(request.user),
        },
    )


def _daily_streak(user):
    dates = list(user.scores.datetimes("created_at", "day", order="DESC"))
    streak = 0
    expected = timezone.localdate()
    for value in dates:
        played_date = timezone.localtime(value).date()
        if played_date == expected:
            streak += 1
            expected -= timedelta(days=1)
        elif played_date < expected:
            break
    return streak


@require_POST
def api_start_session(request: HttpRequest):
    active_cutoff = timezone.now() - timedelta(hours=2)
    GameSession.objects.filter(used=False, started_at__lt=active_cutoff).update(used=True)
    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        data = {}
    mode = str(data.get("mode", GameSession.MODE_NORMAL))
    if mode not in {key for key, _ in GameSession.GAME_MODES}:
        mode = GameSession.MODE_NORMAL
    session = GameSession.objects.create(
        user=request.user if request.user.is_authenticated else None,
        user_agent=request.headers.get("User-Agent", "")[:255],
        mode=mode,
    )
    return JsonResponse({"token": str(session.token), "started_at": session.started_at.isoformat(), "mode": session.mode})


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
        max_combo = int(data.get("max_combo", 1))
    except (ValueError, TypeError, json.JSONDecodeError):
        return JsonResponse({"error": "Datos de partida inválidos."}, status=400)

    if not nickname:
        return JsonResponse({"error": "Ingresá un apodo."}, status=400)
    if not (0 <= score <= 1_000_000 and 0 <= carrots <= 100_000 and 1 <= level <= 100):
        return JsonResponse({"error": "Puntaje fuera de rango."}, status=400)
    if not (2_000 <= duration_ms <= 7_200_000):
        return JsonResponse({"error": "Duración de partida inválida."}, status=400)
    if not (1 <= max_combo <= 50):
        return JsonResponse({"error": "Combo fuera de rango."}, status=400)

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

        previous_best = (
            GameScore.objects.filter(user=request.user).aggregate(best=Max("score"))["best"]
            if request.user.is_authenticated
            else None
        )
        record = GameScore.objects.create(
            session=game_session,
            user=request.user if request.user.is_authenticated else None,
            nickname=nickname,
            score=score,
            carrots=carrots,
            level=level,
            max_combo=max_combo,
            mode=game_session.mode,
            duration_ms=duration_ms,
        )

    unlocked = unlock_achievements_for(request.user) if request.user.is_authenticated else []
    rank = GameScore.objects.filter(mode=record.mode, score__gt=record.score).count() + 1
    next_rival_record = GameScore.objects.filter(mode=record.mode, score__gt=record.score).order_by("score", "created_at").first()
    next_rival = None
    if next_rival_record:
        next_rival = {
            "nickname": next_rival_record.nickname,
            "score": next_rival_record.score,
            "points_needed": max(1, next_rival_record.score - record.score + 1),
        }
    return JsonResponse(
        {
            "ok": True,
            "id": record.pk,
            "rank": rank,
            "message": f"Puntaje guardado. Puesto #{rank}.",
            "personal_best": previous_best is None or record.score > previous_best,
            "next_rival": next_rival,
            "achievements": [item.achievement.name for item in unlocked],
        },
        status=201,
    )


@require_GET
def api_leaderboard(request):
    rows = list(
        GameScore.objects.filter(mode=request.GET.get("mode", GameSession.MODE_NORMAL)).values("nickname", "score", "carrots", "level", "created_at")[:10]
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
