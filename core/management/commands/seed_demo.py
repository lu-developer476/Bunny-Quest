import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import GameScore, GameSession


class Command(BaseCommand):
    help = "Carga puntajes de demostración para el ranking local."

    def handle(self, *args, **options):
        names = ["Copito", "Canela", "Trufa", "Menta", "Orejas", "Luna", "Pompón", "Brinco"]
        if GameScore.objects.exists():
            self.stdout.write("Ya hay puntajes; no se cargaron datos demo.")
            return

        for index, name in enumerate(names):
            session = GameSession.objects.create(used=True, finished_at=timezone.now())
            score = 6200 - index * 510 + random.randint(0, 180)
            GameScore.objects.create(
                session=session,
                nickname=name,
                score=score,
                carrots=max(1, score // 120),
                level=max(1, 8 - index // 2),
                duration_ms=45_000 + index * 2_500,
            )
        self.stdout.write(self.style.SUCCESS("Ranking demo cargado."))
