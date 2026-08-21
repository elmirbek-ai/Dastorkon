# Production readiness

## Current stage

Dastorkon is at the environment-based settings stage. Security-sensitive and
deployment-specific Django settings can now be supplied through environment
variables while local development continues to work without extra setup. Use
[`.env.example`](../.env.example) as the configuration reference; environment
variables must be set by the shell or deployment platform because Django does
not load that file automatically.

For production, set `DEBUG=False`, provide a unique `SECRET_KEY`, configure the
public hosts and origins, and enable the secure cookie and HTTPS settings after
TLS termination is in place. A missing `SECRET_KEY` is rejected when debug mode
is disabled.

## Production-ready now

- `SECRET_KEY`, `DEBUG`, allowed hosts, CORS origins, and trusted CSRF origins
  are environment-configurable.
- HTTPS redirection and secure session/CSRF cookies are environment-configurable.
- Invalid boolean environment values fail fast instead of being interpreted
  ambiguously.
- PostgreSQL configuration is prepared and can be enabled with `DATABASE_URL`.
  Both `postgres://` and `postgresql://` URLs are supported, with persistent
  connections and connection health checks enabled.
- Redis channel-layer configuration is prepared and can be enabled with
  `REDIS_URL` for multi-process WebSocket delivery.
- The production static, Vite build, media, Nginx, and Daphne separation is
  documented in [Static and media deployment](STATIC_MEDIA_DEPLOYMENT.md).
- An optional PostgreSQL, Redis, Daphne, and Nginx Docker Compose stack is
  prepared for production-like local validation; see
  [Docker Compose production-like setup](DOCKER_PROD_LIKE.md).
- Environment-driven HTTPS, HSTS, proxy, and response-header hardening is
  prepared and documented in [Security hardening](SECURITY_HARDENING.md).
- Environment-driven console/SMTP email configuration is prepared and
  documented in [Email deployment](EMAIL_DEPLOYMENT.md).
- Stdout application logging, safe Docker access logging, and public liveness
  and dependency readiness checks are prepared; see
  [Logging and health checks](LOGGING_AND_HEALTHCHECKS.md).
- A PostgreSQL and media backup/restore runbook with isolated local validation
  guidance is prepared; see [Backup and restore](BACKUP_AND_RESTORE.md).
- Local defaults retain the current SQLite and Vite development workflow.

PostgreSQL remains optional. Local development and CI continue to use the
existing SQLite database unless `DATABASE_URL` is explicitly set.
Redis also remains optional: local development and CI keep using
`InMemoryChannelLayer` unless `REDIS_URL` is explicitly set.

## Still not production-ready

- A production PostgreSQL database has not been provisioned or validated yet.
- A production Redis service has not been provisioned or validated yet.
- A real domain and server/deployment target have not been selected yet.
- A real HTTPS certificate and final Nginx configuration are not installed yet.
- Final production hosts, origins, secrets, and security environment values are
  not configured yet.
- The production server firewall is not configured or verified yet.
- Server, container, proxy, and network hardening is not complete.
- Production backup storage, automation, encryption, retention, and success or
  failure monitoring are not configured yet.
- PostgreSQL and media restore procedures have not been tested in the selected
  production-like recovery environment yet.
- A real SMTP provider, account, verified sender domain, and credentials have
  not been selected or tested yet.
- A production monitoring/log aggregation platform, alert rules, log retention
  policy, and operational dashboard have not been selected or configured yet.
- Incident escalation and service restart/recovery procedures have not been
  tested yet.
- Backup restoration and pre-launch penetration/smoke tests are not complete.

## Next-stage checklist

- [ ] Select a deployment platform and define its runtime, networking, and TLS
  configuration.
- [ ] Create the production PostgreSQL database.
- [ ] Set `DATABASE_URL` on the server.
- [ ] Run migrations against the production database.
- [ ] Test the PostgreSQL backup and restore procedure.
- [ ] Provision Redis.
- [ ] Set `REDIS_URL` on the server.
- [ ] Run the required Daphne/ASGI workers.
- [ ] Verify WebSocket delivery across workers.
- [x] Prepare the static, frontend build, media, Nginx, and Daphne deployment
  plan.
- [x] Prepare the optional Docker Compose production-like validation stack.
- [x] Prepare environment-driven security settings and hardening guidance.
- [x] Prepare environment-driven production SMTP configuration and guidance.
- [x] Prepare console logging and liveness/readiness health checks.
- [x] Prepare the PostgreSQL and media backup/restore runbook.
- [ ] Configure the real Nginx static, media, frontend, API, and WebSocket paths.
- [ ] Configure the real domain and DNS.
- [ ] Install the HTTPS certificate and configure HTTP-to-HTTPS redirects.
- [ ] Apply and verify the final production security environment values.
- [ ] Configure and verify the server firewall.
- [ ] Complete server and service hardening.
- [ ] Select backup storage and automate PostgreSQL and media backups.
- [ ] Encrypt backups and configure access controls and key recovery.
- [ ] Define retention and secure-deletion policies.
- [ ] Monitor and alert on backup success, failure, size, and age.
- [ ] Test an isolated restore in a production-like recovery environment.
- [ ] Select an SMTP provider, supply secret credentials, verify the sender
  domain, and test delivery.
- [ ] Select and configure production monitoring and log aggregation.
- [ ] Configure alert rules, log retention, and the operational dashboard.
- [ ] Test incident escalation and application restart/recovery procedures.
- [ ] Run a backup restore test and focused penetration/smoke test before
  public use.
- [ ] Run `collectstatic` and the Vite build in the real deployment environment.
- [ ] Run an end-to-end deployment test, including admin assets, SPA fallback,
  media persistence, API requests, and WebSockets.
- [ ] Set production hosts, CORS origins, and CSRF trusted origins to the final
  HTTPS domains.
- [ ] Set `DEBUG=False`, generate a unique `SECRET_KEY`, and enable HTTPS
  redirect and secure cookies once TLS is configured.
- [ ] Run Django's deployment checks and the complete backend/frontend test and
  build pipeline in the deployment environment.
- [ ] Add platform monitoring, backup/restore verification, and a rollback
  procedure.
