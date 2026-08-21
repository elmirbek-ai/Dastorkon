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
- Local defaults retain the current SQLite and Vite development workflow.

PostgreSQL remains optional. Local development and CI continue to use the
existing SQLite database unless `DATABASE_URL` is explicitly set.
Redis also remains optional: local development and CI keep using
`InMemoryChannelLayer` unless `REDIS_URL` is explicitly set.

## Still not production-ready

- A production PostgreSQL database has not been provisioned or validated yet.
- A production Redis service has not been provisioned or validated yet.
- A real domain and server/deployment target have not been selected yet.
- Real Nginx filesystem paths and HTTPS termination are not configured yet.
- Server, container, proxy, and network hardening is not complete.
- Persistent media storage and media/PostgreSQL backup procedures are not
  configured and tested yet.
- Production monitoring and logging are not configured yet.
- A complete deployment test has not been run on a production-like server.

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
- [ ] Configure the real Nginx static, media, frontend, API, and WebSocket paths.
- [ ] Configure the real domain and DNS.
- [ ] Configure HTTPS termination and HTTP-to-HTTPS redirects.
- [ ] Complete server and service hardening.
- [ ] Configure and test backups for media and PostgreSQL.
- [ ] Configure production monitoring and logging.
- [ ] Run `collectstatic` and the Vite build in the real deployment environment.
- [ ] Run an end-to-end deployment test, including admin assets, SPA fallback,
  media persistence, API requests, and WebSockets.
- [ ] Set production hosts, CORS origins, and CSRF trusted origins to the final
  HTTPS domains.
- [ ] Set `DEBUG=False`, generate a unique `SECRET_KEY`, and enable HTTPS
  redirect and secure cookies once TLS is configured.
- [ ] Run Django's deployment checks and the complete backend/frontend test and
  build pipeline in the deployment environment.
- [ ] Add monitoring, logging, health checks, backup/restore verification, and
  a rollback procedure.
