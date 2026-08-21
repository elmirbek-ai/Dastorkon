# Production security hardening

## Scope

Dastorkon's security-sensitive Django settings are environment-driven so local
development and the local HTTP Docker stack stay usable. The defaults are not
a substitute for final production values. Apply the settings below only after
the public domain, TLS termination, reverse proxy, and recovery procedures are
known and tested.

Run Django's deployment checks against the real production environment before
launch:

```powershell
python manage.py check --deploy
```

SMTP configuration is prepared, but local development deliberately retains the
console backend and therefore still reports `mail.E001` during a local deploy
check. In production, supply the SMTP environment described in
[Email deployment](EMAIL_DEPLOYMENT.md); the SMTP backend resolves that check
without sending a message. SMTP credentials are secrets and must never be
committed, included in images, or written to logs.

## Required production identity and origins

Set these values explicitly in production:

| Variable | Production requirement |
| --- | --- |
| `DEBUG` | Must be `False`. Debug pages can disclose source, settings, local variables, and request data. |
| `SECRET_KEY` | Use a long, random, unique secret from the deployment platform or secret manager. Never reuse the local example. |
| `ALLOWED_HOSTS` | List only the final hostnames handled by Django, without schemes or paths. Avoid `*`. |
| `CORS_ALLOWED_ORIGINS` | List only browser origins that may call the API, including `https://` and any non-default port. Do not use a wildcard with credentials. |
| `CSRF_TRUSTED_ORIGINS` | List exact trusted HTTPS origins for unsafe browser requests, including the scheme. Keep this narrower than possible. |

For a same-origin deployment such as `https://app.example.com`, both the React
application and API are served through one public origin. If a separate
frontend origin is introduced later, add only that exact origin to CORS and
CSRF configuration and test credential behavior deliberately.

The production `SECRET_KEY`, database URL, Redis URL, and all service passwords
must remain outside Git. The repository ignores `.env` and `.env.docker`; real
deployments should prefer platform-managed secrets over files on disk.

## HTTPS, cookies, and reverse proxies

After the HTTPS certificate and redirect path work end to end, use:

```dotenv
SECURE_PROXY_SSL_HEADER=True
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

`SECURE_PROXY_SSL_HEADER=True` makes Django trust
`X-Forwarded-Proto: https` by configuring
`("HTTP_X_FORWARDED_PROTO", "https")`. Enable it only when Django is reachable
through a proxy you control and that proxy removes any client-supplied
`X-Forwarded-Proto` value before setting its own value. Otherwise a client may
be able to forge whether Django considers a request secure.

The documented Nginx configuration overwrites `X-Forwarded-Proto` with its
request scheme. The local Docker stack uses HTTP, so its proxy trust, redirect,
secure-cookie, and HSTS settings remain disabled. Enabling HTTPS redirect or
secure cookies in that local HTTP profile would make it unusable.

Django already keeps the session cookie `HttpOnly` and uses `SameSite=Lax` for
session and CSRF cookies. `CSRF_COOKIE_HTTPONLY` remains at Django's `False`
default; changing it offers limited protection and changes how browser code can
obtain the CSRF token. These defaults suit the current same-origin Nginx layout
and Django admin, so they were not made environment-configurable. Do not use
`SameSite=None` unless a reviewed cross-site authentication design requires it;
that mode also requires secure cookies.

## Security headers

The environment-controlled response-header settings default to Django's secure
values:

```dotenv
SECURE_CONTENT_TYPE_NOSNIFF=True
SECURE_REFERRER_POLICY=same-origin
X_FRAME_OPTIONS=DENY
```

`nosniff` reduces MIME-type confusion, `same-origin` limits referrer data sent
to other origins, and `DENY` prevents Django pages such as the admin from being
framed. `SAMEORIGIN` is available for `X_FRAME_OPTIONS` only if a reviewed
same-origin embedding requirement appears. Django's headers apply to responses
served by Django; configure equivalent reviewed headers at Nginx or the CDN for
the React build, static files, and media responses.

A Content Security Policy is intentionally not enabled in this stage. It must
be measured in report-only mode against the built React application and Django
admin before enforcement so scripts, styles, images, QR assets, and API usage
are not broken.

## HSTS rollout

HSTS tells browsers to use HTTPS for future requests and can make a domain
unreachable until the policy expires if configured incorrectly. Keep the
defaults during local development and initial TLS work:

```dotenv
SECURE_HSTS_SECONDS=0
SECURE_HSTS_INCLUDE_SUBDOMAINS=False
SECURE_HSTS_PRELOAD=False
```

After HTTPS and redirects have been stable, roll out in stages:

1. Start with a short value such as `SECURE_HSTS_SECONDS=300` and verify every
   route, asset, upload, API request, admin page, and WebSocket connection.
2. Increase gradually to one day, one week, and finally the chosen long-lived
   policy, monitoring between changes.
3. Enable `SECURE_HSTS_INCLUDE_SUBDOMAINS=True` only after every current and
   future subdomain is guaranteed to support HTTPS.
4. Consider `SECURE_HSTS_PRELOAD=True` only after meeting browser preload
   requirements and accepting that removal can be slow. Preload is not simply
   another header toggle.

## Credentials and privileged accounts

- Keep PostgreSQL and Redis on private networks and restrict them to the
  application hosts that need access.
- Rotate database and Redis credentials through the provider or secret manager.
  Update `DATABASE_URL` or `REDIS_URL`, restart application workers so pooled
  connections use the new value, verify service health, and then revoke the old
  credential.
- Remove or reset all demo credentials before public use. Never expose accounts
  created by `seed_demo` publicly.
- Give every administrator an individual account with a long, unique password.
  Keep Django's password validators enabled, disable unused accounts promptly,
  review superuser membership, and add MFA through the selected identity or
  admin-security solution before handling sensitive production data.
- Restrict who can create superusers and record privileged account changes in
  an auditable system without logging passwords or tokens.

## Backups and recovery security

PostgreSQL and media backups can contain personal data, credentials or token
material stored by the application, uploaded images, and sensitive business
data. Encrypt them in transit and at rest, restrict backup-file access
separately from the live service, protect encryption keys through an approved
recovery process, define retention and deletion rules, and monitor backup
failures. Restore tests must use an isolated, access-controlled environment and
must verify both the database and matching media state. Do not copy production
credentials or data into developer laptops for convenience. See
[Backup and restore](BACKUP_AND_RESTORE.md) for the runbook.

Document recovery time and recovery point targets. A scheduled backup that has
never been restored is not a verified recovery plan.

## Logs, tokens, and WebSockets

- Never log `Authorization` headers, cookies, `SECRET_KEY`, database URLs, Redis
  URLs, passwords, environment dumps, or request bodies containing credentials.
- Staff WebSockets currently carry the JWT access token in the
  `/ws/notifications/?token=...` query string because browser WebSockets cannot
  set an arbitrary authorization header during the handshake. Query strings
  commonly appear in proxy and application logs, so production logging must
  redact the `token` value or omit WebSocket request query strings. The local
  Nginx example disables access logging for `/ws/` to avoid retaining it there.
- Production clients must connect through `wss://`; plain `ws://` exposes the
  token and event traffic on the network.
- Keep JWT lifetimes and revocation behavior under review, and do not put tokens
  in analytics, error reports, or support screenshots.
- Centralized logs need access controls, retention limits, tamper resistance,
  alerting, and a tested redaction policy.

## Public-launch checklist

- [ ] Set `DEBUG=False` and inject a new random `SECRET_KEY` from secret storage.
- [ ] Set exact production hosts, CORS origins, and CSRF trusted origins.
- [ ] Install and renew the HTTPS certificate; verify HTTP redirects and
  `wss://` WebSockets.
- [ ] Confirm the proxy overwrites `X-Forwarded-Proto`, then enable proxy trust,
  HTTPS redirect, and secure cookies.
- [ ] Roll out HSTS cautiously; do not enable subdomains or preload prematurely.
- [ ] Run `python manage.py check --deploy` with the final environment.
- [ ] Restrict the server firewall to required public and management ports;
  keep Daphne, PostgreSQL, and Redis private.
- [ ] Remove demo credentials, review admin/superuser accounts, and enforce the
  chosen password and MFA policy.
- [ ] Rotate initial database and Redis credentials and verify application
  reconnection.
- [ ] Complete encrypted PostgreSQL and media backups and a successful restore
  test.
- [ ] Verify logs and monitoring do not capture secrets, JWTs, cookies, or
  WebSocket query strings.
- [ ] Run authenticated and unauthenticated smoke tests, dependency/image
  scanning, and a focused penetration test before public use.
