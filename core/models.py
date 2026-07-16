import uuid

from django.contrib.auth.models import User
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Avg, Max, Sum


class PlayerProfile(models.Model):
    BUNNY_BREEDS = [
        ("lop", "Belier"),
        ("dwarf", "Enano neerlandés"),
        ("angora", "Angora"),
        ("rex", "Rex"),
    ]
    BUNNY_COLORS = [
        ("snow", "Blanco nieve"),
        ("cocoa", "Cacao"),
        ("sand", "Arena"),
        ("moon", "Gris luna"),
        ("caramel", "Caramelo"),
        ("patch", "Manchado"),
    ]
    BUNNY_ACCESSORIES = [
        ("none", "Sin accesorio"),
        ("scarf", "Pañuelo verde"),
        ("flower", "Flor silvestre"),
        ("bow", "Moño zanahoria"),
        ("clover", "Trébol de la suerte"),
        ("cap", "Gorrito de explorador"),
        ("collar", "Collarín de flores"),
        ("crown", "Corona de tréboles"),
        ("glasses", "Anteojos redondos"),
        ("backpack", "Mochila viajera"),
        ("star", "Estrella de sendero"),
        ("moon_pin", "Pin lunar"),
        ("rainbow", "Cinta arcoíris"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="player_profile")
    bunny_name = models.CharField("nombre del conejo", max_length=24, default="Nube")
    bunny_breed = models.CharField("raza", max_length=16, choices=BUNNY_BREEDS, default="lop")
    bunny_color = models.CharField("pelaje", max_length=12, choices=BUNNY_COLORS, default="snow")
    bunny_accessory = models.CharField(
        "accesorios",
        max_length=100,
        default="none",
        help_text="Hasta 5 accesorios separados por comas.",
    )
    THEME_WHITE = "white"
    THEME_LIGHT_GREY = "light_grey"
    THEME_CHOICES = [
        (THEME_WHITE, "Blanco original"),
        (THEME_LIGHT_GREY, "Light grey"),
    ]

    coin_balance = models.PositiveIntegerField("monedas", default=0)
    preferred_theme = models.CharField("tema", max_length=20, choices=THEME_CHOICES, default=THEME_WHITE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "perfil de jugador"
        verbose_name_plural = "perfiles de jugadores"

    def __str__(self):
        return f"{self.user.username} · {self.bunny_name}"

    @property
    def equipped_accessories(self):
        return [item for item in self.bunny_accessory.split(",") if item and item != "none"]

    @property
    def equipped_accessories_csv(self):
        equipped = self.equipped_accessories[:5]
        return ",".join(equipped) if equipped else "none"

    @property
    def equipped_accessories_display(self):
        labels = dict(self.BUNNY_ACCESSORIES)
        equipped = self.equipped_accessories
        return ", ".join(labels.get(item, item) for item in equipped) if equipped else labels["none"]

    def get_bunny_accessory_display(self):
        return self.equipped_accessories_display

    @property
    def stats(self):
        return self.user.scores.aggregate(
            best_score=Max("score"),
            total_carrots=Sum("carrots"),
            games=models.Count("id"),
            average_score=Avg("score"),
        )


class GameSession(models.Model):
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_sessions",
    )
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    used = models.BooleanField(default=False)
    MODE_NORMAL = "normal"
    MODE_TIMED = "timed"
    MODE_ONE_LIFE = "one_life"
    MODE_HIGH_CARROTS = "high_carrots"
    MODE_FAST_FOREST = "fast_forest"
    GAME_MODES = [
        (MODE_NORMAL, "Normal"),
        (MODE_TIMED, "60 segundos"),
        (MODE_ONE_LIFE, "Una sola vida"),
        (MODE_HIGH_CARROTS, "Solo zanahorias altas"),
        (MODE_FAST_FOREST, "Bosque veloz"),
    ]

    user_agent = models.CharField(max_length=255, blank=True)
    mode = models.CharField(max_length=20, choices=GAME_MODES, default=MODE_NORMAL)

    class Meta:
        ordering = ["-started_at"]
        verbose_name = "sesión de juego"
        verbose_name_plural = "sesiones de juego"

    def __str__(self):
        return str(self.token)


class GameScore(models.Model):
    session = models.OneToOneField(GameSession, on_delete=models.PROTECT, related_name="score_record")
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scores",
    )
    nickname = models.CharField(max_length=24)
    score = models.PositiveIntegerField(validators=[MaxValueValidator(1_000_000)])
    carrots = models.PositiveIntegerField(validators=[MaxValueValidator(100_000)])
    level = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(100)]
    )
    max_combo = models.PositiveSmallIntegerField(default=1, validators=[MaxValueValidator(50)])
    mode = models.CharField(max_length=20, choices=GameSession.GAME_MODES, default=GameSession.MODE_NORMAL, db_index=True)
    duration_ms = models.PositiveIntegerField(validators=[MaxValueValidator(7_200_000)])
    distance_m = models.PositiveIntegerField(default=0, validators=[MaxValueValidator(1_000_000)])
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-score", "created_at"]
        indexes = [
            models.Index(fields=["mode", "-score", "created_at"], name="score_mode_rank_idx"),
            models.Index(fields=["-created_at"], name="score_recent_idx"),
        ]
        verbose_name = "puntaje"
        verbose_name_plural = "puntajes"

    def __str__(self):
        return f"{self.nickname}: {self.score}"


class Achievement(models.Model):
    KIND_SCORE = "score"
    KIND_CARROTS = "carrots"
    KIND_LEVEL = "level"
    KIND_GAMES = "games"
    KIND_COMBO = "combo"
    KINDS = [
        (KIND_SCORE, "Puntaje"),
        (KIND_CARROTS, "Zanahorias"),
        (KIND_LEVEL, "Nivel"),
        (KIND_GAMES, "Partidas"),
        (KIND_COMBO, "Combo"),
    ]

    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=60)
    description = models.CharField(max_length=160)
    icon = models.CharField(max_length=8, default="🏅")
    kind = models.CharField(max_length=12, choices=KINDS)
    threshold = models.PositiveIntegerField()
    accessory_reward = models.CharField(
        max_length=16,
        choices=PlayerProfile.BUNNY_ACCESSORIES,
        blank=True,
        default="",
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "threshold"]
        verbose_name = "logro"
        verbose_name_plural = "logros"

    def __str__(self):
        return self.name


class PlayerAchievement(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="achievements")
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE, related_name="players")
    unlocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "achievement")
        ordering = ["-unlocked_at"]
        verbose_name = "logro desbloqueado"
        verbose_name_plural = "logros desbloqueados"

    def __str__(self):
        return f"{self.user.username} · {self.achievement.name}"


class AccessoryPurchase(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="accessory_purchases")
    accessory = models.CharField(max_length=16, choices=PlayerProfile.BUNNY_ACCESSORIES)
    purchased_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "accessory")
        ordering = ["-purchased_at"]
        verbose_name = "accesorio comprado"
        verbose_name_plural = "accesorios comprados"

    def __str__(self):
        return f"{self.user.username} · {self.accessory}"
