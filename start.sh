#!/usr/bin/env bash
set -o errexit

# Render can run the start command in a fresh shell where the virtualenv
# created during the build is not on PATH. Prefer the project-local venv when
# it exists so console scripts such as gunicorn are always available.
if [ -x ".venv/bin/gunicorn" ]; then
  exec .venv/bin/gunicorn bunnyquest.wsgi:application --bind "0.0.0.0:${PORT}"
fi

exec python -m gunicorn bunnyquest.wsgi:application --bind "0.0.0.0:${PORT}"
