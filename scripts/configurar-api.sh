#!/usr/bin/env bash
# Write the platform API's .env on the droplet, asking for the secrets on this Mac without showing them.
#   SERVER=<droplet ip> GOOGLE_CLIENT_ID=<id> scripts/configurar-api.sh [ruta/a/la-clave.json]
#
# - The Google service account key: the newest service-account JSON in ~/Downloads unless a path is given.
#   It goes to the server base64-encoded inside .env; delete the file from Downloads afterwards.
# - The Resend API key: typed hidden.
# - VAPID keys (Web Push) and the WhatsApp verify token are generated here.
# Secrets travel over SSH stdin, never on a command line, and the server file is chmod 600.
# Running it again rewrites .env (keeping the VAPID pair already on the server, so installed apps stay subscribed).
set -euo pipefail
: "${SERVER:?set SERVER=<droplet ip>}"
: "${GOOGLE_CLIENT_ID:?set GOOGLE_CLIENT_ID=<…apps.googleusercontent.com>}"
DESTINO="/srv/apps/casalotus-api/server"
SSH="ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=8"
cd "$(dirname "$0")/.."

clave="${1:-}"
if [[ -z "$clave" ]]; then
  clave="$(grep -l '"type": *"service_account"' ~/Downloads/*.json 2>/dev/null | xargs ls -t 2>/dev/null | head -1 || true)"
fi
[[ -f "$clave" ]] || { echo "No encuentro la clave JSON de la cuenta de servicio (pásala como argumento)."; exit 1; }
cuenta="$(node -e 'const k=require(process.argv[1]); if(k.type!=="service_account") process.exit(1); console.log(k.client_email)' "$clave")" \
  || { echo "Ese JSON no es una clave de cuenta de servicio."; exit 1; }
echo "Clave: $(basename "$clave") · cuenta de servicio: $cuenta"
echo "   (esa cuenta debe estar compartida como Editor en la hoja «Casa Lotus · Sistema»)"

read -rs -p "Clave de Resend (empieza por re_, no se ve al pegarla): " RESEND; echo
[[ "$RESEND" == re_* ]] || { echo "La clave de Resend empieza por re_. Vuelve a intentarlo."; exit 1; }
estado_resend="$(curl -s -m 15 -H "Authorization: Bearer $RESEND" https://api.resend.com/domains \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const d=(j.data||[]).find(x=>x.name==="casalotus.studio");console.log(d?d.status:(j.message||"sin dominio"))}catch{console.log("sin respuesta")}})')"
echo "Resend · casalotus.studio: $estado_resend"

vapid="$($SSH "deploy@$SERVER" "grep -E '^VAPID_(PUBLIC|PRIVATE)_KEY=.+' $DESTINO/.env 2>/dev/null || true")"
if [[ -z "$vapid" ]]; then
  vapid="$(cd server && node -e 'const w=require("web-push");const k=w.generateVAPIDKeys();console.log("VAPID_PUBLIC_KEY="+k.publicKey+"\nVAPID_PRIVATE_KEY="+k.privateKey)')"
fi
verify="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
cuenta_b64="$(base64 < "$clave" | tr -d '\n')"

{
  cat <<EOF
# Casa Lotus · API (written by scripts/configurar-api.sh on $(date +%F)). Secrets: never commit, never paste.
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://casalotus.studio
LOG_LEVEL=info
DATOS=sheets
SQLITE_PATH=/app/data/casalotus.db
# 0 until the Sheet's own hourly trigger is switched off (Casa Lotus → Desactivar tareas automáticas)
TAREAS=0
SHEET_ID=1mf4n7Yj9buyafjedw8zHMfoGG0yraaLcZ_DWGMc3xdo
GOOGLE_SERVICE_ACCOUNT_JSON=$cuenta_b64
CONVERSIONES_SHEET_ID=
CORREO_DRIVER=resend
RESEND_API_KEY=$RESEND
CORREO_REMITENTE=Casa Lotus <reservas@casalotus.studio>
CORREO_RESPONDER_A=casalotusbogota@gmail.com
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
$vapid
VAPID_SUBJECT=mailto:casalotusbogota@gmail.com
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=$verify
WHATSAPP_GRAPH_VERSION=v26.0
WHATSAPP_MODO=
TRUST_PROXY=
EOF
} | $SSH "deploy@$SERVER" "umask 077 && mkdir -p $DESTINO/data && cat > $DESTINO/.env && sudo chown 1000:1000 $DESTINO/data && echo '✓ .env escrito en el servidor ('\$(wc -l < $DESTINO/.env)' líneas, permisos 600)'"
unset RESEND cuenta_b64
echo "Listo. Ya puedes borrar la clave de Descargas: rm \"$clave\""
