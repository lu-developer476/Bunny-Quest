import uuid

from django.contrib.auth.models import User
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Avg, Max, Sum


class PlayerProfile(models.Model):
    BUNNY_COLORS = [
        ("snow", "Blanco nieve"),
        ("cocoa", "Cacao"),
        ("sand", "Arena"),
        ("moon", "Gris luna"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="player_profile")
    bunny_name = models.CharField("nombre del conejo", max_length=24, default="Nube")
    bunny_color = models.CharField("pelaje", max_length=12, choices=BUNNY_COLORS, default="snow")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "perfil de jugador"
        verbose_name_plural = "perfiles de jugadores"

    def __str__(self):
        return f"{self.user.username} · {self.bunny_name}"

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
    user_agent = models.CharField(max_length=255, blank=True)

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
    duration_ms = models.PositiveIntegerField(validators=[MaxValueValidator(7_200_000)])
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-score", "created_at"]
        indexes = [
            models.Index(fields=["-score", "created_at"], name="score_rank_idx"),
            models.Index(fields=["-created_at"], name="score_recent_idx"),
        ]
        verbose_name = "puntaje"
        verbose_name_plural = "puntajes"

    def __str__(self):
        return f"{self.nickname}: {self.score}"
