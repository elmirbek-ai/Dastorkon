# Logging and health checks

## Console logging strategy

Dastorkon writes application logs to standard output. This works without
additional services during local development and lets Docker, systemd, or a
hosting platform capture the process stream in production. No application log
files are created by default, so rotation and disk lifecycle stay with the
runtime platform.

Set the application threshold with:

```dotenv
LOG_LEVEL=INFO
```

Supported values are `DEBUG`, `INFO`, `WARNING`, `ERROR`, and `CRITICAL`,
case-insensitively. The default is `DEBUG` when `DEBUG=True` and `INFO` when
`DEBUG=False`. Django test runs use an `ERROR` console threshold unless
`LOG_LEVEL` is supplied explicitly, keeping expected error-response tests
quiet.

The console format contains timestamp, severity, logger name, and message.
Django and Dastorkon application logs use the configured threshold. SQL debug
logging remains at `WARNING` even in local debug mode because query parameters
can contain customer or authentication data.

The Docker Daphne command uses `--verbosity 0`, disabling Daphne's independent
HTTP/WebSocket access logger. Nginx remains the HTTP access-log boundary and
uses a deliberately small format containing client address, timestamp, method,
path, protocol, status, and response size. The format uses `$uri`, not the raw
request target, so query strings are omitted. Nginx access logging is disabled
for `/ws/`, Django static files, and health probes. Nginx errors and the safe
remaining access events continue to flow through container output.

## Sensitive logging rules

Never log:

- `Authorization` headers, JWTs, session or CSRF cookies;
- `SECRET_KEY`, SMTP passwords, `DATABASE_URL`, or `REDIS_URL`;
- environment dumps, request bodies containing credentials, or password-reset
  material;
- uploaded private content or complete exception data copied into support
  tickets;
- WebSocket query strings.

Staff WebSockets currently authenticate with a JWT in the `token` query
parameter. Query strings therefore must not appear in Nginx, Daphne, CDN, load
balancer, analytics, or application logs. The checked-in Docker Nginx config
disables `/ws/` access logging, and Daphne access logging is disabled. Apply the
same rule to the real production ingress.

Readiness failures emit only generic dependency labels such as
`Readiness database check failed.` Exception messages are intentionally not
logged because driver errors may contain internal hosts, usernames, or other
deployment details.

## Health endpoints

Both endpoints are public `GET` endpoints and return fixed, minimal JSON. They
do not require authentication and never expose versions, environment values,
hostnames, credentials, stack traces, or user data.

| Endpoint | Purpose | Dependencies |
| --- | --- | --- |
| `/api/health/` | Liveness: confirms the Django process can answer HTTP. | None |
| `/api/health/ready/` | Readiness: confirms the process can serve dependency-backed requests. | Database, plus Redis when `REDIS_URL` is set |

Healthy examples:

```json
{"status": "ok"}
```

```json
{"status": "ready", "database": "ok", "redis": "ok"}
```

When local SQLite is used and Redis is not configured, the readiness response
omits the Redis field. A failed dependency returns HTTP 503 with only fixed
labels, for example:

```json
{"status": "unavailable", "database": "error"}
```

The Redis check uses short connection and socket timeouts and runs only when
`REDIS_URL` is configured. Health checks do not test SMTP delivery, media
storage durability, frontend rendering, migrations, or cross-worker WebSocket
delivery; validate those separately.

Test locally without authentication:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health/
Invoke-RestMethod http://127.0.0.1:8000/api/health/ready/
```

## Docker and production probes

The backend container health check calls the readiness endpoint directly at
`http://127.0.0.1:8000/api/health/ready/` with Python's standard library. It
does not require `curl` or another image dependency. Because Docker configures
both PostgreSQL and Redis, the container is healthy only when Django can reach
both services. Nginx waits for that backend health check before starting.

External operators can call the same paths through Nginx, for example
`http://localhost:8080/api/health/`. A real hosting platform should use:

- liveness to decide whether a stuck application process needs restarting;
- readiness to decide whether an instance should receive traffic;
- conservative timeouts and failure thresholds to avoid restart loops during
  brief dependency interruptions.

For systemd, a separate timer or monitoring agent can call the endpoints with
`curl --fail --silent --show-error`; systemd process supervision should still
watch Daphne itself. Nginx upstream checks or a hosting load balancer can use
the readiness route, while public uptime monitoring normally uses liveness.
The [Ubuntu deployment runbook](UBUNTU_DEPLOYMENT.md) supplies example systemd
and Nginx files that send application and proxy output to journald and includes
post-deployment health verification commands. Review logs with
`journalctl -u dastorkon.service` and `journalctl -u nginx` on that layout.

## Remaining production monitoring work

The repository provides signals, not a complete observability platform. Before
public launch:

- choose a monitoring and log-aggregation platform;
- define uptime, readiness, error-rate, latency, database, Redis, disk, CPU,
  memory, and certificate-expiry alerts;
- configure access controls, redaction, retention, rotation, deletion, and
  storage quotas for logs;
- build an operational dashboard with service-level indicators;
- document on-call ownership and escalation paths;
- test alert delivery, process restart, dependency outage, recovery, and
  incident communication procedures;
- decide whether structured JSON logs and trace/correlation identifiers are
  needed for the selected platform.
