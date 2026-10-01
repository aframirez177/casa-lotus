# Casa Lotus · e2e

End-to-end and visual QA for the whole platform (site + app + API), with Playwright on the local
Google Chrome (`channel: "chrome"`: no browser is downloaded). Findings live in `HALLAZGOS.md`.

## Run

```bash
source ~/.nvm/nvm.sh && nvm use 24
cd e2e
npm install                      # Playwright only (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 is fine)
npm test                         # both projects: movil (375×812, touch) and escritorio (1280×800)
npm run test:movil               # one project
npx playwright test tests/clienta.spec.js -g "reagendar"   # one test
npm run reporte                  # HTML report (traces of failures)
npm run capturas                 # visual review: every route × 2 viewports → capturas/ (gitignored)
node scripts/capturas.mjs admin  # only some groups: sitio, publico, clienta, profe, admin
```

`playwright.config.js` reuses the dev servers when they already run and starts them otherwise:
API `:8787` (`server/`, memory driver), app `:5180` (`app/`), site `:4321` (`site/`), plus a production
build of the app on `:5182` (`scripts/app-prod.mjs` → `e2e/.app-dist`, `app/dist` is left alone) for the
service-worker test. To run them by hand: `WHATSAPP_TOKEN= npm run dev` in `server/`, `npm run dev` in
`app/` and `site/`, `node scripts/app-prod.mjs` here.

Safety: `lib/preparar.js` (global setup) refuses to run unless `/api/admin/salud` says `datos: "memoria"`
and WhatsApp is disconnected, so the suite never writes to the real Sheet nor sends a WhatsApp.

## How the suite is built

| File | Area |
|---|---|
| `tests/sitio.spec.js` | (a) every site page: status, one `<h1>`, title/description/canonical/og:image (served), JSON-LD parses, robots indexable, no class-size number, teachers never gendered, CTAs carry `?ref=`; 404 noindex; `/app/*` noindex; robots.txt and llms.txt |
| `tests/reserva-y-confirmacion.spec.js` | (b) ad click on `/clase-de-prueba/` → CTA → `/app/reservar` → full ficha → «Pendiente de pago» with Origen and campaign; (c) Ana confirms it from «Hoy» → «Confirmada», purchase, `ads.conversion` audited |
| `tests/admin.spec.js` | (c) login form + logout, extra class (and the holiday guard), weekly slot → agenda, assign/change profe, cancel a class with the people to notify, CRM segments vs counts, sort options, clienta detail + access link, every admin screen renders |
| `tests/clienta.spec.js` | (d) access link → balance → cancel on time (+1) → reschedule (atomic) → late cancel (spent) → waiting list; the link is single-use |
| `tests/profe.spec.js` | (e) home, Vino/No vino, walk-in with and without a plan, «Cerrar lista», «No puedo dictar esta clase» → admin alert, future class state; a profe only sees her classes |
| `tests/seguridad.spec.js` | (f) roles, ownership, CSRF, public leaks, code enumeration, limited sessions, logout server-side, login rate limit, API headers (runs once, desktop project) |
| `tests/pwa.spec.js` | (g) manifest + icon sizes, manifest links, service worker on the production build (scope `/app/`, offline shell) |

Conventions:
- Every test builds its own people and classes through the admin API (`lib/api.js`), so tests do not depend
  on each other or on the seed, and survive an API restart (the fake studio resets on every restart).
- One worker: all specs share one in-memory studio and the CRM checks compare counts with lists.
- Each test gets its own client IP (`X-Forwarded-For` on `/api` requests; the API trusts loopback proxies),
  so rate limits count per test as they would per visitor.
- A test that fails because of a product bug stays failing (see `HALLAZGOS.md`). UX feedback checks
  (toasts, copy) are `expect.soft` so the state assertions after them still run.
- Bogotá time matters: the profe test needs a class that started 1–3 h ago today and skips itself between
  00:00 and ~03:00.
