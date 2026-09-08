#!/usr/bin/env bash

set -Eeuo pipefail

readonly DEPLOY_DIR="/srv/dastorkon"
readonly ENV_FILE=".env.docker"
readonly COMPOSE_FILE="docker-compose.prod-like.yml"
readonly BACKUP_DIR="/home/deploy/dastorkon-backups"
readonly STATE_DIR="/home/deploy/dastorkon-deploy-state"
readonly BACKEND_HEALTH_ATTEMPTS=30
readonly HTTP_HEALTH_ATTEMPTS=24
readonly RETRY_DELAY_SECONDS=5

TARGET_SHA=""
PREVIOUS_HEAD=""
BACKUP_PATH="not-created"
CURRENT_STAGE="preflight"
SOURCE_MOVE_STARTED=0

log() {
  printf '[staging-deploy] %s\n' "$*"
}

fail_before_source_update() {
  printf '[staging-deploy] ERROR (%s): %s\n' "$CURRENT_STAGE" "$*" >&2
  exit 1
}

compose() {
  sudo -n docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@" < /dev/null
}

docker_inspect() {
  sudo -n docker inspect "$@" < /dev/null
}

service_container_id() {
  compose ps -q "$1" 2>/dev/null
}

service_status() {
  local container_id

  container_id="$(service_container_id "$1")"
  if [[ -z "$container_id" ]]; then
    printf 'missing'
    return 0
  fi

  docker_inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || printf 'unknown'
}

service_health() {
  local container_id

  container_id="$(service_container_id "$1")"
  if [[ -z "$container_id" ]]; then
    printf 'missing'
    return 0
  fi

  docker_inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$container_id" 2>/dev/null || printf 'unknown'
}

wait_for_service_health() {
  local service="$1"
  local attempt
  local status
  local health

  log "Waiting for ${service} health (maximum $((BACKEND_HEALTH_ATTEMPTS * RETRY_DELAY_SECONDS)) seconds)."
  for ((attempt = 1; attempt <= BACKEND_HEALTH_ATTEMPTS; attempt += 1)); do
    status="$(service_status "$service")"
    health="$(service_health "$service")"
    if [[ "$status" == "running" && "$health" == "healthy" ]]; then
      log "${service} is healthy."
      return 0
    fi
    sleep "$RETRY_DELAY_SECONDS"
  done

  printf '[staging-deploy] %s did not become healthy (status=%s, health=%s).\n' \
    "$service" "$(service_status "$service")" "$(service_health "$service")" >&2
  return 1
}

wait_for_http() {
  local url="$1"
  local attempt

  log "Waiting for ${url} (maximum $((HTTP_HEALTH_ATTEMPTS * RETRY_DELAY_SECONDS)) seconds)."
  for ((attempt = 1; attempt <= HTTP_HEALTH_ATTEMPTS; attempt += 1)); do
    if curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
      --output /dev/null "$url" 2>/dev/null; then
      log "HTTP check succeeded: ${url}"
      return 0
    fi
    sleep "$RETRY_DELAY_SECONDS"
  done

  printf '[staging-deploy] HTTP check failed: %s\n' "$url" >&2
  return 1
}

require_healthy_service() {
  local service="$1"
  local status
  local health

  status="$(service_status "$service")"
  health="$(service_health "$service")"
  if [[ "$status" != "running" || "$health" != "healthy" ]]; then
    printf '[staging-deploy] %s verification failed (status=%s, health=%s).\n' \
      "$service" "$status" "$health" >&2
    return 1
  fi
}

require_running_service() {
  local service="$1"
  local status

  status="$(service_status "$service")"
  if [[ "$status" != "running" ]]; then
    printf '[staging-deploy] %s verification failed (status=%s).\n' \
      "$service" "$status" >&2
    return 1
  fi
}

verify_release() {
  local expected_sha="$1"
  local deployed_sha
  local repository_status

  require_healthy_service backend
  require_healthy_service db
  require_healthy_service redis
  require_running_service nginx

  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --output /dev/null http://127.0.0.1/api/health/ready/
  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    --output /dev/null http://127.0.0.1/

  repository_status="$(git status --porcelain --untracked-files=normal)"
  if [[ -n "$repository_status" ]]; then
    printf '[staging-deploy] Repository became dirty during deployment.\n' >&2
    return 1
  fi

  deployed_sha="$(git rev-parse HEAD)"
  if [[ "$deployed_sha" != "$expected_sha" ]]; then
    printf '[staging-deploy] Deployed HEAD mismatch: expected %s, got %s.\n' \
      "$expected_sha" "$deployed_sha" >&2
    return 1
  fi
}

print_diagnostics() {
  log "Container status:"
  compose ps || true
  log "Recent application container logs:"
  compose logs --no-color --tail=80 backend nginx || true
}

attempt_rollback() {
  local rollback_failed=0

  log "Attempting application rollback to ${PREVIOUS_HEAD}."

  if ! git reset --hard "$PREVIOUS_HEAD"; then
    printf '[staging-deploy] Rollback source reset failed.\n' >&2
    rollback_failed=1
  fi

  if ((rollback_failed == 0)) && ! compose config -q; then
    printf '[staging-deploy] Rollback Compose validation failed.\n' >&2
    rollback_failed=1
  fi

  if ((rollback_failed == 0)) && ! compose build backend nginx; then
    printf '[staging-deploy] Rollback image build failed.\n' >&2
    rollback_failed=1
  fi

  if ((rollback_failed == 0)) && ! compose up -d --no-deps --force-recreate backend; then
    printf '[staging-deploy] Rollback backend recreation failed.\n' >&2
    rollback_failed=1
  fi

  if ((rollback_failed == 0)) && ! wait_for_service_health backend; then
    printf '[staging-deploy] Rollback backend did not become healthy.\n' >&2
    rollback_failed=1
  fi

  if ((rollback_failed == 0)) && ! compose up -d --no-deps --force-recreate nginx; then
    printf '[staging-deploy] Rollback nginx recreation failed.\n' >&2
    rollback_failed=1
  fi

  if ((rollback_failed == 0)) && ! wait_for_http http://127.0.0.1/api/health/ready/; then
    printf '[staging-deploy] Rollback readiness check failed.\n' >&2
    rollback_failed=1
  fi

  if ((rollback_failed == 0)) && ! wait_for_http http://127.0.0.1/; then
    printf '[staging-deploy] Rollback root check failed.\n' >&2
    rollback_failed=1
  fi

  if ((rollback_failed == 0)) && ! verify_release "$PREVIOUS_HEAD"; then
    printf '[staging-deploy] Rollback final verification failed.\n' >&2
    rollback_failed=1
  fi

  if ((rollback_failed == 0)); then
    log "Application rollback completed at ${PREVIOUS_HEAD}."
  else
    printf '[staging-deploy] ERROR: application rollback did not complete.\n' >&2
  fi

  printf '[staging-deploy] PostgreSQL was not restored automatically.\n' >&2
  printf '[staging-deploy] Database migrations may require manual recovery.\n' >&2
  printf '[staging-deploy] Pre-deployment database backup: %s\n' "$BACKUP_PATH" >&2
  print_diagnostics

  return "$rollback_failed"
}

handle_error() {
  local original_exit_code="$1"
  local failed_line="$2"
  local rollback_exit_code=0

  trap - ERR
  set +e

  printf '[staging-deploy] ERROR: stage "%s" failed at line %s (exit %s).\n' \
    "$CURRENT_STAGE" "$failed_line" "$original_exit_code" >&2

  if ((SOURCE_MOVE_STARTED == 1)); then
    attempt_rollback
    rollback_exit_code=$?
    if ((rollback_exit_code != 0)); then
      printf '[staging-deploy] Original deployment failure remains the primary error; rollback also failed.\n' >&2
    fi
  elif [[ "$BACKUP_PATH" != "not-created" ]]; then
    printf '[staging-deploy] Source was not changed. Database backup: %s\n' "$BACKUP_PATH" >&2
  fi

  if ((original_exit_code == 0)); then
    original_exit_code=1
  fi
  exit "$original_exit_code"
}

trap 'handle_error $? $LINENO' ERR

target_relation() {
  local remote_main_sha

  remote_main_sha="$(git rev-parse 'refs/remotes/origin/main^{commit}')"
  if [[ "$TARGET_SHA" == "$remote_main_sha" ]]; then
    return 0
  fi

  if git merge-base --is-ancestor "$TARGET_SHA" "$remote_main_sha"; then
    return 10
  fi

  return 20
}

validate_current_main_or_exit() {
  local relation

  if target_relation; then
    return 0
  else
    relation=$?
  fi

  if ((relation == 10)); then
    log "Stale deployment skipped: origin/main has moved past ${TARGET_SHA}."
    exit 0
  fi

  fail_before_source_update "Target ${TARGET_SHA} is not the current origin/main commit or its ancestor."
}

if (($# != 1)); then
  fail_before_source_update "Usage: bash deploy_staging.sh <target_commit_sha>"
fi

if [[ ! "$1" =~ ^[0-9a-fA-F]{40}$ ]]; then
  fail_before_source_update "Target must be a full 40-character Git commit SHA."
fi
TARGET_SHA="${1,,}"

for required_command in git curl flock sudo; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    fail_before_source_update "Required command is unavailable: ${required_command}"
  fi
done

if [[ ! -d "$DEPLOY_DIR/.git" ]]; then
  fail_before_source_update "Deployment repository is missing: ${DEPLOY_DIR}"
fi

cd "$DEPLOY_DIR"

current_branch="$(git symbolic-ref --quiet --short HEAD || true)"
if [[ "$current_branch" != "main" ]]; then
  fail_before_source_update \
    "Deployment repository must be on branch main; current branch is ${current_branch:-detached HEAD}."
fi

CURRENT_STAGE="deployment-lock"
install -d -m 700 "$STATE_DIR"
exec 9>"${STATE_DIR}/deploy.lock"
if ! flock -n 9; then
  fail_before_source_update "Another staging deployment is already running."
fi

if [[ ! -f "$ENV_FILE" ]]; then
  fail_before_source_update "Required server environment file is missing: ${DEPLOY_DIR}/${ENV_FILE}"
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  fail_before_source_update "Server working tree is dirty; refusing to discard local changes."
fi

if ! sudo -n docker version < /dev/null >/dev/null 2>&1; then
  fail_before_source_update "Passwordless sudo access to Docker is unavailable."
fi
if ! sudo -n docker compose version < /dev/null >/dev/null 2>&1; then
  fail_before_source_update "Docker Compose is unavailable through sudo."
fi

CURRENT_STAGE="fetch-main"
git fetch --prune origin main

if ! git cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null; then
  fail_before_source_update "Target commit is unavailable after fetching origin/main."
fi
if [[ "$(git rev-parse "${TARGET_SHA}^{commit}")" != "$TARGET_SHA" ]]; then
  fail_before_source_update "Target does not resolve to the requested commit."
fi
validate_current_main_or_exit

install -d -m 700 "$BACKUP_DIR"
PREVIOUS_HEAD="$(git rev-parse HEAD)"

CURRENT_STAGE="database-backup"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_PATH="${BACKUP_DIR}/postgres-${timestamp}-${TARGET_SHA:0:12}.dump"
backup_temporary_path="${BACKUP_PATH}.tmp"
umask 077

log "Creating PostgreSQL backup before deployment."
if ! compose exec -T db sh -c \
  'exec pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" "$POSTGRES_DB"' \
  < /dev/null > "$backup_temporary_path"; then
  rm -f "$backup_temporary_path"
  fail_before_source_update "PostgreSQL backup command failed."
fi
if [[ ! -s "$backup_temporary_path" ]]; then
  rm -f "$backup_temporary_path"
  fail_before_source_update "PostgreSQL backup is empty."
fi
mv "$backup_temporary_path" "$BACKUP_PATH"
chmod 600 "$BACKUP_PATH"
log "Database backup created: ${BACKUP_PATH}"

CURRENT_STAGE="revalidate-main"
git fetch --prune origin main
validate_current_main_or_exit
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  fail_before_source_update "Server working tree changed during preflight; refusing deployment."
fi

printf '%s\n' "$PREVIOUS_HEAD" > "${STATE_DIR}/previous_sha"
printf '%s\n' "$TARGET_SHA" > "${STATE_DIR}/pending_target_sha"
printf '%s\n' "$timestamp" > "${STATE_DIR}/pending_timestamp"

CURRENT_STAGE="update-source"
SOURCE_MOVE_STARTED=1
git reset --hard "$TARGET_SHA"
test "$(git rev-parse HEAD)" = "$TARGET_SHA"

CURRENT_STAGE="compose-validation"
compose config -q

CURRENT_STAGE="image-build"
compose build backend nginx

CURRENT_STAGE="backend-deployment"
compose up -d --no-deps --force-recreate backend
wait_for_service_health backend

CURRENT_STAGE="nginx-deployment"
compose up -d --no-deps --force-recreate nginx
wait_for_http http://127.0.0.1/api/health/ready/
wait_for_http http://127.0.0.1/

CURRENT_STAGE="final-verification"
verify_release "$TARGET_SHA"

printf '%s\n' "$TARGET_SHA" > "${STATE_DIR}/last_successful_sha.tmp"
mv "${STATE_DIR}/last_successful_sha.tmp" "${STATE_DIR}/last_successful_sha"
printf '%s\n' "$timestamp" > "${STATE_DIR}/last_successful_timestamp.tmp"
mv "${STATE_DIR}/last_successful_timestamp.tmp" "${STATE_DIR}/last_successful_timestamp"
rm -f \
  "${STATE_DIR}/pending_target_sha" \
  "${STATE_DIR}/pending_timestamp"

log "Deployment succeeded."
log "Commit: ${TARGET_SHA}"
log "Previous commit: ${PREVIOUS_HEAD}"
log "Database backup: ${BACKUP_PATH}"
log "Services: backend=healthy db=healthy redis=healthy nginx=running"
