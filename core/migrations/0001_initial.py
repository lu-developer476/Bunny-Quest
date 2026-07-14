# Generated for Conejo Aventura
import django.core.validators
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="GameSession",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("used", models.BooleanField(default=False)),
                ("user_agent", models.CharField(blank=True, max_length=255)),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="game_sessions", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "sesión de juego", "verbose_name_plural": "sesiones de juego", "ordering": ["-started_at"]},
        ),
        migrations.CreateModel(
            name="PlayerProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("bunny_name", models.CharField(default="Nube", max_length=24, verbose_name="nombre del conejo")),
                ("bunny_color", models.CharField(choices=[("snow", "Blanco nieve"), ("cocoa", "Cacao"), ("sand", "Arena"), ("moon", "Gris luna")], default="snow", max_length=12, verbose_name="pelaje")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="player_profile", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "perfil de jugador", "verbose_name_plural": "perfiles de jugadores"},
        ),
        migrations.CreateModel(
            name="GameScore",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nickname", models.CharField(max_length=24)),
                ("score", models.PositiveIntegerField(validators=[django.core.validators.MaxValueValidator(1000000)])),
                ("carrots", models.PositiveIntegerField(validators=[django.core.validators.MaxValueValidator(100000)])),
                ("level", models.PositiveSmallIntegerField(validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(100)])),
                ("duration_ms", models.PositiveIntegerField(validators=[django.core.validators.MaxValueValidator(7200000)])),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("session", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="score_record", to="core.gamesession")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="scores", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "puntaje", "verbose_name_plural": "puntajes", "ordering": ["-score", "created_at"]},
        ),
        migrations.AddIndex(model_name="gamescore", index=models.Index(fields=["-score", "created_at"], name="score_rank_idx")),
        migrations.AddIndex(model_name="gamescore", index=models.Index(fields=["-created_at"], name="score_recent_idx")),
    ]
