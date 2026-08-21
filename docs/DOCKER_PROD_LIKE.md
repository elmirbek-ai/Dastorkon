# Docker Compose production-like setup

## Purpose and scope

This optional stack validates Dastorkon's production-shaped architecture on a
local machine:

- PostgreSQL stores application data.
- Redis backs the Channels channel layer.
- Daphne serves Django HTTP and WebSocket traffic through ASGI.
- Nginx serves the React/Vite production build, Django static files, and media,
  and proxies backend routes.

It is not final production deployment automation. It intentionally uses local
HTTP, example credentials, a single Daphne process, Docker-managed volumes, and
locally built images. Normal Windows/PyCharm development remains unchanged and
continues to use SQLite, `InMemoryChannelLayer`, and the existing Python/Vite
commands when Docker is not selected.

## Prerequisites and environment

Install Docker Desktop with Linux containers enabled and start its Docker
engine. From the repository root, create the ignored local environment file:

```powershell
Copy-Item .env.docker.example .env.docker
```

The checked-in values are only safe examples for local validation. Keep
`POSTGRES_PASSWORD` and the password inside `DATABASE_URL` identical. Do not
commit `.env.docker`, and never reuse its `SECRET_KEY` or database password in
a real environment.

The example disables secure cookies and HTTPS redirect because the stack is
served over local HTTP. A real HTTPS deployment must use new secrets and enable
the corresponding security settings.

## Build and start

Validate the resolved Compose configuration:

```powershell
docker compose --env-file .env.docker -f docker-compose.prod-like.yml config --quiet
```

Build the backend and frontend/Nginx images, then start the stack:

```powershell
docker compose --env-file .env.docker -f docker-compose.prod-like.yml build
docker compose --env-file .env.docker -f docker-compose.prod-like.yml up -d
docker compose --env-file .env.docker -f docker-compose.prod-like.yml ps
```

On each backend container start, the Compose command waits for PostgreSQL and
Redis health checks, runs migrations, runs `collectstatic --noinput`, and then
starts Daphne on port 8000. Nginx waits for the Daphne health check and exposes
the complete application at `http://localhost:8080` by default. The backend
health check calls `/api/health/ready/`, which verifies both PostgreSQL and the
configured Redis service.

To follow startup output:

```powershell
docker compose --env-file .env.docker -f docker-compose.prod-like.yml logs -f backend nginx
```

## Management commands

Migrations run automatically for this local stack. They can also be run
explicitly after startup:

```powershell
docker compose --env-file .env.docker -f docker-compose.prod-like.yml exec backend python manage.py migrate --noinput
```

Create a Django superuser interactively:

```powershell
docker compose --env-file .env.docker -f docker-compose.prod-like.yml exec backend python manage.py createsuperuser
```

Optionally seed the demo data and generated menu media:

```powershell
docker compose --env-file .env.docker -f docker-compose.prod-like.yml exec backend python manage.py seed_demo
```

## Validation checklist

Use the following checks after all four services report healthy or running:

- Open `http://localhost:8080/` and confirm the React application loads.
- Open `http://localhost:8080/admin/`, sign in, and confirm admin CSS and
  JavaScript load from `/static/`.
- Open `http://localhost:8080/api/docs/` or call an API endpoint and confirm the
  request reaches Django through Nginx.
- Open `http://localhost:8080/api/health/` and confirm it returns
  `{"status": "ok"}`.
- Sign in to a staff screen and use browser developer tools to confirm
  `/ws/notifications/` establishes a WebSocket connection and receives events.
- Upload or seed an image, open its `/media/` URL, restart `backend` and `nginx`,
  and confirm the file is still available.
- Navigate directly to a nested React route and confirm Nginx returns the SPA
  `index.html` fallback.

Useful diagnostics:

```powershell
docker compose --env-file .env.docker -f docker-compose.prod-like.yml ps
docker compose --env-file .env.docker -f docker-compose.prod-like.yml logs backend
docker compose --env-file .env.docker -f docker-compose.prod-like.yml logs nginx
```

## Volumes and persistence

The Compose project owns three named volumes:

- `postgres_data` contains the PostgreSQL data directory.
- `media` contains uploaded and generated files and is shared read-only with
  Nginx.
- `staticfiles` contains `collectstatic` output and is shared read-only with
  Nginx. It is generated and can be recreated.

A normal stop does not delete these volumes:

```powershell
docker compose --env-file .env.docker -f docker-compose.prod-like.yml down
```

The named PostgreSQL, media, and static volumes remain available after this
normal `down`. Back up PostgreSQL and media before operations that could affect
them; see [Backup and restore](BACKUP_AND_RESTORE.md).

To stop containers and deliberately delete all local PostgreSQL data, media,
and collected static output, use the following only after confirming nothing
must be retained:

```powershell
docker compose --env-file .env.docker -f docker-compose.prod-like.yml down --volumes --remove-orphans
```

The `--volumes` operation is destructive. Back up any database or media data
that matters before running it. It must never be used as part of a backup or
restore validation procedure.

## Differences from real production

Before a real deployment:

- Select and harden the server or hosting platform.
- Use a real domain, configure DNS, terminate HTTPS, redirect HTTP, enable
  secure cookies, and expose WebSockets through `wss://`.
- Replace all example values with secret-manager or platform-managed secrets.
- Configure the final Nginx paths, trusted proxy settings, request limits, and
  security headers.
- Use managed or separately operated PostgreSQL and Redis where appropriate.
- Choose durable media storage and test PostgreSQL and media backup/restore.
- Decide how migrations run as a controlled release step rather than relying
  on container startup.
- Add monitoring, structured logging, health alerts, image scanning, resource
  limits, and a rollback procedure.
- Validate multiple ASGI workers and cross-worker WebSocket delivery.
