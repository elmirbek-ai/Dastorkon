# Staging CI/CD

## Delivery architecture

The staging path is intentionally gated by the same commit that passed CI:

```text
feature/*
  -> pull request
  -> CI (Backend, Frontend, Docker)
  -> merge to main
  -> CI on main
  -> Deploy Staging
  -> Hetzner
  -> PostgreSQL backup
  -> exact tested SHA
  -> build backend and nginx
  -> deploy backend
  -> backend health check
  -> deploy nginx
  -> final verification
```

`.github/workflows/deploy-staging.yml` listens for completion of the workflow
named `CI`. It runs only when that workflow succeeded for a `push` to `main`.
The deployment checks out and sends `github.event.workflow_run.head_sha`, not
the SHA of the `workflow_run` event. The server fetches `origin/main` and
deploys only when that tested SHA is still the current main commit. If main has
advanced, the obsolete deployment exits successfully without changing the
running release so the newer workflow can deploy it.

GitHub Actions serializes staging deployments with the
`staging-deployment` concurrency group. A deployment already running is not
cancelled midway. The remote script separately holds a non-blocking `flock` on
`/home/deploy/dastorkon-deploy-state/deploy.lock` for its entire execution.
GitHub concurrency prevents overlapping workflow jobs, while the server lock
also prevents a manual or otherwise independently started deployment from
running at the same time.

## GitHub Environment and secrets

Create a GitHub Environment named `staging` and define these environment
secrets:

| Secret | Purpose |
| --- | --- |
| `STAGING_HOST` | Hetzner server hostname or IP address |
| `STAGING_USER` | SSH deployment user (`deploy` for the current server) |
| `STAGING_SSH_KEY` | Private half of the dedicated deployment key |
| `STAGING_KNOWN_HOSTS` | Verified OpenSSH known-hosts entry for the server |

`STAGING_SSH_KEY` must be a dedicated deployment key, not a developer's
personal SSH private key. Restrict the public key and rotate it independently.
Build `STAGING_KNOWN_HOSTS` out of band and verify the server fingerprint over
a trusted channel before saving it. The workflow enforces
`StrictHostKeyChecking=yes`.

The workflow has only `contents: read` permission. No package registry access
is needed. Environment protection rules or required reviewers can be added to
`staging` without changing the workflow.

The server keeps its environment at `/srv/dastorkon/.env.docker`. That file is
ignored by Git, must remain only on the server, and is never printed or copied
by the workflow. The `deploy` user must already have non-interactive,
appropriately restricted `sudo` access to the Docker CLI. Do not add the user
to the Docker group for this workflow.

The repository at `/srv/dastorkon` must remain checked out on its local `main`
branch. A detached HEAD or any other local branch is an operational error. The
automation aborts instead of switching branches or resetting an unexpected
branch.

## Deployment sequence

The workflow uses two native SSH sessions. The first session uploads the
reviewed `scripts/deploy_staging.sh` to a mode-700 temporary file under
`/home/deploy/dastorkon-deploy-state` and atomically renames it to a filename
containing only the tested commit SHA. The second session executes that remote
file with stdin disconnected from the uploaded script. This separation keeps
stdin consumers such as Docker Compose or `pg_dump` from consuming the
remaining shell program and causing a false-successful early EOF.

After execution, the workflow makes a best-effort SSH cleanup of only that
uploaded script and its temporary path. Cleanup runs after success or failure,
and the workflow exits with the deployment SSH status rather than hiding a
deployment failure. Exact-SHA validation and the server-side deployment lock
remain enforced by the uploaded script.

The script then:

1. Validates the full target commit SHA and repository path, then requires the
   local branch to be exactly `main`.
2. Acquires the external server-side deployment lock without waiting, then
   validates the environment file, required commands, Docker access, and clean
   Git working tree.
3. Fetches `origin/main`, confirms the target exists, and rejects commits that
   are not on current main. An older main ancestor is treated as a stale run
   and skipped.
4. Creates a non-empty custom-format PostgreSQL dump under
   `/home/deploy/dastorkon-backups` using the already-running `db` service.
   Existing backups are retained.
5. Fetches and checks main again after the backup, records the prior HEAD under
   `/home/deploy/dastorkon-deploy-state`, then runs
   `git reset --hard <tested-sha>`.
6. Validates Compose and builds only the `backend` and `nginx` images.
7. Recreates only `backend`, leaving PostgreSQL and Redis running, and waits in
   a bounded loop for the backend container health check.
8. Recreates only `nginx`, then requires successful responses from
   `http://127.0.0.1/api/health/ready/` and `http://127.0.0.1/`.
9. Confirms backend, PostgreSQL, and Redis are healthy; Nginx is running; Git is
   clean; and HEAD equals the tested commit.
10. Stores the successful SHA and timestamp outside the repository.

Docker commands continue to use:

```bash
sudo docker compose \
  --env-file .env.docker \
  -f docker-compose.prod-like.yml
```

The script never runs `docker compose down`, deletes or prunes volumes, prints
the environment file, or recreates PostgreSQL and Redis during a normal
release.

## Failure and rollback behavior

Any failure after the source update begins triggers a cautious application
rollback attempt. The script resets Git to the recorded previous HEAD, rebuilds
the previous backend and Nginx images, recreates backend first, waits for its
health check, recreates Nginx, and verifies both HTTP endpoints. It prints the
original failing stage and retains a non-zero exit status even if the
application rollback succeeds. If rollback fails, container status and recent
application logs are emitted for diagnosis without intentionally printing
environment values.

PostgreSQL is **never restored automatically**. A new release may have already
applied migrations that old application code cannot safely use. The script
prints the pre-deployment backup path, but an operator must review migration
state and choose a manual database recovery plan. A dump on the same host is a
deployment safety checkpoint, not a complete off-host backup strategy.

## Emergency diagnostics

Normal deployments should go through GitHub Actions. For an incident, connect
as the deployment user and inspect without altering the stack:

```bash
cd /srv/dastorkon
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main

sudo docker compose \
  --env-file .env.docker \
  -f docker-compose.prod-like.yml \
  ps

sudo docker compose \
  --env-file .env.docker \
  -f docker-compose.prod-like.yml \
  logs --tail=100 backend nginx

curl --fail --show-error http://127.0.0.1/api/health/ready/
curl --fail --show-error http://127.0.0.1/

ls -lh /home/deploy/dastorkon-backups
cat /home/deploy/dastorkon-deploy-state/last_successful_sha
cat /home/deploy/dastorkon-deploy-state/last_successful_timestamp
```

If GitHub Actions is unavailable and an authorized operator approves an
emergency deployment, use the same reviewed script and an explicit current
main SHA:

```bash
cd /srv/dastorkon
git fetch origin main
target_sha="$(git rev-parse origin/main)"
git show "${target_sha}:scripts/deploy_staging.sh" | bash -s -- "$target_sha"
```

Do not replace this with a floating `git pull`, do not bypass the clean-tree or
backup checks, and do not restore a database dump without a reviewed recovery
plan.
