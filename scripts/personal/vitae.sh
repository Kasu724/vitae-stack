#!/usr/bin/env sh
set -eu
umask 077

ACTION=${1:-start}
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
DATA_DIR=${VITAE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/vitae-stack}
RUNTIME_DIR="$DATA_DIR/runtime"
SETTINGS_FILE="$DATA_DIR/settings.env"
PID_FILE="$RUNTIME_DIR/server.pid"
LOG_FILE="$RUNTIME_DIR/server.log"
ERROR_LOG="$RUNTIME_DIR/server-error.log"
DATABASE_PATH="$DATA_DIR/vitae.sqlite"
BASE_URL=http://127.0.0.1:3000

initialize_data() {
  mkdir -p "$DATA_DIR/files" "$RUNTIME_DIR"
  if [ ! -f "$SETTINGS_FILE" ]; then
    KEY=$(dd if=/dev/urandom bs=32 count=1 2>/dev/null | base64 | tr -d '\n')
    printf 'CREDENTIAL_ENCRYPTION_KEY=%s\n' "$KEY" >"$SETTINGS_FILE.tmp"
    chmod 600 "$SETTINGS_FILE.tmp"
    mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  fi
  chmod 700 "$DATA_DIR" "$RUNTIME_DIR"
}

running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

configure_environment() {
  CREDENTIAL_ENCRYPTION_KEY=$(sed -n 's/^CREDENTIAL_ENCRYPTION_KEY=//p' "$SETTINGS_FILE" | head -n 1)
  [ -n "$CREDENTIAL_ENCRYPTION_KEY" ] || { echo "Local credential key is missing." >&2; exit 1; }
  export NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3000
  export APP_BASE_URL="$BASE_URL" APP_BIND_HOST=127.0.0.1 DATABASE_PATH
  export ARTIFACT_STORAGE_ROOT="$DATA_DIR/files"
  export PARSER_QUEUE_ROOT="$RUNTIME_DIR/parser-queue" JOB_FETCH_QUEUE_ROOT="$RUNTIME_DIR/fetch-queue"
  export PARSER_MODE=inline JOB_FETCH_MODE=inline TELEMETRY_ENABLED=false
  export CREDENTIAL_ENCRYPTION_KEY CREDENTIAL_KEY_VERSION=1
  if [ -f "$ROOT/app/parser-child.mjs" ]; then export PARSER_CHILD_PATH="$ROOT/app/parser-child.mjs"; fi
}

case "$ACTION" in
  start)
    command -v node >/dev/null 2>&1 || { echo "Node.js 24.15 or newer is required." >&2; exit 1; }
    initialize_data
    configure_environment
    if running; then echo "Vitae Stack is already running at $BASE_URL"; exit 0; fi
    rm -f "$PID_FILE"
    if [ -f "$ROOT/app/server.js" ]; then
      node "$ROOT/app/local-migrate.mjs"
      (cd "$ROOT/app" && nohup node server.js >"$LOG_FILE" 2>"$ERROR_LOG" & echo $! >"$PID_FILE")
    else
      node "$ROOT/node_modules/tsx/dist/cli.mjs" "$ROOT/scripts/local-migrate.ts"
      (cd "$ROOT" && nohup node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000 >"$LOG_FILE" 2>"$ERROR_LOG" & echo $! >"$PID_FILE")
    fi
    ATTEMPT=0
    until curl --fail --silent "$BASE_URL/api/ready" >/dev/null 2>&1; do
      running || { echo "Startup failed; review $ERROR_LOG" >&2; [ -f "$ERROR_LOG" ] && tail -n 50 "$ERROR_LOG" >&2; exit 1; }
      ATTEMPT=$((ATTEMPT + 1)); [ "$ATTEMPT" -lt 90 ] || { echo "Startup failed; review $ERROR_LOG" >&2; exit 1; }
      sleep 1
    done
    echo "Vitae Stack is ready at $BASE_URL"
    echo "Your data is stored in $DATA_DIR"
    ;;
  stop)
    if running; then kill "$(cat "$PID_FILE")"; fi
    rm -f "$PID_FILE"
    echo "Vitae Stack stopped. Your local data was preserved in $DATA_DIR"
    ;;
  status)
    if running; then echo "Vitae Stack is running at $BASE_URL"; else echo "Vitae Stack is stopped."; fi
    echo "Local data: $DATA_DIR"
    ;;
  logs)
    [ -f "$LOG_FILE" ] && tail -n 200 "$LOG_FILE"
    [ -f "$ERROR_LOG" ] && tail -n 200 "$ERROR_LOG" >&2
    ;;
  *) echo "Usage: $0 [start|stop|status|logs]" >&2; exit 2 ;;
esac
