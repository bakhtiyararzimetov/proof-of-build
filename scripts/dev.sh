#!/usr/bin/env bash
# Starts the whole app with one command.
#
#   ./scripts/dev.sh           local only: http://localhost:5173 (sign-in works, commits do NOT earn fires)
#   ./scripts/dev.sh --public  + temporary public HTTPS address (phone testing). Needs cloudflared.
#   ./scripts/dev.sh --public --webhook   also points the GitHub App webhook at this laptop
#                              (fires then come here, NOT to the hosted server — switch back afterwards:
#                               node backend/scripts/set-webhook-url.mjs https://proof-of-build.onrender.com/webhooks/github)
#
# Ctrl+C stops everything. Logs: .dev-logs/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/.dev-logs"
mkdir -p "$LOGS"
PUBLIC=false
WEBHOOK=false
for a in "$@"; do
  [[ "$a" == "--public" ]] && PUBLIC=true
  [[ "$a" == "--webhook" ]] && WEBHOOK=true
done

pids=()
cleanup() {
  echo
  echo "Stopping…"
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for port in 3000 5173; do
  if (echo >"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "Port $port is already in use. Stop the other server first (close its terminal or: fuser -k $port/tcp)."
    exit 1
  fi
done

set_env() { # file key value
  if grep -q "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >>"$1"; fi
}
wait_http() { # url name
  for _ in $(seq 60); do curl -s -o /dev/null "$1" && return 0; sleep 1; done
  echo "$2 did not start, see $LOGS"; exit 1
}

# Frontend always talks to the backend through its own /api proxy (frontend/vite.config.ts).
set_env "$ROOT/frontend/.env" VITE_API_URL /api

if $PUBLIC; then
  CF="$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")"
  [[ -x "$CF" ]] || { echo "cloudflared not found. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"; exit 1; }
  echo "Opening a public tunnel…"
  "$CF" tunnel --url http://localhost:5173 --no-autoupdate >"$LOGS/tunnel.log" 2>&1 &
  pids+=($!)
  URL=""
  for _ in $(seq 60); do
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel.log" | head -1 || true)"
    [[ -n "$URL" ]] && break
    sleep 1
  done
  [[ -n "$URL" ]] || { echo "Tunnel did not start, see $LOGS/tunnel.log"; exit 1; }
  set_env "$ROOT/backend/.env" PUBLIC_URL "$URL/api"
  set_env "$ROOT/backend/.env" FRONTEND_URL "$URL"
  if $WEBHOOK; then
    (cd "$ROOT/backend" && node scripts/set-webhook-url.mjs "$URL/api/webhooks/github") || echo "! Could not update the webhook, set it in the GitHub App by hand."
  fi
else
  URL="http://localhost:5173"
  set_env "$ROOT/backend/.env" PUBLIC_URL "http://localhost:3000"
  set_env "$ROOT/backend/.env" FRONTEND_URL "$URL"
fi

echo "Starting backend…"
(cd "$ROOT/backend" && npm run dev) >"$LOGS/backend.log" 2>&1 &
pids+=($!)
echo "Starting frontend…"
(cd "$ROOT/frontend" && npm run dev -- --port 5173 --strictPort) >"$LOGS/frontend.log" 2>&1 &
pids+=($!)
wait_http http://localhost:3000/health "Backend"
wait_http http://localhost:5173 "Frontend"
$PUBLIC && wait_http "$URL/api/health" "Tunnel"

echo
echo "  ✓ Proof of Build is running"
echo "    Site:    $URL"
echo "    Backend: http://localhost:3000/health"
if $PUBLIC; then
  echo
  echo "  GitHub sign-in: add this Redirect URI once per new address at"
  echo "  https://github.com/settings/apps  →  your app  →  Redirect URI:"
  echo "    $URL/api/auth/github/callback"
fi
echo
echo "  Logs: $LOGS   ·   Ctrl+C to stop"
wait
