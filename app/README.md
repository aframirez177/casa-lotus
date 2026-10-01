# Casa Lotus · app (`/app/`)

One installable PWA for the three roles (clienta, profe, admin) plus the public booking flow.
Vite 8 · React 19 · React Router 8 · TanStack Query 5 · Tailwind v4 (theme from `../shared/tema.css`) · motion · lucide-react · vite-plugin-pwa.
The contract it follows is `../shared/CONTRATO.md` (objects §5, endpoints §6, routes §8).

## Run

Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`).

```bash
npm install
npm run dev          # http://localhost:5180/app/  → talks to the real API on :8787 (start web/server first)
npm run dev:demo     # same, with the in-browser demo studio (no backend)
```

In dev you can also switch the demo on for a tab with `?demo=1` (and off with `?demo=0`).
In the demo, `/app/entrar` shows three shortcuts (Ana, a profe, a student), the login code is `123456`,
everyone is invented, and a new web booking rings Ana's bell about 25 s after she opens the app.
«Ajustes → Estado del sistema» has a switch to see Mensajes as if WhatsApp were not connected.

Inside the site's dev server (`web/site`, :4321) the app is proxied at `/app`, so the site's
`/manifest.webmanifest`, `/favicon.svg` and `/icons/*` resolve. Alone on :5180 a dev-only middleware
(`vite.dev-iconos.js`) serves stand-ins so the console stays clean.

## Build, test, lint

```bash
npm run build        # → dist/ (served at casalotus.studio/app/), service worker dist/sw.js
npm run build:demo   # a static build that runs entirely on the demo studio
npm test             # vitest: fetch wrapper, demo rules (book, cancel on time vs late, reschedule), policy copy
npm run lint
```

The demo adapter ships only in dev and in `build:demo`: `npm run build` drops it entirely (no `demo-*.js` in `dist/`),
and `?demo=1` does nothing on a production build.

## Structure

```
src/
  main.jsx, App.jsx        boot (demo adapter when on), providers, router
  app.css                  Tailwind + shared theme + the app's component classes
  sw.js                    service worker: precache, network-first GET /api (offline reading), push, sign-out cleanup
  api/
    cliente.js             the one fetch wrapper: credentials, X-Casa-Lotus, normalized errors
    claves.js              query keys
    stream.js              SSE /api/admin/stream (the demo plugs in its own source)
    modo.js                demo switch
    hooks/                 query + mutation hooks per area (auth, publico, clienta, profe, admin), optimistic writes
    mock/estudio.js        the seeded invented studio
    mock/servidor.js       the contract implemented in the browser, on shared/reglas.js
  lib/                     dates in words, policy copy, class colours, .ics, attribution, install, push
  ui/                      design-system pieces: Boton, Hoja (sheet/dialog), Avisos (toasts + Deshacer),
                           Columpios (swing icons), Anillo (ring), Campos, Segmentado, skeletons, logo
  shell/                   routes + role guards, role frame (glass pill nav / side rail), bell, install card
  pantallas/
    entrar/                /entrar (two doors), /acceso/:token, /invitacion/:token, /restablecer/:token
    reservar/              /reservar: class picker, ficha, agreements, result
    clienta/               /mi, /mi/clases, /mi/reservar, /mi/perfil
    profe/                 /profe, /profe/clase/:id
    admin/                 /admin (Hoy), agenda, clase, horario, clientas, mensajes, pagos, equipo, ajustes, registro, atribucion
    comun/                 class roster and tools (profe + admin), account screen
tests/                     vitest
```

## Roles and routes

| Route | Who | Screen |
|---|---|---|
| `/app/` | anyone | sends you to your home by role (`/admin`, `/profe`, `/mi`) or to `/entrar` |
| `/app/entrar` | anyone | «Soy alumna» (code by WhatsApp or email) · «Equipo» (email + password) · forgot password |
| `/app/acceso/:token` · `/app/invitacion/:token` · `/app/restablecer/:token` | links | private access link · new team member · password reset |
| `/app/reservar` | anyone | class → tú → tu ficha → acuerdos → payment instructions. Reads `?clase`, `?plan`, `?ref`, `?espera=1` and `localStorage["cl_atribucion"]` |
| `/app/mi…` | clienta | next class + countdown, balance ring, quick book, waiting lists · mis clases · reservar · perfil |
| `/app/profe…` | profe | next class, classes to mark · roster with ficha, Vino / No vino, add who came, close list, ask for a replacement, notes · cuenta |
| `/app/admin…` | admin | Hoy · Agenda + class detail · Horario · Clientas (CRM) · Mensajes · Pagos · Equipo · Ajustes · Cuenta · Registro · Resultados de la web (`/admin/atribucion`) |

Each screen is its own chunk. `/app/reservar` paints with React, the router, TanStack Query and the first
step only (≈140 KB gzipped, ≈106 KB of it the three libraries): its forms, the result, the sheets and the motion
library load when they are used, and motion's providers live in the role frames and sheets, not at the root.

## Notes

- Never states a swing count to the public: the booking UI shows swing icons and words («Quedan pocos cupos»).
- Every date rule comes from `shared/reglas.js` (Bogotá time); consent texts from `shared/consentimientos.js`.
- Reversible actions (cancel, free a hold, leave a waiting list) apply at once and commit after 5 s unless
  «Deshacer»; pending commits flush when the app goes to the background.
- Motion is spring-based and switches off under `prefers-reduced-motion`.
