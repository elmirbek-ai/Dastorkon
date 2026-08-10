# Dastorkon

Dastorkon is a QR menu and restaurant order-management MVP. It provides a
Django REST API for restaurant setup, customer ordering, kitchen processing,
waiter operations, reporting, and real-time notifications.

## Roles

- **Admin** manages restaurants, settings, staff, menus, tables, order history,
  and statistics.
- **Waiter** manages shifts, accepts table sessions, delivers orders, and
  handles waiter calls.
- **Kitchen** views incoming orders and moves them through preparation.
- **Customer** starts a table session from a QR code, browses the menu, manages
  a cart, creates orders, and calls a waiter without creating an account.

## Tech stack

- Python
- Django
- Django REST Framework
- SimpleJWT
- Django Channels
- SQLite for local development

## Main features

- Admin restaurant, menu, table, and staff management
- Public QR and customer-session flow
- Public restaurant menu
- Customer cart and order creation
- Kitchen display workflow
- Waiter shifts, table orders, and waiter calls
- Admin order history and statistics
- Role-based WebSocket notifications

See [docs/API.md](docs/API.md) for the main HTTP and WebSocket routes.

## Local setup

Commands below use PowerShell on Windows. On macOS or Linux, activate the
virtual environment with `source .venv/bin/activate` instead.

1. Create and activate a virtual environment:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Install dependencies:

   ```powershell
   python -m pip install -r requirements.txt
   ```

3. Create the local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

   The MVP currently uses the SQLite development defaults in
   `config/settings.py`. Do not use the example secret key in production.

4. Apply migrations:

   ```powershell
   python manage.py migrate
   ```

5. Create a superuser:

   ```powershell
   python manage.py createsuperuser
   ```

   Django admin-site access uses the normal superuser flags. Access to the
   `/api/admin/` REST endpoints additionally requires the user's Dastorkon
   role to be `ADMIN`.

6. Run the tests:

   ```powershell
   python manage.py test
   ```

   Test runs automatically use Django's fast MD5 password hasher. Normal and
   production runs keep Django's default secure password hashers.

7. Start the development server:

   ```powershell
   python manage.py runserver
   ```

   To serve the ASGI application explicitly, including WebSockets, run:

   ```powershell
   daphne config.asgi:application
   ```

The default local API address is `http://127.0.0.1:8000/`.

## Authentication overview

Staff obtain JWT access and refresh tokens from the authentication endpoints
and send the access token as `Authorization: Bearer <token>`. Public customer
endpoints do not use customer accounts; the QR session endpoint sets an
HTTP-only `customer_session_key` cookie that must be retained for cart, order,
and waiter-call requests.

The current WebSocket foundation uses Django session authentication through
Channels' `AuthMiddlewareStack`. Redis is not required for the MVP; local and
test environments use the in-memory channel layer.
