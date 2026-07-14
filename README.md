# Conejo Aventura — Django + Render

Juego web avanzado protagonizado por un conejo. Incluye motor Canvas en JavaScript, ranking persistente, cuentas de usuario, perfiles, sesiones de partida verificadas, panel de administración, diseño responsive y configuración de producción para Render.

## Características

- Juego **Bosque Saltarín**: saltos, doble salto, zanahorias, obstáculos, dificultad progresiva, combos y controles táctiles.
- Ranking global y diario.
- Registro, inicio de sesión y perfil con estadísticas personales.
- API JSON con protección CSRF y sesiones de juego de un solo uso.
- PostgreSQL en producción y SQLite en desarrollo.
- WhiteNoise para archivos estáticos.
- Health check para Render.
- Tests de modelos, páginas y API.
- Blueprint `render.yaml` para desplegar web + base de datos.

## Puesta en marcha local

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Abrí `http://127.0.0.1:8000/`.

## Variables de entorno

Copiá `.env.example` como referencia. Django toma directamente las variables del sistema; no hace falta instalar `python-dotenv`.

| Variable | Requerida en Render | Ejemplo / uso |
|---|---:|---|
| `SECRET_KEY` | Sí | Generar valor aleatorio desde Render |
| `DEBUG` | Sí | `False` |
| `DATABASE_URL` | Sí | Internal Database URL de Render PostgreSQL |
| `PYTHON_VERSION` | Recomendada | `3.13.5` |
| `WEB_CONCURRENCY` | Recomendada | `4` |
| `ALLOWED_HOSTS` | No | Render agrega `RENDER_EXTERNAL_HOSTNAME`; usar para dominios extra |
| `CSRF_TRUSTED_ORIGINS` | No | `https://tu-dominio.com` para dominios personalizados |
| `DJANGO_SUPERUSER_USERNAME` | No | Usuario admin automático |
| `DJANGO_SUPERUSER_EMAIL` | No | Email del admin |
| `DJANGO_SUPERUSER_PASSWORD` | No | Si se define, crea el admin durante el build |

## Deploy manual en Render

- **Language / Runtime:** Python 3
- **Build Command:** `./build.sh`
- **Start Command:** `gunicorn bunnyquest.wsgi:application --bind 0.0.0.0:$PORT`
- **Health Check Path:** `/health/`

Variables mínimas:

```env
SECRET_KEY=<Generate>
DEBUG=False
DATABASE_URL=<Internal Database URL de Render PostgreSQL>
PYTHON_VERSION=3.13.5
WEB_CONCURRENCY=4
```

También podés desplegar con **New Blueprint** usando el archivo `render.yaml` incluido.

## Crear administrador

Opción 1: definir las tres variables `DJANGO_SUPERUSER_*` antes del deploy.

Opción 2: abrir Render Shell y ejecutar:

```bash
python manage.py createsuperuser
```

## Tests

```bash
python manage.py test
python manage.py check --deploy
```

## Estructura principal

```text
bunnyquest/           configuración Django
core/                 modelos, vistas, API y lógica del sitio
templates/            páginas HTML
static/               CSS, JavaScript, SVG y PWA
build.sh              build de Render
render.yaml           infraestructura como código
```
