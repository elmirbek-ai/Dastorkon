# Dastorkon production deployment preparation

## 1. Purpose

This document prepares Dastorkon v0.1.0-mvp for deployment to a real server.
It turns the repository's existing deployment guidance into a practical
preparation checklist; it does not prove that a server is production-ready or
replace the final [release checklist](RELEASE_CHECKLIST.md).

The primary target is the non-Docker Ubuntu layout documented in
[Ubuntu production deployment](UBUNTU_DEPLOYMENT.md). The existing
[Docker Compose stack](DOCKER_PROD_LIKE.md) is for local production-like
validation, not final deployment automation.

## 2. Target production architecture

```text
Internet and public domain
          |
          v
    Nginx :80/:443
      |-- / and React routes ------> frontend/dist
      |-- /static/ ----------------> Django staticfiles
      |-- /media/ -----------------> persistent media storage
      |-- /api/, /django-admin/ ---> Daphne ASGI on loopback
      `-- /ws/ --------------------> Daphne WebSocket upgrade
                                         |-- PostgreSQL
                                         `-- Redis/Channels
```

- **Server:** A supported, patched Ubuntu VPS or dedicated server.
- **Public entry point:** Nginx on ports 80 and 443, with 80 redirecting to
  HTTPS after certificate validation.
- **Frontend:** The React production build in `frontend/dist/`, served directly
  by Nginx with SPA fallback.
- **Backend:** Daphne runs `config.asgi:application` as a private systemd
  service, normally on `127.0.0.1:8000`.
- **Database:** PostgreSQL, local and loopback-only or a network-restricted
  managed service.
- **Realtime:** Redis backs Django Channels so WebSocket events work across
  multiple backend processes.
- **Assets:** Nginx serves generated Django files from `staticfiles/` and
  persistent uploaded files from `media/`.
- **Public identity:** A real domain, DNS records, a valid HTTPS certificate,
  and monitored certificate renewal.

Nginx must leave the React Admin application under `/admin/*` and proxy Django
admin separately under `/django-admin/`.

## 3. Required server information checklist

Fill this in before provisioning or adapting any example configuration.

| Information | Production value |
| --- | --- |
| Public domain and any required subdomains | `____________________________` |
| Server public IP address | `____________________________` |
| Ubuntu version | `____________________________` |
| SSH user and approved access method | `____________________________` |
| Application service user | `____________________________` |
| Deployment/application path | `____________________________` |
| Python virtual-environment path | `____________________________` |
| PostgreSQL host and port | `____________________________` |
| PostgreSQL database name | `____________________________` |
| PostgreSQL application user | `____________________________` |
| Redis host and port | `____________________________` |
| SMTP provider/sender, if required | `____________________________` |
| Persistent media location | `____________________________` |
| Off-host backup location | `____________________________` |
| Backup RPO, RTO, and retention | `____________________________` |
| Deployment and operations owner | `____________________________` |
| Business/cafe responsible person | `____________________________` |

Also record the release commit, deployment window, rollback owner, and previous
known-good release in the [release checklist](RELEASE_CHECKLIST.md).

## 4. Required environment variables checklist

Start from [`.env.example`](../.env.example), but place real values in protected
server-side secret storage such as `/etc/dastorkon/dastorkon.env`. Django does
not load the repository example automatically. Do not commit the production
file or copy example credentials into it.

### Django security

- [ ] `DEBUG=False`.
- [ ] `SECRET_KEY` is newly generated, strong, and stored outside Git.
- [ ] `SECURE_PROXY_SSL_HEADER=True` only after Nginx is verified to overwrite
  `X-Forwarded-Proto` correctly.
- [ ] `SECURE_SSL_REDIRECT=True`, `SESSION_COOKIE_SECURE=True`, and
  `CSRF_COOKIE_SECURE=True` after HTTPS works end to end.
- [ ] `SECURE_HSTS_SECONDS` follows a reviewed staged rollout; enable
  `SECURE_HSTS_INCLUDE_SUBDOMAINS` and `SECURE_HSTS_PRELOAD` only when every
  affected domain is ready.
- [ ] `SECURE_CONTENT_TYPE_NOSNIFF`, `SECURE_REFERRER_POLICY`, and
  `X_FRAME_OPTIONS` retain reviewed secure values.

### Database

- [ ] `DATABASE_URL` points to the production PostgreSQL database with a
  least-privilege application user.
- [ ] Reserved characters in URL credentials are percent-encoded.
- [ ] The database is reachable only from approved hosts and uses provider TLS
  when required.

### Redis and Channels

- [ ] `REDIS_URL` points to the protected production Redis database.
- [ ] Redis is not publicly exposed; authentication, ACL, and TLS choices match
  the selected local or managed service.
- [ ] Cross-process WebSocket delivery is tested with the final Daphne process
  topology.

### Hosts, CORS, and CSRF

- [ ] `ALLOWED_HOSTS` contains only the final hostname or hostnames.
- [ ] `CORS_ALLOWED_ORIGINS` contains only required full HTTPS origins.
- [ ] `CSRF_TRUSTED_ORIGINS` contains only required full HTTPS origins.
- [ ] No localhost, wildcard, or temporary origin remains unless it is an
  explicitly reviewed operational requirement.

### Static, media, and frontend build

The current Django settings use repository-relative `staticfiles/` and
`media/` paths; there are no separate static/media environment variables.

- [ ] `frontend/dist/` is built from the selected release and is readable by
  Nginx.
- [ ] `staticfiles/` is regenerated with `collectstatic` and is readable by
  Nginx.
- [ ] `media/` is persistent, writable by Daphne, readable by Nginx, and
  excluded from deployment cleanup.
- [ ] Set `VITE_PUBLIC_APP_URL` to the public frontend origin at build time so
  generated customer QR links use the intended domain.
- [ ] Leave `VITE_API_BASE_URL` empty for the documented same-origin Nginx
  layout, or set it only when a reviewed separate API origin is selected.

### Admin and demo account policy

- [ ] Do not run `seed_demo` against the public production database.
- [ ] Do not retain the documented demo usernames/passwords in public use.
- [ ] Create the initial production superuser through an approved interactive
  process and require a strong, unique password.
- [ ] Create only the real cafe staff accounts required for launch and assign
  the minimum appropriate roles.

### Logging

- [ ] Set `LOG_LEVEL` to the reviewed production level, normally `INFO`.
- [ ] Confirm journald or the selected platform captures Daphne and Nginx logs
  with defined access, retention, monitoring, and alerting.
- [ ] Confirm logs exclude secrets, cookies, authorization headers, SMTP or
  database credentials, and WebSocket JWT query strings.

### Email, if required

- [ ] Set `EMAIL_BACKEND` and the applicable `EMAIL_HOST`, `EMAIL_PORT`,
  `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL`,
  `EMAIL_TIMEOUT`, `DEFAULT_FROM_EMAIL`, and `SERVER_EMAIL` values.
- [ ] Store SMTP credentials outside Git and verify delivery only to a
  controlled test inbox before public use.

## 5. Deployment sequence

1. **Prepare the server.** Provision and patch Ubuntu, create the dedicated
   application user and paths, configure SSH access and the firewall, and
   install approved Python, Node.js/npm, PostgreSQL client/server as applicable,
   Redis client/server as applicable, Nginx, Git, and systemd prerequisites.
2. **Clone the repository.** Clone through approved credentials and check out a
   reviewed tag or commit. Record its SHA and keep deploy credentials out of
   repository URLs and shell history.
3. **Create the production environment.** Build a root-owned, restricted
   environment file from the variable checklist above. Replace every example,
   localhost, debug, and local-console value that is not explicitly intended.
4. **Install backend dependencies.** Create the production virtual environment
   and install `requirements.txt` as the application user.
5. **Build the frontend.** Set reviewed Vite build variables, run `npm ci`, and
   run `npm run build` for the selected release.
6. **Configure PostgreSQL.** Create the database and least-privilege user,
   restrict network access, set `DATABASE_URL`, and verify a direct connection.
7. **Configure Redis.** Keep it private, set any required ACL/TLS policy, set
   `REDIS_URL`, and verify connectivity.
8. **Prepare backup and rollback controls.** Select protected off-host storage,
   record the RPO/RTO, and follow [Backup and restore](BACKUP_AND_RESTORE.md).
   Production must not be the first restore test.
9. **Run release checks and migrations.** Review `migrate --plan`, run
   `manage.py check --deploy` with the production environment, then run
   `manage.py migrate --noinput`. Do not run `seed_demo`.
10. **Collect Django static files.** Run
    `manage.py collectstatic --noinput`, then apply the reviewed ownership and
    read permissions for Nginx.
11. **Configure Daphne under systemd.** Adapt the tracked systemd example,
    keep Daphne on loopback, load the protected environment file, verify the
    unit, enable it, and inspect its journal.
12. **Configure Nginx.** Adapt the tracked Nginx example to the actual domain
    and paths. Verify React SPA fallback, `/static/`, persistent `/media/`,
    `/api/`, `/ws/`, and `/django-admin/`. Require `nginx -t` before reload.
13. **Enable HTTPS.** Point DNS, issue and monitor the certificate, verify HTTPS
    and `wss://`, add the HTTP-to-HTTPS redirect, and only then enable Django's
    HTTPS-only settings and staged HSTS policy.
14. **Run production smoke checks.** Test through the public domain, inspect
    service logs, record evidence, and complete the final release sign-off.

For exact Ubuntu commands, permissions, service installation, and rollback
steps, follow [Ubuntu production deployment](UBUNTU_DEPLOYMENT.md).

## 6. Production smoke checks

Run these through the final HTTPS Nginx route, not only through loopback.

| Check | Expected result |
| --- | --- |
| `/api/health/` | HTTP 200 with the minimal liveness response. |
| `/api/health/ready/` | HTTP 200 with PostgreSQL and configured Redis ready. |
| `/` | React entry route loads and redirects/renders normally. |
| `/login` | Staff login hub loads after direct navigation and refresh. |
| `/admin/dashboard` | React Admin route loads; it is not captured by Django admin routing. |
| `/django-admin/` | Django admin login and its `/static/` CSS/JavaScript load. |
| `/menu/<qr-token>` | A reviewed real test table opens the public customer menu. |
| `/ws/` | `wss://<domain>/ws/notifications/` upgrades and delivers authorized staff events through the final worker topology. |
| Static files | A representative Django admin/static asset returns successfully through Nginx. |
| Media files | Existing and newly uploaded test media load and remain after an application restart/deploy. |

Complete one controlled four-role lifecycle using non-demo production test
accounts and a designated test table:

1. Customer opens the QR menu without occupying the table, adds an item, and
   places an order.
2. Confirm the table becomes `OCCUPIED`, and the order number and total match
   across Customer, Kitchen, Waiter, and Admin.
3. Kitchen moves `NEW` -> `PREPARING` -> `READY`, including a reload check.
4. Waiter accepts the work, marks the order `DELIVERED`, resolves any calls,
   and closes the table.
5. Confirm the order becomes `COMPLETED`, customer history remains readable,
   the table returns to `FREE`, and Admin Orders/dashboard reporting loads.

Check browser consoles and Daphne, Nginx, PostgreSQL, and Redis logs during the
flow. No secret-bearing query string, credential, cookie, or authorization
header may be retained in logs.

## 7. Security checklist before public use

- [ ] Effective `DEBUG` is `False`.
- [ ] The production `SECRET_KEY` is strong, unique, protected, and absent from
  Git and deployment logs.
- [ ] Demo passwords and seeded demo accounts are not used publicly.
- [ ] `ALLOWED_HOSTS` contains only the exact production hostnames.
- [ ] A valid HTTPS certificate, HTTP redirect, renewal monitoring, secure
  cookies, and reviewed proxy trust are active.
- [ ] CORS and CSRF trusted origins are restricted to required HTTPS origins.
- [ ] PostgreSQL, Redis, SMTP, and other credentials are not committed and are
  readable only by approved services/operators.
- [ ] PostgreSQL and Redis are not publicly exposed.
- [ ] Automated PostgreSQL and media backups are configured, monitored,
  encrypted as required, and proven by an isolated restore.
- [ ] Logs and monitoring do not expose secrets, credentials, tokens, cookies,
  personal data beyond operational need, or authorization headers.
- [ ] Firewall, server updates, service permissions, monitoring, alerting, and
  rollback ownership have been reviewed.

## 8. Known production risks

- WebSocket delivery through Redis must be verified in the real multi-process
  Daphne deployment; a single local process does not prove cross-process
  delivery.
- Persistent media storage, permissions, retention, backup, restore, and
  disaster-recovery ownership must be explicit before real uploads are relied
  on.
- Demo seed data and credentials must not be treated as real cafe data or used
  publicly without deliberate review and replacement.
- Real cafe staff still need role-specific training and an agreed operating
  procedure for orders, calls, table closure, and incident fallback.
- SMTP, monitoring, alerts, firewall policy, certificate renewal, and restore
  procedures depend on the selected provider and must be tested there.
- Public launch requires completed evidence and final sign-off in the
  [production release checklist](RELEASE_CHECKLIST.md).

## 9. Go / No-Go table

Leave the status blank until evidence has been collected for the selected
server and release.

| Gate | Required evidence | Status |
| --- | --- | --- |
| Server and ownership | Host details, access owner, patched OS, firewall review | |
| Production configuration | Protected environment inventory and `check --deploy` output | |
| PostgreSQL and Redis | Restricted connectivity, readiness result, WebSocket cross-process test | |
| HTTPS and routing | Valid certificate, redirect, React `/admin/*`, Django `/django-admin/` | |
| Static and media | Asset checks, persistent upload test, permissions review | |
| Backup and recovery | Recent backup IDs and successful isolated restore evidence | |
| MVP smoke flow | Four-role QR lifecycle result and reviewed logs | |
| Release approval | Completed release checklist and named approvers | |

Any failed security, health, data-protection, routing, login, ordering,
realtime, backup/restore, or rollback gate is a **No-Go** until resolved.

## 10. Next action

Choose the actual deployment target, domain, and responsible operators, then
fill in the server information checklist in this document. Only after those
values are known should the tracked Nginx/systemd examples and environment
inventory be adapted for that specific server.
