#!/usr/bin/env bash
# Frees the target port (killing whatever's listening on it) and starts the app.
#
# Usage:
#   ./scripts/start.sh                    # kill anything on :3000, npm run dev
#   PORT=3001 MODE=start ./scripts/start.sh   # kill :3001, build, npm run start
#   STORAGE=local ./scripts/start.sh      # force the local JSON driver for this run
#
# Works in Git Bash on Windows (uses netstat/taskkill) and in real POSIX
# shells with lsof (Linux/macOS).

set -euo pipefail

PORT="${PORT:-3000}"
MODE="${MODE:-dev}"
STORAGE="${STORAGE:-}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

free_port() {
  local port="$1"
  echo "Checking for a process on port $port..."

  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    if [ -z "$pids" ]; then
      echo "Port $port is free."
      return
    fi
    for pid in $pids; do
      echo "Killing pid $pid on port $port"
      kill -9 "$pid" 2>/dev/null || true
    done
  elif command -v netstat >/dev/null 2>&1; then
    # Windows netstat output: proto local:port remote:port state PID
    local pids
    pids="$(netstat -ano -p tcp 2>/dev/null | grep -E ":$port[[:space:]]" | grep LISTENING | awk '{print $NF}' | sort -u || true)"
    if [ -z "$pids" ]; then
      echo "Port $port is free."
      return
    fi
    for pid in $pids; do
      echo "Killing pid $pid on port $port"
      taskkill //PID "$pid" //F >/dev/null 2>&1 || true
    done
  else
    echo "Warning: neither lsof nor netstat found — skipping port check." >&2
    return
  fi

  sleep 0.7
}

free_port "$PORT"

if [ -n "$STORAGE" ]; then
  export STORAGE_DRIVER="$STORAGE"
  echo "STORAGE_DRIVER=$STORAGE (this run only)"
fi

if [ "$MODE" = "start" ]; then
  echo "Building..."
  npm run build
  echo "Starting production server on port $PORT..."
  npm run start -- -p "$PORT"
else
  echo "Starting dev server on port $PORT..."
  npm run dev -- -p "$PORT"
fi
