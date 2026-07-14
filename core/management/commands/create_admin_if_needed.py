import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Crea un superusuario si las variables DJANGO_SUPERUSER_* están definidas."

    def handle(self, *args, **options):
        username = os.getenv("DJANGO_SUPERUSER_USERNAME")
        email = os.getenv("DJANGO_SUPERUSER_EMAIL", "")
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD")
        if not username or not password:
            self.stdout.write("Admin automático omitido: faltan usuario o contraseña.")
            return

        User = get_user_model()
        if User.objects.filter(username=username).exists():
            self.stdout.write("El administrador ya existe.")
            return

        User.objects.create_superuser(username=username, email=email, password=password)
        self.stdout.write(self.style.SUCCESS(f"Administrador '{username}' creado."))
