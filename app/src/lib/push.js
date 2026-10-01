// Web Push for Ana's installed app: the server's VAPID public key comes from /api/admin/salud (push.clavePublica).
function aBytes(base64) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export const pushDisponible = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const permisoPush = () => (typeof Notification === "undefined" ? "no-soportado" : Notification.permission);

/** Returns the PushSubscription JSON to send to the server, or throws with Ana's words. */
export async function suscribirPush(clavePublica) {
  if (!pushDisponible()) throw new Error("Este navegador no recibe notificaciones. Instala la app en tu teléfono primero.");
  if (!clavePublica) throw new Error("El servidor todavía no tiene las notificaciones configuradas.");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") throw new Error("Para recibir avisos, permite las notificaciones en el teléfono.");
  const reg = await navigator.serviceWorker.ready;
  const actual = await reg.pushManager.getSubscription();
  const sub = actual || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clavePublica) }));
  return sub.toJSON();
}
