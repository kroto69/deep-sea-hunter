#!/usr/bin/env bash
# Start everything for local play: DB, migrations, API (:3000), game (:8080). Ctrl+C stops API + web.
set -euo pipefail
cd "$(dirname "$0")"

[ -d node_modules ] || npm ci
grep -q '^DATABASE_URL=' .env || { echo "Tambahkan POSTGRES_PASSWORD dan DATABASE_URL ke .env dulu"; exit 1; }

docker compose up -d --wait postgres
npm run -s migrate
npm run -s seed

trap 'kill 0' EXIT
npm start &
ss -ltn | grep -q ':8080 ' || python3 -m http.server 8080 --bind localhost &
echo "Game: http://localhost:8080   API: http://127.0.0.1:3000/ready"
wait
