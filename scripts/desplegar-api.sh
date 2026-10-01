#!/usr/bin/env bash
# Ship the platform API (web/server + web/shared) to the droplet and restart its container.
#   SERVER=<droplet ip> scripts/desplegar-api.sh
#
# Runs from the Mac with Álvaro's deploy key (CI keys are pinned to rrsync and get no shell).
# Layout on the server: /srv/apps/casalotus-api/{shared,server}; compose runs from server/.
# Secrets live only on the server: server/.env and the Google service account inside it.
# rsync never sends or deletes them (.env, data/ and node_modules are excluded).
set -euo pipefail
: "${SERVER:?set SERVER=<droplet ip>}"
SSH="ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=8"
DESTINO="/srv/apps/casalotus-api"
cd "$(dirname "$0")/.."

echo "→ tests"
( cd server && npm test --silent )
node --test shared/tests/*.test.mjs >/dev/null

echo "→ subir código a $SERVER:$DESTINO"
# the container runs as the non-root `node` user (uid 1000) and writes SQLite into data/
$SSH "deploy@$SERVER" "mkdir -p $DESTINO/server/data && sudo chown 1000:1000 $DESTINO/server/data"
rsync -rlptz --delete -e "$SSH" --exclude .DS_Store --exclude 'tests/' ./shared/ "deploy@$SERVER:$DESTINO/shared/"
rsync -rlptz --delete -e "$SSH" \
  --exclude .DS_Store --exclude node_modules --exclude 'data/' --exclude '.env' --exclude '.env.*' --exclude 'tests/' \
  ./server/ "deploy@$SERVER:$DESTINO/server/"

echo "→ construir y reiniciar el contenedor"
$SSH "deploy@$SERVER" "cd $DESTINO/server && test -f .env || { echo 'Falta $DESTINO/server/.env (copia .env.example y llénalo)'; exit 1; }; docker compose up -d --build --remove-orphans"

echo "→ comprobar"
for i in $(seq 1 20); do
  if curl -fsS "https://casalotus.studio/api/salud" >/dev/null 2>&1; then
    curl -fsS "https://casalotus.studio/api/salud"; echo
    echo "✓ API en línea"
    exit 0
  fi
  sleep 3
done
echo "✗ La API no respondió en 60 s. Logs: ssh deploy@$SERVER 'cd $DESTINO/server && docker compose logs --tail 80'"
exit 1
