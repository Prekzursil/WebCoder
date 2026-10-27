# WebCoder API backend (Django 5.2 + DRF + Celery).
# Used by the repo-root docker-compose.yml `backend` service.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=webcoder_api.settings

# docker CLI: the worker launches judged commands with `docker exec` into
# the sandboxed judge-runner container (JUDGE_BACKEND=container, see
# submissions/judge_utils/backend.py). Only the CLI is needed; the daemon
# socket is mounted by docker-compose.yml.
#
# `docker-cli` (not docker.io): Debian trixie — the current python:3.11-slim
# base — split the CLI into a separate package; docker.io now installs the
# daemon stack WITHOUT /usr/bin/docker (verified on the live rebuild
# 2026-10-21: `Setting up docker.io` succeeded yet the binary was absent,
# so every judged run died with FileNotFoundError "Docker command not
# found."). docker-cli is the minimal, CLI-only package on both bookworm
# and trixie.
RUN apt-get update \
    && apt-get install -y --no-install-recommends docker-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY deps.txt .
RUN pip install --no-cache-dir -r deps.txt

COPY . .

# uid 1000 aligns with the judge-runner container user (1000:1000) so files
# written to the shared judge-sandbox volume are readable/writable on both
# sides.
RUN useradd -u 1000 -m webcoder \
    && mkdir -p /srv/judge \
    && chown webcoder:webcoder /srv/judge
USER webcoder

EXPOSE 8000

# Development-grade server for now; swap for gunicorn/uwsgi (add to
# deps.txt) when hardening for real traffic. Migrations run on boot
# for convenience in local compose runs.
CMD ["sh", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]
