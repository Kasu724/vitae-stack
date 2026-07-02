#!/usr/bin/env sh
set -eu

umask 077

BACKUP_ROOT=${BACKUP_ROOT:-./var/backups}
RECIPIENTS_FILE=${VITAE_BACKUP_RECIPIENTS_FILE:-}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DESTINATION="$BACKUP_ROOT/$STAMP"
TEMP="$DESTINATION/.working"

if [ -z "$RECIPIENTS_FILE" ] || [ ! -r "$RECIPIENTS_FILE" ]; then
  echo "VITAE_BACKUP_RECIPIENTS_FILE must name a readable age recipients file." >&2
  exit 1
fi
for command in age docker sha256sum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

mkdir -p "$TEMP"
cleanup() {
  rm -rf "$TEMP"
}
restart_services() {
  docker compose up -d app parser job-fetcher deletion-worker >/dev/null 2>&1 || true
}
trap 'cleanup; restart_services' EXIT HUP INT TERM

echo "Stopping write-capable services for a coordinated backup..."
docker compose stop app parser job-fetcher deletion-worker

docker compose exec -T postgres \
  pg_dump --username postgres --dbname vitae --format custom --no-owner \
  >"$TEMP/database.dump"
docker compose run --rm --no-deps --user 0 --cap-add DAC_READ_SEARCH \
  --entrypoint tar app \
  -C /var/lib/vitae/artifacts -czf - . >"$TEMP/artifacts.tar.gz"

age --encrypt --recipients-file "$RECIPIENTS_FILE" \
  --output "$DESTINATION/database.dump.age" "$TEMP/database.dump"
age --encrypt --recipients-file "$RECIPIENTS_FILE" \
  --output "$DESTINATION/artifacts.tar.gz.age" "$TEMP/artifacts.tar.gz"

(
  cd "$DESTINATION"
  sha256sum database.dump.age artifacts.tar.gz.age >SHA256SUMS
)
cat >"$DESTINATION/MANIFEST.txt" <<EOF
format=vitae-stack-backup-v1
created_at=$STAMP
database=postgresql-custom-format
artifacts=tar-gzip-complete-private-volume
encryption=age-v1-recipient
deletion_tombstones=included-in-artifacts
maximum_retention_days=30
EOF

restart_services
trap cleanup EXIT HUP INT TERM
echo "Encrypted backup created at $DESTINATION"
echo "Restore-test it and remove the pair no later than 30 days after creation."
