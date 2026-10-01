// Builds the app for production into e2e/.app-dist (app/dist is left alone) and serves it with `vite preview`
// on :5182 under /app/, with /api proxied to the dev API (app/vite.config.js → preview.proxy).
// Only the PWA test needs it: the dev server never registers the service worker.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../../app/", import.meta.url));
const salida = fileURLToPath(new URL("../.app-dist/", import.meta.url));
const vite = app + "node_modules/.bin/vite";

const b = spawnSync(vite, ["build", "--outDir", salida, "--emptyOutDir", "--logLevel", "warn"], { cwd: app, stdio: "inherit" });
if (b.status !== 0) process.exit(b.status ?? 1);
const p = spawn(vite, ["preview", "--outDir", salida, "--port", "5182", "--strictPort"], { cwd: app, stdio: "inherit" });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { p.kill(s); process.exit(0); });
p.on("exit", (c) => process.exit(c ?? 0));
