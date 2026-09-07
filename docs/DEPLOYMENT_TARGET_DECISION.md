# Dastorkon deployment target decision

- **Release:** Dastorkon v0.1.0-mvp
- **Decision status:** Recommended for the first real cafe pilot

## 1. Decision

The recommended first real deployment target is a single Ubuntu VPS with this
layout:

- Nginx is the only public application service and listens on ports 80 and 443.
- Nginx serves the React production build and handles SPA routing.
- Daphne runs the Django ASGI application as a private systemd service.
- PostgreSQL stores application data.
- Redis backs Django Channels and WebSocket delivery.
- Nginx serves collected Django static files and persistent media files from
  explicit server paths.
- A real domain points to the VPS and all public traffic uses HTTPS/WSS.

Nginx must keep the React Admin interface under `/admin/*` and route Django
admin separately to Daphne under `/django-admin/`.

This is a first-pilot architecture, not a permanent scaling commitment.
Capacity and service separation should be reviewed using real traffic and
operational evidence.

## 2. Why this option

- It directly matches the existing
  [Ubuntu deployment runbook](UBUNTU_DEPLOYMENT.md), systemd example, and Nginx
  example already maintained in the repository.
- A single VPS is straightforward to inspect during the first MVP launch:
  service status, logs, paths, permissions, ports, and resource use are visible
  in one controlled environment.
- Nginx routing can be controlled directly, including React SPA fallback,
  `/api/`, `/ws/`, `/static/`, `/media/`, React `/admin/*`, and Django
  `/django-admin/`.
- Static build artifacts and persistent media have explicit, separate paths,
  ownership rules, and backup responsibilities.
- The architecture is sufficient for a controlled first cafe pilot while
  retaining PostgreSQL durability and Redis-backed realtime delivery.
- It avoids presenting the local Docker production-like stack as finished
  production automation. That stack intentionally uses local HTTP, example
  credentials, a single Daphne process, and Docker-managed local volumes.

## 3. Alternatives considered

### Docker Compose on a VPS

This could become a valid deployment option after production-specific
hardening, secret management, HTTPS, backup automation, resource limits,
monitoring, controlled migrations, and rollback procedures are designed. The
current Compose file is intentionally a local production-like validation tool,
so it is not the primary recommendation for the first real deployment.

### Managed PaaS

A managed platform could reduce server maintenance and may be attractive after
the pilot. It would first require a platform decision and verified support for
Daphne/ASGI, WebSockets, Redis, PostgreSQL, persistent media, custom routing,
and the React build. The repository's current operational artifacts are more
directly aligned with Ubuntu and Nginx.

### Shared hosting

Traditional shared hosting often does not provide the required control over
long-running ASGI services, WebSocket proxying, Redis, system packages, Nginx
routing, and persistent media permissions. It is therefore a poor fit for the
current MVP architecture.

### Local network only

A cafe-local server can support an isolated demonstration or contingency
experiment, but it does not validate a real public domain, trusted HTTPS,
remote operational access, or internet-based customer device behavior. It is
not the primary real-deployment target.

## 4. Minimum server requirements

A practical starting point for a controlled MVP pilot is:

- Ubuntu 22.04 LTS or 24.04 LTS, fully patched.
- At least 2 vCPU.
- At least 2 GB RAM; 4 GB is preferred when PostgreSQL, Redis, Nginx, and
  Daphne share the VPS.
- At least 30 GB SSD storage, with free-space monitoring and capacity reserved
  for PostgreSQL, media, build artifacts, and logs.
- Secure SSH access with an approved administrator and key-based access policy.
- Permission to install and operate Nginx, PostgreSQL, Redis, Python, Node.js,
  npm, Git, and systemd services.
- A public IPv4 address.
- Control of the production domain's DNS records.
- An off-host location for encrypted database and media backups.

These values are an MVP starting point, not measured capacity guarantees.
Monitor CPU, memory, disk, database growth, request latency, and WebSocket
behavior during the pilot and resize or separate services when evidence
requires it.

## 5. Required decisions before deployment

- [ ] Select the production domain name and identify who controls DNS.
- [ ] Select the VPS provider and account owner.
- [ ] Select the server region based on cafe latency, support, and applicable
  data requirements.
- [ ] Choose the SSH administrator and dedicated application deploy username.
- [ ] Approve the production PostgreSQL password generation, storage, access,
  and rotation policy.
- [ ] Select the off-host PostgreSQL and media backup location, retention,
  monitoring, and restore-test owner.
- [ ] Decide whether any reviewed demo data is permitted or whether the
  production database must contain real cafe data only. Never retain demo
  passwords in public use.
- [ ] Name the people who will test Admin, Waiter, Kitchen, and Customer roles
  on the production route.
- [ ] Name the technical and business owners authorized to approve go-live.

Record these decisions and their owners before adapting deployment examples or
creating production secrets.

## 6. Deployment mode summary

| Area | Local development | Docker production-like validation | First real Ubuntu VPS deployment |
| --- | --- | --- | --- |
| Purpose | Daily development and tests | Local architecture/integration check | Controlled cafe pilot |
| Public entry point | Vite and local Daphne | Nginx on local port 8080 | Nginx on public 80/443 |
| Frontend | Vite development server | Built React assets served by Nginx | Built React assets served by Nginx |
| Backend | Local Daphne | Containerized single Daphne process | Daphne systemd service on loopback |
| Database | SQLite by default | PostgreSQL container | Production PostgreSQL |
| Channels | In-memory layer by default | Redis container | Protected production Redis |
| Media | Local repository `media/` | Docker-managed media volume | Explicit persistent path with off-host backup |
| HTTPS | Not required | Local HTTP only | Required real domain, HTTPS, and WSS |
| Configuration | Local defaults/examples | Ignored local `.env.docker` | Protected server environment and reviewed secrets |
| Status | Supported developer workflow | Validation only | Recommended first real target |

## 7. Next action

Select the actual VPS provider, server region, and domain. Then fill in the
server information checklist in
[Production deployment preparation](PRODUCTION_DEPLOYMENT_PREP.md) before
provisioning services or adapting the Nginx, systemd, and environment examples.
