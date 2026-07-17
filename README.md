# Conejo Aventura

**Conejo Aventura** es un juego web de plataformas hecho con Django y Canvas. Guiá al conejo por el Bosque Saltarín, esquivá obstáculos, juntá zanahorias y competí por un lugar en el ranking.

## Características

- Juego **Bosque Saltarín** con salto, doble salto, controles táctiles, obstáculos, zanahorias, combos y dificultad progresiva.
- Cuentas de usuario: registro, inicio/cierre de sesión y perfil con estadísticas.
- Ranking global y diario, disponible también como API JSON.
- Sesiones de partida de un solo uso y protección CSRF al guardar puntajes.
- Tienda de accesorios y selector de tema.
- Panel de administración de Django, health check y datos de demostración para desarrollo.
- SQLite para desarrollo local; PostgreSQL, WhiteNoise y Gunicorn para producción en Render.

## Requisitos

- Python **3.13** (la versión de producción está fijada en `runtime.txt`).
- `pip` y `venv`.

## Puesta en marcha local

```bash
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1

# Linux/macOS
source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Abrí <http://127.0.0.1:8000/>. El proyecto usa SQLite automáticamente si no definís una URL de base de datos.

### Comandos útiles

```bash
# Crear un administrador para acceder a /admin/
python manage.py createsuperuser

# Comprobar la configuración de Django
python manage.py check

# Ejecutar la suite de pruebas
python manage.py test
```

`seed_demo` solo agrega puntajes de ejemplo cuando el ranking todavía está vacío.

## Rutas principales

| Ruta | Descripción |
|---|---|
| `/` | Inicio del sitio |
| `/jugar/` | Juego Bosque Saltarín |
| `/ranking/` | Ranking de puntajes |
| `/cuenta/registro/` | Crear una cuenta |
| `/cuenta/perfil/` | Perfil y estadísticas del jugador |
| `/admin/` | Administración de Django |
| `/health/` | Health check para la plataforma de despliegue |

La aplicación expone los endpoints `POST /api/game/start/` y `POST /api/game/score/` para iniciar y finalizar partidas, y `GET /api/leaderboard/` para consultar el ranking. Los endpoints de juego usan la sesión autenticada y requieren un token CSRF válido.

## Variables de entorno

Django lee las variables directamente del entorno. No se necesita `python-dotenv` ni existe un archivo de configuración obligatorio para desarrollo local.

| Variable | Producción | Descripción |
|---|---:|---|
| `SECRET_KEY` | Sí | Clave secreta única y aleatoria de Django. |
| `DEBUG` | Sí | Usar `False` en producción. En local el valor predeterminado es `True`. |
| `DATABASE_URL` | Sí | URL completa de PostgreSQL, por ejemplo `postgresql://USER:PASSWORD@HOST:PORT/DB_NAME`. |
| `BUNNYQUEST_DATABASE_URL` | No | Alternativa con prioridad sobre `DATABASE_URL`. Útil si necesitás mantener ambas. |
| `ALLOWED_HOSTS` | Según dominio | Hosts adicionales separados por comas. Render agrega su hostname automáticamente. |
| `CSRF_TRUSTED_ORIGINS` | Según dominio | Orígenes HTTPS adicionales separados por comas, por ejemplo `https://tu-dominio.com`. |
| `WEB_CONCURRENCY` | Recomendada | Cantidad de workers de Gunicorn; Render usa `4` en el blueprint. |
| `DJANGO_SUPERUSER_USERNAME` | No | Usuario para la creación automática de un administrador durante el build. |
| `DJANGO_SUPERUSER_EMAIL` | No | Email del administrador automático. |
| `DJANGO_SUPERUSER_PASSWORD` | No | Contraseña del administrador automático; se requiere junto al usuario. |

> No uses la `SECRET_KEY` predeterminada de desarrollo fuera de tu equipo local.

## Despliegue en Render

La forma más simple es crear un servicio con **New Blueprint** y seleccionar este repositorio: `render.yaml` crea tanto el servicio web como la base PostgreSQL y configura las variables necesarias.

Para configurarlo manualmente:

- **Runtime:** Python 3
- **Build Command:** `./build.sh`
- **Start Command:** `./start.sh`
- **Health Check Path:** `/health/`

Definí al menos estas variables en el servicio:

```env
SECRET_KEY=<valor-aleatorio-seguro>
DEBUG=False
DATABASE_URL=<Internal Database URL de Render>
PYTHON_VERSION=3.13.5
WEB_CONCURRENCY=4
```

Durante el build se instalan las dependencias, se recopilan los estáticos, se aplican las migraciones y, si están completas las variables `DJANGO_SUPERUSER_*`, se crea el administrador. El arranque se realiza con Gunicorn; `start.sh` prioriza el entorno virtual creado por el build.

## Estructura del proyecto

```text
bunnyquest/     configuración de Django (settings, URLs, WSGI/ASGI)
core/           modelos, vistas, formularios, servicios, API y tests
templates/      plantillas HTML
static/         estilos, JavaScript, SVG y manifiesto PWA
build.sh        pasos de build para Render
start.sh        arranque de Gunicorn
render.yaml     blueprint de Render (web + PostgreSQL)
```

## Licencia

Este proyecto se distribuye bajo los términos indicados en [License](License).
