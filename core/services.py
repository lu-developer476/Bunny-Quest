from dataclasses import dataclass
from datetime import datetime, time, timedelta

from django.db.models import Count, Max, Sum
from django.utils import timezone

from .models import Achievement, PlayerAchievement, PlayerProfile


ACHIEVEMENT_SEEDS = [
    {
        "code": "first-hop",
        "name": "Primer salto",
        "description": "Terminaste tu primera carrera en el bosque.",
        "icon": "🐾",
        "kind": Achievement.KIND_GAMES,
        "threshold": 1,
        "sort_order": 10,
    },
    {
        "code": "carrot-25",
        "name": "Recolector",
        "description": "Juntaste 25 zanahorias en total.",
        "icon": "🥕",
        "kind": Achievement.KIND_CARROTS,
        "threshold": 25,
        "accessory_reward": "scarf",
        "sort_order": 20,
    },
    {
        "code": "level-10",
        "name": "Saltador fino",
        "description": "Alcanzaste el nivel 10 en una carrera.",
        "icon": "🐇",
        "kind": Achievement.KIND_LEVEL,
        "threshold": 10,
        "accessory_reward": "flower",
        "sort_order": 30,
    },
    {
        "code": "score-10000",
        "name": "Huella dorada",
        "description": "Superaste los 10.000 puntos.",
        "icon": "🏆",
        "kind": Achievement.KIND_SCORE,
        "threshold": 10000,
        "accessory_reward": "bow",
        "sort_order": 40,
    },
    {
        "code": "combo-8",
        "name": "Combo animal",
        "description": "Alcanzaste un combo x8.",
        "icon": "🔥",
        "kind": Achievement.KIND_COMBO,
        "threshold": 8,
        "accessory_reward": "clover",
        "sort_order": 50,
    },
]


@dataclass(frozen=True)
class DailyMission:
    code: str
    title: str
    description: str
    goal: int
    progress: int
    unit: str

    @property
    def completed(self):
        return self.progress >= self.goal

    @property
    def percent(self):
        return min(100, int((self.progress / self.goal) * 100)) if self.goal else 0


def ensure_default_achievements():
    for seed in ACHIEVEMENT_SEEDS:
        Achievement.objects.update_or_create(code=seed["code"], defaults=seed)


def _user_totals(user):
    return user.scores.aggregate(
        games=Count("id"),
        total_carrots=Sum("carrots"),
        best_score=Max("score"),
        best_level=Max("level"),
        best_combo=Max("max_combo"),
    )


def achievement_progress(user, achievement, totals=None):
    totals = totals or _user_totals(user)
    if achievement.kind == Achievement.KIND_GAMES:
        return totals["games"] or 0
    if achievement.kind == Achievement.KIND_CARROTS:
        return totals["total_carrots"] or 0
    if achievement.kind == Achievement.KIND_LEVEL:
        return totals["best_level"] or 0
    if achievement.kind == Achievement.KIND_COMBO:
        return totals["best_combo"] or 0
    return totals["best_score"] or 0


def unlock_achievements_for(user):
    ensure_default_achievements()
    totals = _user_totals(user)
    unlocked = []
    for achievement in Achievement.objects.all():
        if achievement_progress(user, achievement, totals) >= achievement.threshold:
            record, created = PlayerAchievement.objects.get_or_create(
                user=user,
                achievement=achievement,
            )
            if created:
                unlocked.append(record)
    return unlocked


def achievements_for_profile(user):
    ensure_default_achievements()
    totals = _user_totals(user)
    unlocked_codes = set(user.achievements.values_list("achievement__code", flat=True))
    cards = []
    for achievement in Achievement.objects.all():
        progress = achievement_progress(user, achievement, totals)
        cards.append({
            "achievement": achievement,
            "unlocked": achievement.code in unlocked_codes,
            "progress": progress,
            "percent": min(100, int((progress / achievement.threshold) * 100)),
        })
    return cards


def daily_missions_for(user):
    today = timezone.localdate()
    start = timezone.make_aware(datetime.combine(today, time.min))
    today_scores = user.scores.filter(created_at__gte=start)
    recent_scores = user.scores.filter(created_at__gte=timezone.now() - timedelta(days=7))
    carrots_today = today_scores.aggregate(total=Sum("carrots"))["total"] or 0
    games_today = today_scores.count()
    best_level_week = recent_scores.aggregate(best=Max("level"))["best"] or 0
    return [
        DailyMission("daily-carrots", "Huerta del día", "Juntá 30 zanahorias hoy.", 30, carrots_today, "zanahorias"),
        DailyMission("daily-games", "Tres senderos", "Jugá 3 partidas hoy.", 3, games_today, "partidas"),
        DailyMission("weekly-level", "Rama alta", "Llegá al nivel 8 esta semana.", 8, best_level_week, "nivel"),
    ]

SHOP_ACCESSORIES = [
    {"accessory": "cap", "price": 120, "rotation": "daily", "tag": "Exploración"},
    {"accessory": "collar", "price": 140, "rotation": "daily", "tag": "Elegante"},
    {"accessory": "crown", "price": 260, "rotation": "weekly", "tag": "Premium"},
    {"accessory": "glasses", "price": 180, "rotation": "daily", "tag": "Intelectual"},
    {"accessory": "backpack", "price": 220, "rotation": "weekly", "tag": "Aventura"},
    {"accessory": "star", "price": 160, "rotation": "daily", "tag": "Brillante"},
    {"accessory": "moon_pin", "price": 190, "rotation": "weekly", "tag": "Nocturno"},
    {"accessory": "rainbow", "price": 210, "rotation": "weekly", "tag": "Colorido"},
]


def coins_for_distance(distance_m):
    return max(0, int(distance_m) // 100)


def _rotated_items(items, seed, count):
    if not items:
        return []
    offset = seed % len(items)
    rotated = items[offset:] + items[:offset]
    return rotated[: min(count, len(rotated))]


def shop_catalog_for(user=None):
    today = timezone.localdate()
    week_seed = int(today.strftime("%G%V"))
    daily = _rotated_items([item for item in SHOP_ACCESSORIES if item["rotation"] == "daily"], today.toordinal(), 3)
    weekly = _rotated_items([item for item in SHOP_ACCESSORIES if item["rotation"] == "weekly"], week_seed, 3)
    choice_labels = dict(PlayerProfile.BUNNY_ACCESSORIES)
    owned = set()
    if user and user.is_authenticated:
        owned.update(user.accessory_purchases.values_list("accessory", flat=True))
        owned.update(user.achievements.exclude(achievement__accessory_reward="").values_list("achievement__accessory_reward", flat=True))
        owned.add(user.player_profile.bunny_accessory)
        owned.add("none")
    def hydrate(item):
        return {**item, "name": choice_labels.get(item["accessory"], item["accessory"]), "owned": item["accessory"] in owned}
    return {
        "daily": [hydrate(item) for item in daily],
        "weekly": [hydrate(item) for item in weekly],
        "next_daily": datetime.combine(today + timedelta(days=1), time.min),
        "next_weekly": datetime.combine(today + timedelta(days=7 - today.weekday()), time.min),
    }
