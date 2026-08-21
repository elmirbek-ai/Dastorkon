# Dastorkon

Dastorkon is a restaurant-service MVP built around a table QR menu. Customers
can browse a bilingual menu, place orders, track progress, and call a waiter
without creating an account. Staff use role-specific Admin, Waiter, and Kitchen
interfaces to manage the same order lifecycle.

## Tech stack

- **Backend:** Python, Django 6.1, Django REST Framework, SimpleJWT, Django
  Channels, Daphne, drf-spectacular
- **Frontend:** React 19, Vite 8, React Router, Axios
- **Local data and media:** SQLite and Pillow-generated demo menu images
- **Realtime:** authenticated WebSockets with polling fallback
- **Testing:** Django test runner and ESLint

## Roles

- **Admin** manages restaurants, settings, staff, menu categories and items,
  tables and QR codes, order history, and statistics.
- **Waiter** starts a shift, accepts table sessions and waiter calls, delivers
  ready orders, and closes completed tables.
- **Kitchen** receives new orders and moves them from `NEW` to `PREPARING` and
  then `READY`.
- **Customer** scans a table QR code, browses the menu in Kyrgyz or Russian,
  manages a cart, submits orders, tracks status, and calls a waiter.

## Local setup

The examples below use PowerShell from the repository root. On macOS or Linux,
activate the environment with `source .venv/bin/activate` instead.

1. Create the Python environment and install backend dependencies:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   ```

2. Apply migrations and seed the idempotent demo dataset:

   ```powershell
   python manage.py migrate
   python manage.py seed_demo
   ```

   The seed command creates the demo restaurant, menu images, ten tables, staff
   users, and prints the Table 1 QR token.

3. Install frontend dependencies:

   ```powershell
   Set-Location frontend
   npm ci
   Set-Location ..
   ```

The backend works locally without environment configuration. Use
[`.env.example`](.env.example) as a reference when setting environment
variables in a shell or deployment platform; the project does not load the
file automatically.

Production deployments can set `DATABASE_URL` to a `postgres://` or
`postgresql://` URL to use PostgreSQL. When it is empty or unset, Django keeps
using the local SQLite database, including in the current CI workflow.

An optional PostgreSQL, Redis, Daphne, and Nginx Docker Compose stack is
available for production-like local validation. It is separate from normal
development, which continues to use the Python and Vite commands below. See
[Docker Compose production-like setup](docs/DOCKER_PROD_LIKE.md).

Production must use `DEBUG=False`, a unique secret `SECRET_KEY`, HTTPS, and the
final public hosts and origins. See
[Security hardening](docs/SECURITY_HARDENING.md) before public deployment.

Email is written to the backend console during local development and CI.
Production can use environment-driven SMTP settings without changing local
behavior; see [Email deployment](docs/EMAIL_DEPLOYMENT.md).

## Run locally

Keep the backend and frontend running in separate terminals.

### Backend with Daphne

From the repository root with the virtual environment activated:

```powershell
daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

Daphne serves the Django API and `/ws/notifications/` WebSocket endpoint at
`http://127.0.0.1:8000`.

### Frontend with Vite

From a second terminal:

```powershell
Set-Location frontend
npm run dev
```

Vite serves the application at `http://127.0.0.1:5173` and proxies local API,
media, and WebSocket requests to Daphne.

## Demo credentials

These development-only accounts are created or reset by `seed_demo`:

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin12345` |
| Waiter | `waiter` | `waiter12345` |
| Kitchen | `kitchen` | `kitchen12345` |

Do not reuse these credentials outside the local MVP demo.

## Demo URLs

| Screen | URL |
| --- | --- |
| Staff login hub | `http://127.0.0.1:5173/login` |
| Admin login | `http://127.0.0.1:5173/admin/login` |
| Waiter login | `http://127.0.0.1:5173/waiter/login` |
| Kitchen login | `http://127.0.0.1:5173/kitchen/login` |
| Customer menu | `http://127.0.0.1:5173/menu/<table-qr-token>` |
| Swagger API documentation | `http://127.0.0.1:8000/api/docs/` |
| Django admin site | `http://127.0.0.1:8000/admin/` |

For the Customer menu, copy the Table 1 token printed by `python manage.py
seed_demo`, or open **Admin → Tables** and scan/open a generated QR code.

## Realtime behavior

Kitchen and Waiter pages authenticate to `/ws/notifications/` with their JWT
access token. Relevant events immediately call the pages' existing data-load
functions. Polling remains enabled as a fallback: Kitchen uses 7 seconds and
Waiter uses 8 seconds when the socket is unavailable, and both slow to 30
seconds while connected.

The MVP uses `InMemoryChannelLayer` by default, so local development and CI do
not require Redis. Production deployments can set `REDIS_URL` to enable
`channels_redis` for realtime delivery across multiple processes and should
expose the socket over `wss://`. See
[Realtime notes](docs/REALTIME_NOTES.md) for details.

## Documentation and validation

- [Demo checklist](docs/DEMO_CHECKLIST.md)
- [Realtime notes](docs/REALTIME_NOTES.md)
- [Static and media deployment](docs/STATIC_MEDIA_DEPLOYMENT.md)
- [Docker Compose production-like setup](docs/DOCKER_PROD_LIKE.md)
- [Security hardening](docs/SECURITY_HARDENING.md)
- [Email deployment](docs/EMAIL_DEPLOYMENT.md)
- [Production readiness](docs/PRODUCTION_READINESS.md)
- [API overview](docs/API.md)

For production, collect Django and admin static assets with:

```powershell
python manage.py collectstatic --noinput
```

Run the project checks with:

```powershell
python manage.py check
python manage.py test
Set-Location frontend
npm run lint
npm run build
```
