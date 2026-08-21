# Backup and restore

## Purpose and safety boundary

This runbook defines what Dastorkon must back up and how to validate backups
without overwriting the live database or media volume. The commands use the
existing production-like Docker Compose stack and PowerShell on Windows. They
are examples for controlled local validation, not automated production jobs.

Never start with a production restore. Restore into a separate database,
directory, volume, or server, validate it, and only then plan a reviewed
production recovery. No command in this runbook uses `docker compose down
--volumes`, replaces the current PostgreSQL database, or writes restored files
into the active media directory.

Keep backup files outside the Git repository. Database dumps and media archives
can contain personal data and business data and must never be committed.

## Backup scope

Back up these four areas:

1. **PostgreSQL application database.** This contains users, restaurants,
   tables, orders, sessions, configuration records, and migration state.
2. **Media files.** This contains uploaded and generated files under
   `MEDIA_ROOT`, including menu images. Database rows and their referenced media
   should be captured at a coordinated point whenever practical.
3. **Environment and secrets inventory.** Record which variable names exist,
   where their values are stored, who owns them, how they are recovered, and
   how they are rotated. Secret values need a separate encrypted secret-manager
   recovery process; do not place plaintext secrets in the database or media
   archive.
4. **Deployment configuration.** Preserve reviewed versions of Nginx, Compose,
   service definitions, DNS/TLS requirements, dependency versions, migration
   procedures, and operational runbooks. Git plus a protected remote normally
   covers repository configuration, but platform settings must be inventoried
   separately.

The following are generated or reinstallable artifacts, not primary backup
data:

- `staticfiles/`, which is recreated with `collectstatic`;
- `frontend/dist/`, which is recreated with the Vite build;
- Docker images, which should be rebuilt from pinned source and dependencies;
- `.venv/`, `venv/`, and `frontend/node_modules/`, which are recreated from
  dependency manifests;
- Python caches and other temporary build output.

Preserving a release image for rollback can still be useful, but it does not
replace database, media, secret-recovery, or configuration backups.

## RPO and RTO

The recovery point objective (RPO) answers: **how much recent data can the
business accept losing?** A daily-only backup can lose almost 24 hours of new
orders, accounts, settings, and media. If that is unacceptable, add more
frequent dumps, storage snapshots, or PostgreSQL continuous recovery.

The recovery time objective (RTO) answers: **how quickly must service return?**
It includes provisioning infrastructure, restoring the database and media,
injecting secrets, running checks, and validating the application before
traffic resumes.

Choose explicit RPO and RTO targets with the restaurant operators. Measure
restore exercises against them instead of assuming the targets are achievable.

## Minimum MVP schedule

- Back up PostgreSQL at least daily.
- Back up media at least daily.
- Take a coordinated database and media backup before every risky deployment,
  data migration, bulk import, or operational change.
- Increase frequency as order volume grows or the agreed RPO becomes shorter.
- Keep multiple generations so corruption or accidental deletion discovered
  later does not invalidate every available copy.

A practical retention policy should define daily, weekly, and longer-lived
copies, plus deletion requirements. The exact periods depend on business,
privacy, and legal requirements. Monitor every scheduled run and alert on
failure, unusual size, missed backups, and checksum errors.

## Local Docker prerequisites

Start from the repository root. Use the existing ignored `.env.docker` file and
running production-like stack. Choose an explicit backup directory outside the
repository:

```powershell
$backupRoot = "C:\DastorkonBackups"
$composeFile = "docker-compose.prod-like.yml"
$dockerEnvFile = ".env.docker"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
```

Confirm the path before continuing. Restrict access to this directory and use
only fake/local Docker data during local validation.

## PostgreSQL backup

Create a custom-format dump inside the `db` container, copy it to the explicit
host backup directory, and remove only the temporary container file:

```powershell
$databaseBackup = Join-Path $backupRoot "dastorkon-db-$timestamp.dump"

docker compose --env-file $dockerEnvFile -f $composeFile exec -T db sh -c 'pg_dump --format=custom --no-owner --no-acl --file=/tmp/dastorkon-postgres.dump --username="$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --env-file $dockerEnvFile -f $composeFile cp db:/tmp/dastorkon-postgres.dump $databaseBackup
docker compose --env-file $dockerEnvFile -f $composeFile exec -T db rm -f /tmp/dastorkon-postgres.dump

Get-Item -LiteralPath $databaseBackup
Get-FileHash -Algorithm SHA256 -LiteralPath $databaseBackup
```

The custom format supports `pg_restore` and avoids PowerShell binary-redirection
encoding problems. A successful `pg_dump` and a checksum are useful, but they
do not prove the dump can be restored.

For a consistent database/media pair, coordinate application writes or use
storage/database snapshot facilities appropriate to the real deployment. A
database dump taken while uploads continue may reference media that was not in
the matching archive, or vice versa.

## PostgreSQL restore validation

The following procedure writes only to a newly named validation database. The
timestamped name reduces collision risk, and `createdb` fails rather than
overwriting a database that already exists. Confirm that `$validationDatabase`
is not the active value of `POSTGRES_DB` before running any command.

```powershell
$validationDatabase = "dastorkon_restore_validation_$($timestamp.Replace('-', ''))"
$containerDump = "/tmp/dastorkon-restore-validation.dump"

Write-Output "New validation database: $validationDatabase"
docker compose --env-file $dockerEnvFile -f $composeFile exec -T db sh -c 'createdb --username="$POSTGRES_USER" "$1"' -- $validationDatabase
docker compose --env-file $dockerEnvFile -f $composeFile cp $databaseBackup "db:$containerDump"
docker compose --env-file $dockerEnvFile -f $composeFile exec -T db sh -c 'pg_restore --exit-on-error --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$1" "$2"' -- $validationDatabase $containerDump
docker compose --env-file $dockerEnvFile -f $composeFile exec -T db sh -c 'psql --username="$POSTGRES_USER" --dbname="$1" --tuples-only --no-align --command="SELECT COUNT(*) FROM django_migrations;"' -- $validationDatabase
```

After `pg_restore` succeeds, validate expected table counts and relationships,
then point an isolated application instance at the validation database and run
Django checks and representative authenticated flows. Do not point the normal
backend container at it without a reviewed environment override.

Dropping the validation database is destructive even though it is temporary.
The cleanup command is intentionally omitted: retain it until the restore has
been reviewed, then have an operator use `dropdb` only after typing and checking
the exact validation database name. Never run `dropdb` against `POSTGRES_DB`.

Removing `$containerDump` from `/tmp` after validation is safe temporary-file
cleanup; it does not remove the host backup or a Docker volume.

## Media backup

Create a compressed archive inside the backend container and copy it outside
the repository:

```powershell
$mediaBackup = Join-Path $backupRoot "dastorkon-media-$timestamp.tar.gz"

docker compose --env-file $dockerEnvFile -f $composeFile exec -T backend sh -c 'tar -C /app/media -czf /tmp/dastorkon-media.tar.gz .'
docker compose --env-file $dockerEnvFile -f $composeFile cp backend:/tmp/dastorkon-media.tar.gz $mediaBackup
docker compose --env-file $dockerEnvFile -f $composeFile exec -T backend rm -f /tmp/dastorkon-media.tar.gz

Get-Item -LiteralPath $mediaBackup
Get-FileHash -Algorithm SHA256 -LiteralPath $mediaBackup
tar -tzf $mediaBackup | Select-Object -First 20
```

The archive should be treated as sensitive. File listings can also disclose
business or user information, so do not publish validation output.

## Media restore verification

Extract only into a new, explicit host directory. The guard stops if the target
already exists, preventing an accidental merge with an earlier restore:

```powershell
$mediaValidationRoot = Join-Path $backupRoot "media-restore-$timestamp"

if (Test-Path -LiteralPath $mediaValidationRoot) {
    throw "Restore validation path already exists: $mediaValidationRoot"
}

New-Item -ItemType Directory -Path $mediaValidationRoot | Out-Null
tar -xzf $mediaBackup -C $mediaValidationRoot

Get-ChildItem -LiteralPath $mediaValidationRoot -Recurse -File |
    Measure-Object
Get-ChildItem -LiteralPath $mediaValidationRoot -Recurse -File |
    Select-Object -First 20 FullName, Length
```

Open a representative sample with appropriate local tools, compare counts and
checksums where an inventory exists, and verify database references against the
restored media tree. Do not copy these files into the active `media` volume as
part of the validation exercise.

A real media recovery should restore to a new persistent location, validate it,
pause writes, and switch the application/proxy through a reviewed rollbackable
procedure. Direct in-place extraction can silently mix old and restored files
and is intentionally not documented as a copy-paste command.

## Backup storage and security

- Keep at least one backup copy outside the application server and outside the
  Docker host failure boundary.
- Encrypt backups in transit and at rest with managed, rotated keys.
- Give backup operators and restore operators only the access they need; log
  and review access without logging archive contents or credentials.
- Store checksums and backup metadata separately enough to detect corruption.
- Protect secret-manager recovery information separately from data backups.
- Apply retention and secure deletion rules to expired copies and restore-test
  directories.
- Never use production backups on developer laptops or shared test systems
  without authorization, minimization, and appropriate data protection.

No cloud provider is required by this plan. Local encrypted storage, an
off-host server, removable media under controlled custody, or a managed backup
service can satisfy it if the selected design meets the agreed RPO, RTO,
security, and recovery requirements.

## Restore-test checklist

- [ ] Record backup timestamp, application release, schema migration, sizes,
  and SHA-256 checksums.
- [ ] Restore PostgreSQL into a separate newly created database.
- [ ] Restore media into a separate empty directory, volume, or server.
- [ ] Confirm migrations, expected record counts, relationships, and a sample
  of media references.
- [ ] Start an isolated application instance and test login, menu, order,
  admin, API, and WebSocket workflows as appropriate.
- [ ] Confirm restored secrets come from approved secret recovery, not the data
  archive.
- [ ] Measure recovery time and recovered-data age against RTO and RPO.
- [ ] Record failures, update the runbook, and repeat until the exercise passes.
- [ ] Preserve audit evidence without retaining exposed credentials or
  unnecessary personal data.

A backup is not considered valid until an isolated restore has succeeded and
the restored application/data have been verified. Never make production the
first restore test.
