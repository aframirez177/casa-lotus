/* Casa Lotus · service worker (scope /app/). Precached shell, network-first API reads with an offline
   fallback, Ana's push notifications, and a clean cache on sign-out. */
/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

self.skipWaiting();
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// every /app/ page is the same single-page shell
registerRoute(new NavigationRoute(createHandlerBoundToURL("/app/index.html"), { allowlist: [/^\/app(\/|$)/] }));

// API reads: fresh when online, last copy when offline. Never cache auth, live streams or writes.
const API_CACHE = "cl-api";
registerRoute(
  ({ url, request }) => request.method === "GET" && url.origin === self.location.origin && url.pathname.startsWith("/api/")
    && !url.pathname.startsWith("/api/auth/") && !url.pathname.startsWith("/api/admin/stream") && !url.pathname.startsWith("/api/whatsapp/"),
  new NetworkFirst({ cacheName: API_CACHE, networkTimeoutSeconds: 8, plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 7 * 86400 })] }),
);

self.addEventListener("message", (e) => {
  if (e.data?.tipo === "salir") e.waitUntil(caches.delete(API_CACHE));
});

// Notifications for Ana and the profes: { titulo, cuerpo, ruta | url, etiqueta }
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data?.text() }; }
  const titulo = d.titulo || "Casa Lotus";
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.cuerpo || d.detalle || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/monochrome-512.png",
    tag: d.etiqueta || d.id || undefined,
    renotify: Boolean(d.etiqueta),
    data: { url: d.url || d.ruta || "/app/" },
    vibrate: [90, 70, 90],
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "/app/", self.location.origin).href;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = ventanas.find((v) => new URL(v.url).pathname.startsWith("/app"));
    if (app) {
      await app.focus();
      if ("navigate" in app) return app.navigate(destino);
      return;
    }
    return self.clients.openWindow(destino);
  })());
});
