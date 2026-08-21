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
- Static files have a collection target at `staticfiles/` through `STATIC_ROOT`.
- Local defaults retain the current SQLite and Vite development workflow.

## Still not production-ready

- PostgreSQL is not configured yet; the project still uses local SQLite.
- Redis and `channels_redis` are not configured yet; the in-memory channel
  layer is limited to a single application process.
- Static and media serving is not finalized yet.
- A deployment target has not been selected yet.

## Next-stage checklist

- [ ] Select a deployment platform and define its runtime, networking, and TLS
  configuration.
- [ ] Provision PostgreSQL, add its driver, configure database environment
  variables, and verify migrations and backups.
- [ ] Provision Redis, add `channels_redis`, configure the channel layer, and
  test WebSocket delivery across multiple application processes.
- [ ] Choose production static and media storage/serving, run `collectstatic`,
  and verify uploads and cache behavior.
- [ ] Set production hosts, CORS origins, and CSRF trusted origins to the final
  HTTPS domains.
- [ ] Set `DEBUG=False`, generate a unique `SECRET_KEY`, and enable HTTPS
  redirect and secure cookies once TLS is configured.
- [ ] Run Django's deployment checks and the complete backend/frontend test and
  build pipeline in the deployment environment.
- [ ] Add monitoring, logging, health checks, backup/restore verification, and
  a rollback procedure.
