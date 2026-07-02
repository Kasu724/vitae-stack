#!/usr/bin/env sh
set -eu

umask 077

SOURCE=${1:-}
IDENTITY_FILE=${VITAE_BACKUP_IDENTITY_FILE:-}
TEMP=${TMPDIR:-/tmp}/vitae-restore-$$

if [ -z "$SOURCE" ]; then
  echo "Usage: scripts/operations/restore.sh <backup-directory>" >&2
  exit 1
fi
if [ -z "$IDENTITY_FILE" ] || [ ! -r "$IDENTITY_FILE" ]; then
  echo "VITAE_BACKUP_IDENTITY_FILE must name a readable, access-restricted age identity file." >&2
  exit 1
fi
for file in database.dump.age artifacts.tar.gz.age SHA256SUMS MANIFEST.txt; do
  [ -f "$SOURCE/$file" ] || {
    echo "Backup member is missing: $file" >&2
    exit 1
  }
done
grep -qx 'format=vitae-stack-backup-v1' "$SOURCE/MANIFEST.txt" || {
  echo "Unsupported backup manifest." >&2
  exit 1
}
for command in age docker sha256sum tar; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

(cd "$SOURCE" && sha256sum -c SHA256SUMS)
mkdir -p "$TEMP"
cleanup() {
  rm -rf "$TEMP"
}
trap cleanup EXIT HUP INT TERM

age --decrypt --identity "$IDENTITY_FILE" \
  --output "$TEMP/database.dump" "$SOURCE/database.dump.age"
age --decrypt --identity "$IDENTITY_FILE" \
  --output "$TEMP/artifacts.tar.gz" "$SOURCE/artifacts.tar.gz.age"

docker compose up -d --wait postgres
database_empty=$(docker compose exec -T postgres psql -U postgres -d vitae -Atc \
  "SELECT CASE WHEN to_regclass('public.users') IS NULL THEN 'yes' ELSE 'no' END")
if [ "$database_empty" != "yes" ]; then
  echo "Restore refused: target database is not empty. Use fresh volumes." >&2
  exit 1
fi
if ! docker compose run --rm --no-deps --entrypoint sh app -c \
  'test -z "$(find /var/lib/vitae/artifacts -mindepth 1 -maxdepth 1 -print -quit)"' \
  >/dev/null; then
  echo "Restore refused: target artifact volume is not empty. Use fresh volumes." >&2
  exit 1
fi

if ! tar -tzf "$TEMP/artifacts.tar.gz" >"$TEMP/artifact-paths"; then
  echo "Restore refused: artifact archive could not be inspected." >&2
  exit 1
fi
if grep -Eq '(^/|(^|/)\.\.(/|$))' "$TEMP/artifact-paths"; then
  echo "Restore refused: artifact archive contains an unsafe path." >&2
  exit 1
fi

cat "$TEMP/database.dump" | docker compose exec -T postgres \
  pg_restore --username postgres --dbname vitae --no-owner --exit-on-error
cat "$TEMP/artifacts.tar.gz" | docker compose run --rm --no-deps \
  --entrypoint tar app -C /var/lib/vitae/artifacts --no-same-owner -xzf -

echo "Starting deletion replay before user access..."
docker compose up -d deletion-worker
attempt=0
while [ "$attempt" -lt 60 ]; do
  active=$(docker compose exec -T postgres psql -U postgres -d vitae -Atc \
    "SELECT count(*) FROM workspace_deletion_operations WHERE state IN ('pending','running')")
  [ "$active" = "0" ] && break
  attempt=$((attempt + 1))
  sleep 2
done
if [ "$active" != "0" ]; then
  echo "Restore stopped: deletion replay did not settle within 120 seconds." >&2
  echo "Keep the app stopped and inspect deletion-worker logs." >&2
  exit 1
fi

docker compose up -d app parser job-fetcher
echo "Restore completed. Verify /api/ready and the deletion receipt/tombstone audit before admitting traffic."
