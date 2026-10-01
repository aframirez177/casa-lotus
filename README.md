# Casa Lotus · plataforma

Yoga, pilates y stretch aéreo en Bogotá. One origin, three parts:

| Path | Part | Stack | Folder |
|---|---|---|---|
| `casalotus.studio/` | public site, one page per search intent | Astro (static), Tailwind v4, GSAP + Lenis | `site/` |
| `casalotus.studio/app/` | installable app for students, profes and Ana (noindex) | React 19, React Router, TanStack Query, Tailwind v4, PWA | `app/` |
| `casalotus.studio/api/` | API over the studio's Google Sheet | Express 5, Sheets API, SQLite (node:sqlite) | `server/` |
| — | business rules, theme, consent texts, the contract | plain ESM | `shared/` |

Start with `shared/CONTRATO.md`: it is the agreement between the three parts.

```bash
nvm use                 # Node 24 (.nvmrc)
npm run instalar        # npm install in server/, app/, site/
npm run dev             # API :8787 (fake studio) · app :5180/app/ · site :4321
npm test                # shared rules + API (incl. WhatsApp) + app
npm run build           # site + app → dist/, with checks (OG images, privacy guard)
```

Deploy:
- **Site + app:** push to `main`. `.github/workflows/deploy-droplet.yml` tests, builds and uploads `dist/` to the droplet.
- **API:** `SERVER=<ip> scripts/desplegar-api.sh` from the Mac (it is a container; CI keys get no shell). Setup, secrets and the Google service account: `server/README.md`.

This repository is public. Business figures, client data and secrets never go in it: the Sheet holds the business, `.env` on the server holds the secrets.
