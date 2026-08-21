# Production release checklist

This is Dastorkon's final go/no-go checklist for a production release. It
summarizes the controls described in the other deployment runbooks; it does
not mean that a real server or public launch has already been validated.

Complete this checklist against the exact commit and target environment being
released. Record an owner, timestamp, and evidence (CI run, command output,
dashboard, ticket, or backup identifier) for every required item. Any
unresolved public-launch blocker makes the decision **NO-GO**.

## Release record

- Release/version: `________________`
- Branch: `________________`
- Commit SHA: `________________`
- Target environment/domain: `________________`
- Release owner: `________________`
- Reviewer/approver: `________________`
- Deployment window: `________________`
- Previous known-good release/commit: `________________`
- Migration identifiers: `________________`
- Pre-release backup identifier and time: `________________`
- Final decision and time: `GO / NO-GO — ________________`

## Current prepared-state audit

The repository has environment-driven Django settings; optional PostgreSQL
and Redis configuration; Nginx/Daphne separation; static, media, and Vite
build guidance; SMTP configuration; console logging; liveness and readiness
checks; backup/restore guidance; a production-like Docker Compose stack; and
Ubuntu Nginx/systemd templates.

Those items are deployment preparation, not evidence that a particular
production environment is ready. The real domain, server, TLS certificate,
credentials, data services, firewall, monitoring, backups, and complete user
flows must still be configured and verified for the selected release.

## Pre-release checklist

### Release source and validation

- [ ] The release branch and exact commit SHA are selected, reviewed, and
  recorded above.
- [ ] CI is green for that exact commit, with no required job skipped or
  ignored.
- [ ] Open critical bugs and security findings have been resolved or the
  release is explicitly stopped.
- [ ] Python dependencies install successfully from `requirements.txt` in a
  clean environment.
- [ ] Frontend dependencies install successfully from the lockfile with
  `npm ci`.
- [ ] `python manage.py check`, `python manage.py test`, `npm run lint`, and
  `npm run build` pass for the selected commit.
- [ ] `python manage.py check --deploy` has been run with the final
  production-like environment, and every result has been reviewed.
- [ ] The generated frontend build comes from the selected commit and is not
  an old local artifact.

### Database, assets, and persistent data

- [ ] All new migrations have been reviewed for locking, duration, data loss,
  compatibility, and rollback implications.
- [ ] `python manage.py migrate --plan` has been reviewed against the intended
  production database before applying migrations.
- [ ] PostgreSQL is provisioned and the final `DATABASE_URL` is configured,
  protected, and tested with least-privilege credentials.
- [ ] Redis is provisioned and the final `REDIS_URL` is configured and tested
  for cross-worker channel delivery.
- [ ] `python manage.py collectstatic --noinput` succeeds in the release
  environment.
- [ ] Nginx static and Vite `frontend/dist` paths point to the newly built
  release and are readable by Nginx.
- [ ] The media path is persistent, writable by the application, readable by
  Nginx, and included in backups.
- [ ] A fresh PostgreSQL and media backup was taken before the release, and its
  identifiers, timestamps, storage location, and verification are recorded.

### Production environment and security

- [ ] SMTP is configured and delivery is verified if the release requires
  email; the console backend is not used for required production mail.
- [ ] `DEBUG=False` is set and confirmed in the effective environment.
- [ ] A unique, strong production `SECRET_KEY` is supplied from protected
  secret storage and is not committed to Git.
- [ ] `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and
  `CSRF_TRUSTED_ORIGINS` contain only the final required hosts and HTTPS
  origins.
- [ ] HTTPS is configured with a valid certificate, renewal is tested, and
  HTTP redirects to HTTPS.
- [ ] Secure cookies, reverse-proxy HTTPS handling, and the planned HSTS stage
  are configured only after HTTPS behavior has been verified.
- [ ] The production firewall exposes only required ports and restricts
  PostgreSQL and Redis from public access.
- [ ] Environment files and database, Redis, and SMTP credentials have the
  documented ownership and restrictive permissions.
- [ ] Demo credentials are absent from production, and privileged admin
  accounts use strong, unique passwords.

### Service and release verification

- [ ] Daphne and Nginx configuration use the real domain and paths and pass
  their applicable configuration checks.
- [ ] `/api/health/` returns HTTP 200 through the public Nginx route.
- [ ] `/api/health/ready/` returns HTTP 200 with the configured production
  dependencies available.
- [ ] WebSocket delivery works over `wss://`, including between separate
  Daphne workers when more than one worker/process is used.
- [ ] Django admin login succeeds over HTTPS and its static CSS and JavaScript
  load correctly.
- [ ] Application logs are available without leaking secrets, authorization
  headers, cookies, or WebSocket JWT query strings.
- [ ] Monitoring, alerts, and log retention are configured and have been
  exercised with a safe test signal.
- [ ] The rollback owner, previous known-good release, rollback triggers, and
  database compatibility limits have been reviewed before deployment begins.

## Post-release checklist

Run these checks through the real public route, not only against localhost.

- [ ] `/api/health/` returns HTTP 200 with minimal expected JSON.
- [ ] `/api/health/ready/` returns HTTP 200 and reports ready dependencies.
- [ ] The frontend entry page and at least one direct React route load after a
  refresh, confirming SPA fallback.
- [ ] `/admin/` loads and Django admin CSS and JavaScript are present.
- [ ] A designated non-demo account can log in and log out successfully.
- [ ] A representative customer order can be created and progresses through
  the expected order flow.
- [ ] Kitchen and waiter realtime updates arrive over `wss://` across the
  production worker topology.
- [ ] Existing and newly uploaded media load from the expected persistent
  location.
- [ ] Daphne, Django, Nginx, PostgreSQL, and Redis logs are checked for new
  errors, repeated retries, sensitive data, and abnormal request rates.
- [ ] Monitoring dashboards and alert delivery are checked after release.
- [ ] Automated PostgreSQL and media backups are scheduled, and the next run
  and responsible owner are known.
- [ ] The release record is updated with validation evidence and the final
  outcome.

## Rollback decision points

Rollback when the release causes a critical security issue, data corruption,
unavailable login/order/realtime paths, persistent failed health checks, or an
error rate beyond the team's agreed release threshold. Prefer the known-good
release when it remains compatible with the current database schema and data.

Do not rollback blindly when a migration has changed or removed data, a data
migration is partially applied, the previous code is incompatible with the
new schema, or the failure is an unrelated infrastructure/provider incident.
Pause writes or traffic if necessary, preserve logs and evidence, and have the
release and data owners review the safest recovery path.

- [ ] Record the failure, impact, first observed time, and rollback decision
  owner.
- [ ] Confirm whether the previous application and frontend release are
  compatible with the current database before switching code.
- [ ] Rebuild the frontend and rerun `collectstatic` for the selected rollback
  commit when its assets differ.
- [ ] Restart the application safely and repeat the health, login, order,
  realtime, static, and media checks.
- [ ] Do not reverse database migrations without a migration-specific,
  reviewed, and tested plan.
- [ ] Restore PostgreSQL or media from backup only after deliberate review and
  by following [Backup and restore](BACKUP_AND_RESTORE.md); never overwrite
  production as an exploratory restore test.

## Public-launch blockers

Do not launch publicly while any of these conditions is true:

- HTTPS is absent, invalid, or not verified end to end.
- `DEBUG=True` is effective in production.
- PostgreSQL or media backups are missing, stale, inaccessible, or not
  monitored.
- Restore has not been tested in a separate production-like recovery
  environment.
- Real SMTP is missing or untested when production workflows require email.
- The real domain, `ALLOWED_HOSTS`, CORS origins, or CSRF trusted origins are
  unknown or still use example/local values.
- The server firewall is absent or PostgreSQL/Redis are publicly exposed.
- Monitoring, alert delivery, or log retention is not configured.
- Critical security findings, data-loss risks, or release-blocking application
  bugs remain unresolved.
- Health/readiness, admin, order flow, WebSocket, static, or media validation
  fails in the target environment.

## Runbook map

| Document | Use it for |
| --- | --- |
| [Production readiness](PRODUCTION_READINESS.md) | Prepared capabilities and remaining real-environment work |
| [Ubuntu production deployment](UBUNTU_DEPLOYMENT.md) | Non-Docker server setup, Nginx, systemd, deployment, and rollback flow |
| [Static and media deployment](STATIC_MEDIA_DEPLOYMENT.md) | Vite assets, `collectstatic`, persistent media, and Nginx path separation |
| [Security hardening](SECURITY_HARDENING.md) | Final HTTPS, proxy, cookie, HSTS, secret, firewall, and security decisions |
| [Email deployment](EMAIL_DEPLOYMENT.md) | Console development mail and production SMTP configuration/testing |
| [Logging and health checks](LOGGING_AND_HEALTHCHECKS.md) | Stdout/journald logging, sensitive-data rules, and health monitoring |
| [Backup and restore](BACKUP_AND_RESTORE.md) | PostgreSQL/media backup, isolated restore testing, and recovery safety |
| [Docker Compose production-like setup](DOCKER_PROD_LIKE.md) | Optional local integration validation with PostgreSQL, Redis, Daphne, and Nginx |

## Sign-off

- Technical release owner: `________________`
- Operations/server owner: `________________`
- Data/backup owner: `________________`
- Business acceptance owner: `________________`
- Remaining accepted risks (must not include a blocker): `________________`
- Final decision: `GO / NO-GO`
- Decision timestamp: `________________`
