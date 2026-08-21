# Ubuntu production deployment

## Status and target architecture

This is an operator runbook and a pair of adaptable configuration examples. It
does not deploy Dastorkon, create a server, issue a certificate, or supply
production secrets. Review every path, user, domain, permission, dependency,
and hardening directive on the selected host before public launch.

The target layout is:

```text
Internet
   |
   v
Nginx :80/:443
   |-- /, React assets --------> frontend/dist
   |-- /static/ ---------------> Django staticfiles
   |-- /media/ ----------------> persistent media
   |-- /api/, /admin/, ... ----> Daphne on 127.0.0.1:8000
   `-- /ws/ -------------------> Daphne WebSocket upgrade
                                      |-- PostgreSQL
                                      `-- Redis channel layer
```

Nginx is the only public application listener. Daphne runs as a hardened
systemd service on loopback. PostgreSQL and Redis should also remain private or
loopback-only unless a separately secured managed service is selected. Docker
is not required for this Ubuntu deployment; the existing Compose setup remains
available only for local production-like validation.

## Server prerequisites

The examples assume an Ubuntu 24.04 LTS-style host and the versions already
used by the project where practical:

- Python 3.12 with `venv` and `pip`;
- Node.js 22 LTS and npm for the Vite production build;
- PostgreSQL 16 or newer, local or managed;
- Redis 7 or newer, local or managed;
- Nginx, Git, curl, and systemd;
- a host firewall such as UFW or the platform firewall;
- a future HTTPS certificate and automated renewal method;
- a dedicated non-login Linux user named `dastorkon`;
- enough disk, memory, and backup capacity for the database, media, builds, and
  operating-system logs.

Install packages only from approved Ubuntu or organizational sources. An
illustrative starting point is:

```bash
sudo apt update
sudo apt install git nginx postgresql redis-server python3.12 python3.12-venv python3-pip curl
python3.12 --version
node --version
npm --version
psql --version
redis-server --version
nginx -v
```

Ubuntu's repository may not provide the required Node major version. Install
Node 22 LTS through the organization's approved package source or version
manager rather than running an unreviewed remote shell script.

## Recommended paths

| Purpose | Example path |
| --- | --- |
| Application source | `/srv/dastorkon/app` |
| Python virtual environment | `/srv/dastorkon/venv` |
| Production environment file | `/etc/dastorkon/dastorkon.env` |
| Django collected static files | `/srv/dastorkon/app/staticfiles` |
| Persistent media | `/srv/dastorkon/app/media` |
| React/Vite build | `/srv/dastorkon/app/frontend/dist` |
| systemd unit | `/etc/systemd/system/dastorkon.service` |
| Nginx site | `/etc/nginx/sites-available/dastorkon` |

Django application logs go to stdout/stderr and are collected by journald; the
application does not create log files. The example Nginx site also directs its
access and error streams to stdout/stderr for systemd/journald collection.
Retention, forwarding, access control, and alerts remain operator concerns.

## Users, groups, and permissions

Keep application execution separate from root and Nginx. One workable model is
an application user/group plus a read-only shared web group:

```bash
sudo adduser --system --group --home /srv/dastorkon --shell /usr/sbin/nologin dastorkon
sudo groupadd --system dastorkon-web
sudo usermod --append --groups dastorkon-web dastorkon
sudo usermod --append --groups dastorkon-web www-data

sudo chown dastorkon:dastorkon-web /srv/dastorkon
sudo chmod 0710 /srv/dastorkon
sudo install -d -o dastorkon -g dastorkon-web -m 0710 /srv/dastorkon/app
sudo install -d -o root -g dastorkon -m 0750 /etc/dastorkon
```

The application user owns its source/build directories and writable media.
Nginx receives read/traverse access only through `dastorkon-web`. After building
and collecting assets, set the served directories accordingly:

```bash
sudo chown dastorkon:dastorkon-web /srv/dastorkon/app/frontend
sudo chmod 0750 /srv/dastorkon/app/frontend
sudo chown -R dastorkon:dastorkon-web \
  /srv/dastorkon/app/frontend/dist \
  /srv/dastorkon/app/staticfiles \
  /srv/dastorkon/app/media
sudo find /srv/dastorkon/app/frontend/dist /srv/dastorkon/app/staticfiles /srv/dastorkon/app/media \
  -type d -exec chmod 2750 {} +
sudo find /srv/dastorkon/app/frontend/dist /srv/dastorkon/app/staticfiles /srv/dastorkon/app/media \
  -type f -exec chmod 0640 {} +
```

The set-group-ID directory bit keeps new media in the shared web group. Confirm
that Daphne can create media and Nginx can read it without granting Nginx write
access. Do not use `chmod 777`.

The environment file should be owned by root, readable by the service user, and
unreadable by Nginx and other users:

```bash
sudo chown root:dastorkon /etc/dastorkon/dastorkon.env
sudo chmod 0640 /etc/dastorkon/dastorkon.env
```

Do not add `www-data` to the private `dastorkon` group; that would allow Nginx
to read the environment file.

## PostgreSQL and Redis

For local services, bind PostgreSQL and Redis to loopback and block their ports
at the firewall. Create a least-privilege PostgreSQL role interactively so its
password is not placed in shell history:

```bash
sudo -u postgres createuser --pwprompt --no-createdb --no-createrole --no-superuser dastorkon
sudo -u postgres createdb --owner=dastorkon dastorkon
sudo -u postgres psql --dbname=dastorkon --command='SELECT current_database();'
redis-cli ping
```

For Redis, retain protected mode, configure a reviewed ACL/password policy when
required, and never expose port 6379 publicly. Managed PostgreSQL or Redis is
also valid; restrict network access and use TLS according to that service's
requirements.

Set the resulting connection URLs only in the protected environment file.
Percent-encode reserved characters in URL credentials:

```dotenv
DATABASE_URL=postgresql://dastorkon:REPLACE_WITH_URL_ENCODED_PASSWORD@127.0.0.1:5432/dastorkon
REDIS_URL=redis://127.0.0.1:6379/0
```

## Source and dependencies

Provide the real repository URL through the deployment operator's approved Git
credentials. Do not place deploy tokens in the repository URL or shell history:

```bash
export DASTORKON_REPOSITORY_URL='REPLACE_WITH_APPROVED_REPOSITORY_URL'
sudo -u dastorkon git clone "$DASTORKON_REPOSITORY_URL" /srv/dastorkon/app
sudo install -d -o dastorkon -g dastorkon-web -m 2750 \
  /srv/dastorkon/app/staticfiles \
  /srv/dastorkon/app/media

sudo -u dastorkon python3.12 -m venv /srv/dastorkon/venv
sudo -u dastorkon /srv/dastorkon/venv/bin/python -m pip install --upgrade pip
sudo -u dastorkon /srv/dastorkon/venv/bin/python -m pip install \
  -r /srv/dastorkon/app/requirements.txt

sudo -u dastorkon npm ci --prefix /srv/dastorkon/app/frontend
sudo -u dastorkon npm run build --prefix /srv/dastorkon/app/frontend
```

Deploy a reviewed tag or commit rather than an unrecorded branch tip. Record the
commit ID and dependency-install output for rollback and audit purposes.

## Production environment file

Use the repository's `.env.example` as a variable checklist, then immediately
replace every local value before starting the service:

```bash
sudo install -o root -g dastorkon -m 0640 \
  /srv/dastorkon/app/.env.example \
  /etc/dastorkon/dastorkon.env
sudoedit /etc/dastorkon/dastorkon.env
```

The file must contain trusted, shell-compatible `KEY=value` entries because the
release commands below source it. Do not include shell commands or variable
substitutions. At minimum, set and review:

- `DEBUG=False` and a new random `SECRET_KEY`;
- exact `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and
  `CSRF_TRUSTED_ORIGINS` for `example.com`'s replacement;
- production `DATABASE_URL` and `REDIS_URL`;
- `LOG_LEVEL=INFO`;
- real SMTP settings and verified sender addresses;
- HTTPS redirect, secure cookies, proxy trust, and staged HSTS values only
  after HTTPS works end to end.

Do not start from the example's SQLite, in-memory channel layer, console email,
debug, or localhost-origin values in production. Never commit this file or make
it world-readable.

## Release-time Django commands

Migrations and asset collection are explicit release steps, not automatic
systemd startup actions. First take the required database/media backup described
in [Backup and restore](BACKUP_AND_RESTORE.md). Then run checks, migrations, and
static collection as the application user with the protected environment:

```bash
sudo -u dastorkon bash -c '
  set -a
  . /etc/dastorkon/dastorkon.env
  set +a
  cd /srv/dastorkon/app
  /srv/dastorkon/venv/bin/python manage.py check --deploy
  /srv/dastorkon/venv/bin/python manage.py migrate --noinput
  /srv/dastorkon/venv/bin/python manage.py collectstatic --noinput
'
```

Reapply the reviewed static/media/frontend permissions after the build and
`collectstatic`. Never run `seed_demo` on a public production database.

## Install the systemd service

Review [the systemd example](../deploy/systemd/dastorkon.service.example), then
install a copy rather than editing the tracked template:

```bash
sudo install -o root -g root -m 0644 \
  /srv/dastorkon/app/deploy/systemd/dastorkon.service.example \
  /etc/systemd/system/dastorkon.service
sudo systemd-analyze verify /etc/systemd/system/dastorkon.service
sudo systemctl daemon-reload
sudo systemctl enable --now dastorkon.service
sudo systemctl status dastorkon.service --no-pager
sudo journalctl -u dastorkon.service --since '10 minutes ago' --no-pager
```

The example runs Daphne, never Django `runserver`. It binds to loopback, loads
`/etc/dastorkon/dastorkon.env`, disables Daphne access logging so WebSocket JWT
query strings are not retained, restarts on failure, and lets journald capture
stdout/stderr. Its hardening makes application code read-only while leaving
only `media/` writable. Reassess the hardening if the real path layout changes.

## Install the Nginx site

Review [the Nginx example](../deploy/nginx/dastorkon.conf.example), replace
`example.com`, and install it as an Ubuntu site:

```bash
sudo install -o root -g root -m 0644 \
  /srv/dastorkon/app/deploy/nginx/dastorkon.conf.example \
  /etc/nginx/sites-available/dastorkon
sudo ln -s /etc/nginx/sites-available/dastorkon /etc/nginx/sites-enabled/dastorkon
sudo nginx -t
sudo systemctl reload nginx
sudo journalctl -u nginx --since '10 minutes ago' --no-pager
```

Disable another default site only if it conflicts, and retain a rollback copy
of any modified Nginx configuration. Always require `nginx -t` to pass before a
reload.

The example serves the React build at `/`, static files at `/static/`, and
persistent media at `/media/`. It proxies `/api/`, `/ws/`, `/admin/`, `/common/`,
and `/notifications/` to Daphne. Its access format uses `$uri` rather than the
raw request, so query strings are excluded, and `/ws/` access logging is off.

## HTTPS and firewall

The example intentionally listens on HTTP only. Before public traffic:

1. Point the real DNS records to the server.
2. Obtain a certificate through the selected, maintained ACME/certificate
   process and configure renewal monitoring.
3. Add a reviewed Nginx 443 server and verify HTTPS for frontend, API, admin,
   static, media, health endpoints, and `wss://` WebSockets.
4. Add the HTTP-to-HTTPS redirect.
5. Enable Django proxy trust, HTTPS redirect, secure cookies, and the staged
   HSTS rollout described in [Security hardening](SECURITY_HARDENING.md).

At the host firewall, verify SSH access before enabling changes, then allow only
the required management source(s) and public Nginx ports. Do not expose Daphne
8000, PostgreSQL 5432, or Redis 6379 publicly. A typical UFW policy starts with
`OpenSSH` and `Nginx Full`, but the actual rules must be reviewed for the real
network before `ufw enable` is run.

## Deployment verification

Run direct service checks first:

```bash
curl --fail --silent --show-error \
  --header 'Host: example.com' \
  --header 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8000/api/health/
curl --fail --silent --show-error \
  --header 'Host: example.com' \
  --header 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8000/api/health/ready/
sudo systemctl is-active dastorkon.service nginx postgresql redis-server
```

Replace the `Host` header with the real allowed domain. The forwarded-protocol
header makes the direct loopback check compatible with the final HTTPS settings
when proxy trust is enabled. Omit local PostgreSQL/Redis unit names from the
service check when managed services are used.

Then verify through the final HTTPS domain:

- `/api/health/` returns `{"status":"ok"}`;
- `/api/health/ready/` returns database and Redis as `ok`;
- the React frontend and direct nested SPA routes load;
- `/admin/` loads with Django static CSS/JavaScript;
- authenticated and public API calls succeed;
- staff WebSockets connect over `wss://` and deliver events across workers;
- `/static/` and `/media/` load through Nginx;
- a controlled media upload remains available after an application restart;
- SMTP sends only an authorized test message to a controlled inbox;
- logs contain no secrets, cookies, authorization headers, or JWT query strings.

Use [Logging and health checks](LOGGING_AND_HEALTHCHECKS.md),
[Static and media deployment](STATIC_MEDIA_DEPLOYMENT.md), and
[Email deployment](EMAIL_DEPLOYMENT.md) for the detailed verification notes.

## Updating an existing deployment

Before changing code, record the current commit and take the required backup:

```bash
cd /srv/dastorkon/app
sudo -u dastorkon git rev-parse HEAD
sudo -u dastorkon git fetch --prune origin
sudo -u dastorkon git checkout REPLACE_WITH_REVIEWED_TAG_OR_COMMIT
```

Install changed Python dependencies, run `npm ci` and the frontend build, run
deployment checks and migrations, collect static files, reapply permissions,
then restart Daphne and reload Nginx only after `nginx -t` passes. Prefer
versioned release directories plus a reviewed `current` symlink once deployment
automation is designed; this first runbook does not automate release switching.

## Rollback

Keep the previous release or known-good commit available. If the release can be
rolled back without reversing schema changes:

1. Stop sending new deployment changes and record the failure.
2. Select the previous reviewed commit or release directory.
3. Reinstall dependencies only if its manifests differ.
4. Rebuild `frontend/dist` for that release.
5. Run `collectstatic --noinput` for that release and restore permissions.
6. Run Django checks, restart Daphne, validate Nginx, and reload Nginx.
7. Verify health, frontend, admin, API, WebSocket, static, and media behavior.

Do not blindly reverse Django migrations. A backward migration can destroy or
misinterpret data even when code rollback is safe. Every migration rollback
needs a tested, migration-specific plan. Restore PostgreSQL or media only
through [Backup and restore](BACKUP_AND_RESTORE.md), into an isolated target
first. Never make production the first restore test.

## Work still required for a real server

- Select the actual Ubuntu host, domain, DNS, and network layout.
- Install and patch the required packages from approved sources.
- Replace every example path/domain if the real layout differs.
- Generate and inject real secrets without putting them in Git or shell logs.
- Provision and restrict PostgreSQL and Redis.
- Install HTTPS, redirects, renewal monitoring, and final security settings.
- Configure and verify the firewall and administrative access.
- Configure monitoring, alerting, log retention, backups, and restore testing.
- Run the complete end-to-end deployment and rollback exercise before public
  use.
