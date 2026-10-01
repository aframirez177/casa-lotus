// Casa Lotus e2e · Playwright on the local Google Chrome (channel "chrome": nothing is downloaded).
// The three dev servers are reused when they already run (ports 8787, 5180, 4321); otherwise they start here.
// The API always runs with its memory driver (fake studio) and WhatsApp off: no message ever leaves this Mac.
import { defineConfig } from "@playwright/test";
import { SITIO, APP_PROD } from "./lib/entorno.js";

const SIN_WHATSAPP = {
  WHATSAPP_TOKEN: "", WHATSAPP_PHONE_NUMBER_ID: "", WHATSAPP_WABA_ID: "", WHATSAPP_APP_SECRET: "", WHATSAPP_VERIFY_TOKEN: "",
  DATOS: "memoria", NODE_ENV: "development",
};

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  // One worker: every spec shares one in-memory studio, and the CRM checks compare counts with lists.
  // Specs build their own people and classes, so order does not matter, but two writers at once would.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  globalSetup: "./lib/preparar.js",
  use: {
    baseURL: SITIO,
    channel: "chrome",
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "movil",
      use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: "escritorio",
      use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: [
    { command: "npm run dev", cwd: "../server", url: "http://localhost:8787/api/salud", reuseExistingServer: true, timeout: 60_000, env: SIN_WHATSAPP },
    { command: "npm run dev", cwd: "../app", url: "http://localhost:5180/app/", reuseExistingServer: true, timeout: 60_000 },
    { command: "npx astro dev --ignore-lock", cwd: "../site", url: "http://localhost:4321/", reuseExistingServer: true, timeout: 90_000 },
    // the app's production build (service worker), only for tests/pwa.spec.js
    { command: "node scripts/app-prod.mjs", cwd: ".", url: APP_PROD + "/app/", reuseExistingServer: true, timeout: 240_000 },
  ],
});
