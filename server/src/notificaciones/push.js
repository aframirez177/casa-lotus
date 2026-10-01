// Casa Lotus · Web Push to the staff's installed app (web-push + VAPID). Disabled without keys.
// Admins hear about web bookings, freed swings, messages and substitute requests; a profe hears about
// classes assigned to her and new bookings in her classes.

export async function crearPush(ctx) {
  const { publica, privada, sujeto } = ctx.config.push;
  if (!publica || !privada) {
    return { activo: false, clavePublica: "", async aAdmins() {}, async aUsuarios() {}, suscribir() {}, desuscribir() {}, total: () => 0 };
  }
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(sujeto, publica, privada);

  const total = () => ctx.db.prepare("SELECT COUNT(*) AS n FROM push_suscripciones").get().n;
  return {
    activo: true,
    clavePublica: publica,
    total,
    suscribir(usuario, s) {
      ctx.db.prepare(`INSERT INTO push_suscripciones (endpoint, usuario, p256dh, auth, creada) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (endpoint) DO UPDATE SET usuario = excluded.usuario, p256dh = excluded.p256dh, auth = excluded.auth`)
        .run(s.endpoint, usuario, s.keys.p256dh, s.keys.auth, ctx.ahora());
    },
    desuscribir(usuario, endpoint) {
      ctx.db.prepare("DELETE FROM push_suscripciones WHERE endpoint = ? AND usuario = ?").run(endpoint, usuario);
    },
    async aAdmins(m) {
      const subs = ctx.db.prepare(`SELECT p.* FROM push_suscripciones p JOIN usuarios u ON u.id = p.usuario WHERE u.rol = 'admin' AND u.activa = 1`).all();
      await enviar(subs, m);
    },
    async aUsuarios(ids, m) {
      if (!ids?.length) return;
      const subs = ctx.db.prepare(`SELECT p.* FROM push_suscripciones p JOIN usuarios u ON u.id = p.usuario WHERE u.activa = 1 AND u.id IN (${ids.map(() => "?").join(",")})`).all(...ids);
      await enviar(subs, m);
    },
  };

  async function enviar(subs, { titulo, cuerpo, ruta = "/app/admin", etiqueta = "casa-lotus" }) {
      const carga = JSON.stringify({ titulo, cuerpo, url: ruta, tag: etiqueta });
      await Promise.all(subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 3600, urgency: "high" });
          ctx.db.prepare("UPDATE push_suscripciones SET ultimo_ok = ? WHERE endpoint = ?").run(ctx.ahora(), s.endpoint);
        } catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) ctx.db.prepare("DELETE FROM push_suscripciones WHERE endpoint = ?").run(s.endpoint);
          else ctx.log.warn("push falló", { status: e?.statusCode });
        }
      }));
  }
}
