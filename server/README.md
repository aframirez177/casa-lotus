# Casa Lotus · platform API

Express 5 (ESM, Node 24) behind `casalotus.studio/api/`. It implements `../shared/CONTRATO.md` §2–§7.

- **The Google Sheet «Casa Lotus · Sistema» stays the business record**: classes, bookings, clientas,
  payments, waiting list, schedule, plans, settings. The server reads every tab by header name and writes
  **only typed columns** (never the calculated ones), so Ana can keep using and extending the Sheet.
- **SQLite holds the system internals** the Sheet must never carry: staff accounts, sessions, login codes
  and tokens, the audit log, novedades, attribution beacons, Web Push subscriptions, rate limits.
- **Business rules come from `../shared/reglas.js`** (balances are computed, never typed).

## Run it

```bash
source ~/.nvm/nvm.sh && nvm use 24
npm install
npm run dev      # http://localhost:8787/api · fake studio in memory · e-mails printed in the console
npm test         # node --test, memory driver + :memory: SQLite, no Google needed
```

`npm run dev` prints the dev staff accounts (an admin and the profes Ximena, Laura, Geral). They exist only with
the memory driver in development, and their passwords live in `src/datos/semilla.js` (`CUENTAS_DEV`). The Sheet
is a fresh fake studio on every start; accounts and sessions persist in `./data/dev.db` (gitignored), so a
`--watch` restart logs nobody out. Shutdown (SIGTERM/SIGINT) ends open SSE streams with `event: adios`, closes
idle connections and forces the rest after 3 s. The fake studio (invented people, `example.com`
e-mails, `300 555 xxxx` phones) lights up every segment and alert: a pending web booking about to expire,
a class to mark, a full class with a waiting list, a freed swing, a birthday, an incomplete ficha, a lead…
Clientas sign in with a code that arrives as an «e-mail» in the console.

The app (Vite, :5180) and the site (Astro, :4321) proxy `/api` here; CORS for those two origins is on in
development only.

| Script | What |
|---|---|
| `npm run dev` | memory driver, port 8787, `NODE_ENV=development`, watch mode |
| `npm start` | production entry (`src/index.js`) |
| `npm test` | every `tests/**/*.test.mjs` |
| `npm run vapid` | prints a VAPID key pair for Web Push |
| `npm run crear-admin -- --correo ana@… --nombre "Ana Caona"` | creates an admin and prints a one-time setup link |

## Contract

Everything this API implements, including the additions made during the build, is in `../shared/CONTRATO.md` (§10 lists the additions).

## Layout

```
src/
  index.js            entry: config → context → app → jobs
  app.js              Express app factory (security headers, CSRF, routes, error shape)
  config.js           env → validated config (zod)
  contexto.js         ctx: clock, data driver, SQLite, write lock, novedades, e-mail, push, WhatsApp
  candado.js          the single in-process write lock (FIFO)
  datos/              Sheet drivers (sheets | memoria), schema, cell conversion, model, dev seed
  dominio/            ALL business logic: (ctx, actor, input) → result
  auth/               passwords (scrypt), sessions, codes, links, invitations, rate limits, guards
  rutas/              thin HTTP routes: validate (zod) → domain → response
  herramientas/       the domain as a typed tool catalog for an AI agent (CONTRATO §7)
  notificaciones/     e-mail (console | smtp), Web Push, templates
  tareas/             maintenance jobs (holds every 10 min, calendar daily 03:00 Bogotá)
  whatsapp/           WhatsApp Cloud API module (separate owner), loaded by whatsapp-cargar.js
migraciones/          ordered SQL migrations, applied at start
scripts/              dev, crear-admin, vapid
tests/                node --test suites
```

## Environment

See `.env.example`. The important ones:

| Variable | Use |
|---|---|
| `DATOS` | `sheets` in production; `memoria` (fake studio) is refused in production |
| `SHEET_ID` | the Sheet «Casa Lotus · Sistema» |
| `CONVERSIONES_SHEET_ID` | separate spreadsheet for Google Ads offline conversions (first tab); empty → the «Conversiones Ads» tab |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | service account key, base64 (or `GOOGLE_APPLICATION_CREDENTIALS` path) |
| `SQLITE_PATH` | `/app/data/casalotus.db` in Docker (the `./data` volume) |
| `CORREO_DRIVER`, `RESEND_API_KEY`, `CORREO_REMITENTE`, `CORREO_RESPONDER_A` | e-mail through Resend from «Casa Lotus <reservas@casalotus.studio>», replies to the studio's Gmail (`smtp` and `console` drivers remain) |
| `GOOGLE_CLIENT_ID` | «Entrar con Google» for staff; empty = only e-mail + password |
| `VAPID_*` | Web Push; without them push is simply off |
| `WHATSAPP_*` | Meta Cloud API; without them `/api/admin/whatsapp` answers 503 `no-configurado` |
| `PUBLIC_URL` | origin for links (invitations, resets, access links) and the CSRF Origin check |

Settings that change business behaviour live in the Sheet's **Ajustes** tab, not in env (CONTRATO §2).
«Pago por clase a profes» is set there by Ana; it is never in code.

## The Google service account (once)

The service account and the OAuth client live in **Álvaro's** Google Cloud project; the Sheet stays in the
studio's Drive and is only shared with the service account.

1. Google Cloud console with Álvaro's account → create a project «casa-lotus-api» → APIs & Services → enable
   **Google Sheets API**.
2. IAM → Service accounts → create «casalotus-api» (no roles needed) → Keys → Add key → JSON.
3. Open the Sheet «Casa Lotus · Sistema» → **Share** → paste the service account e-mail
   (`casalotus-api@<project>.iam.gserviceaccount.com`) → **Editor** → uncheck «Notify».
4. On the droplet: `base64 -i key.json | tr -d '\n'` → `GOOGLE_SERVICE_ACCOUNT_JSON=` in `.env`, then delete
   the key file from your laptop.
5. The Sheet's time zone must be **America/Bogota** (File → Settings). `GET /api/admin/salud` warns otherwise
   and lists any column the server wants but the Sheet lacks (run the installer «Instalar o reparar» to add them).

## E-mail through Resend (once)

1. resend.com → Domains → add `casalotus.studio` → copy the DNS records (SPF `send` MX/TXT, DKIM `resend._domainkey`)
   into Cloudflare DNS (DNS only, grey cloud) → Verify.
2. API Keys → create one with **Sending access** for that domain → `RESEND_API_KEY` in `.env`.
3. `CORREO_REMITENTE=Casa Lotus <reservas@casalotus.studio>`, `CORREO_RESPONDER_A=casalotusbogota@gmail.com`
   (replies land in the studio's Gmail). `GET /api/admin/salud` → `correo.ok` must be `true`.

The free plan sends 3,000 e-mails a month and 100 a day (https://resend.com/pricing): one alert per web
booking plus login codes and resets fits easily. A failed send is logged and never fails the booking; the
driver retries once on 429/5xx and never logs the key or full addresses. E-mails carry no inline images: the
logo is the site's hosted `https://casalotus.studio/apple-touch-icon.png`.

## «Entrar con Google» for staff (once)

1. Same Google Cloud project → APIs & Services → OAuth consent screen: External, app name «Casa Lotus», scopes
   `openid email profile` only (no verification needed).
2. Credentials → Create OAuth client ID → **Web application** → Authorized JavaScript origins
   `https://casalotus.studio` (and `http://localhost:5180` for development) → copy the client id into
   `GOOGLE_CLIENT_ID`.
3. The app loads Google Identity Services with the id from `GET /api/auth/config` and posts the ID token to
   `POST /api/auth/google`. The server verifies it (signature, audience, issuer, `email_verified`) and signs in the
   **active** staff member with that e-mail; Google never creates accounts. An invitation can also be accepted with
   Google (`POST /api/auth/invitacion/:token/google`) when the Google e-mail is the invited one; e-mail + password
   stays available as the fallback.

## Google Ads conversions (Data Manager)

Data Manager imports only the **first tab** of a spreadsheet, with headers in row 1, so conversions go to a
separate spreadsheet:

1. With the studio account, create a spreadsheet «Casa Lotus · Conversiones Ads». Leave its first tab empty: the
   API writes the headers `Google Click ID | GBRAID | WBRAID | Order ID | Conversion Name | Conversion Time |
   Conversion Value | Conversion Currency`.
2. **Share** it with the service account e-mail as **Editor** (same as the operating Sheet).
3. Put its id in `CONVERSIONES_SHEET_ID`; `GET /api/admin/salud` → `conversiones.ok` must be `true`.
4. Google Ads → Tools → Data Manager → connect Google Sheets → that spreadsheet, conversion actions
   «Clase de prueba pagada» and «Plan comprado» (count «Every»; Order ID dedupes re-uploads).

Rules: one row per **purchase** (Order ID = `P-xxxx`) of a clienta whose first ad click (a web booking with
gclid / gbraid / wbraid) is at most 90 days old; gclid wins, gbraid only without gclid, wbraid only without both;
`Conversion Time` is ISO with the offset (`2026-10-03T08:00:00-05:00`); value = what was paid, in COP. Confirming
a booking with a plan she already had creates no purchase and no row. Rows older than 90 days are deleted by the
daily job. Without `CONVERSIONES_SHEET_ID` the same rows go to the «Conversiones Ads» tab of the operating Sheet
(never pruned there).

Quotas (consumer account, Sheets API): 300 reads/min per project. The server keeps a ~20 s snapshot and
reads every tab in one batch, so normal traffic uses a handful of calls per minute.

## Deploy (droplet, see `~/dev/infra`)

Layout on the server: `/srv/apps/casalotus-api/{shared,server}` (the image needs `shared/`), compose runs
from `server/`, `.env` and `data/` live only there.

```bash
# from the Mac, web/ as the working directory
rsync -a --delete shared/ deploy@SERVER:/srv/apps/casalotus-api/shared/
rsync -a --delete --exclude node_modules --exclude data --exclude .env server/ deploy@SERVER:/srv/apps/casalotus-api/server/

# on the droplet, first time
cd /srv/apps/casalotus-api/server
cp .env.example .env && nano .env          # secrets
mkdir -p data && sudo chown 1000:1000 data  # the container runs as the non-root `node` user (uid 1000)

# every deploy
docker compose up -d --build
docker compose logs -f --tail=50
```

Caddy (`infra/proxy/conf/sites/casalotus.studio.caddy`) sends `/api/*` to the container and keeps
serving the static site for everything else:

```caddy
casalotus.studio {
	handle /api/* {
		reverse_proxy casalotus-api:3000 {
			flush_interval -1   # Server-Sent Events (/api/admin/stream) go through at once
		}
	}
	handle {
		import static casalotus.studio
	}
}
```

The container: `node:24-slim`, non-root, read-only root filesystem, `TZ=America/Bogota`, healthcheck on
`GET /api/salud`, `mem_limit: 256m`, network alias `casalotus-api`, port 3000 exposed only to the `web` network.
Back up `server/data/` (SQLite) with the droplet backups; the business record is the Sheet.

## Bootstrap the admins

```bash
docker compose exec api node scripts/crear-admin.mjs --correo casalotusbogota@gmail.com --nombre "Ana Caona"
```

It prints a one-time link (7 days) to `/app/invitacion/<token>`, where she either signs in with Google (same
e-mail) or sets a password. Run it again for a new link. Profes are invited from the app (Equipo → invitar), which returns a link and a prefilled
WhatsApp text to share.

## Security notes

- Passwords: scrypt (N=2^15, r=8, p=3, per-user salt), timing-safe compare, at most two hashes at a time.
- Sessions: opaque 32-byte token in `cl_sesion` (HttpOnly, Secure, SameSite=Lax), stored as SHA-256. Staff 30 days
  sliding, clienta 180 days. Deactivating staff deletes their sessions.
- CSRF: every non-GET needs `X-Casa-Lotus: 1` and a same-site `Origin` when present (the beacon endpoint
  `/api/publico/eventos` accepts no header but still checks Origin).
- Rate limits (SQLite, sliding window): login 5/15 min per e-mail+IP, codes 3/h per destination and 10/h per IP,
  public booking 10/h per IP.
- Nothing reveals whether someone is a clienta or has an account: `POST /api/auth/codigo` always answers
  `{ ok: true }` and `POST /api/auth/recuperar` always 204, immediately; the lookup and the sending happen after
  the answer. Login errors are identical and equally slow (a dummy hash is checked for unknown e-mails).
- A public booking with a WhatsApp that already belongs to a clienta never reveals it, never fills more than her
  blanks, never spends her plan (it stays «Pendiente de pago»), and opens only a **limited** session that sees
  what it typed and the bookings it made. A code sent to her (WhatsApp/e-mail) upgrades it.
- Free text written to the Sheet is escaped so it can never become a formula (formula injection).
- Logs mask phones, e-mails and tokens; errors never return stack traces.
