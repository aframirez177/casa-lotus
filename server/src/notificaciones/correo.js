// Casa Lotus · e-mail. Drivers:
//   resend   production: «Casa Lotus <reservas@casalotus.studio>» through Resend's HTTP API
//            (free plan 3,000/month, 100/day), Reply-To the studio's Gmail;
//   smtp     nodemailer (e.g. Gmail with an app password), kept as an alternative;
//   console  development: prints it; tests: keeps an outbox.
// A failed e-mail is logged, never thrown at a booking: callers send it in the background.
// Logs never carry the API key or a full address (enmascarar keeps only the domain).
import { enmascarar } from "../log.js";

const RESEND_URL = "https://api.resend.com/emails";
const ESPERA_MS = 10000;

/** "Casa Lotus · Reservas <reservas@…>" from the configured sender and an optional display name. */
function remitenteCon(remitente, nombre) {
  if (!nombre) return remitente;
  const dir = remitente.match(/<([^>]+)>/)?.[1] || remitente.trim();
  return nombre.replace(/[<>"]/g, "") + " <" + dir + ">";
}

const direccion = (remitente) => remitente.match(/<([^>]+)>/)?.[1] || remitente.trim();

/** POST to Resend with a timeout; one retry on 429 / 5xx / network errors. */
async function enviarResend({ clave, fetchImpl, log }, cuerpo) {
  let ultimo;
  for (let intento = 0; intento < 2; intento++) {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), ESPERA_MS);
    try {
      const r = await fetchImpl(RESEND_URL, {
        method: "POST", signal: ctrl.signal,
        headers: { Authorization: "Bearer " + clave, "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (r.ok) return await r.json().catch(() => ({}));
      ultimo = new Error("Resend respondió " + r.status);
      if (r.status !== 429 && r.status < 500) throw Object.assign(ultimo, { definitivo: true });
    } catch (e) {
      if (e.definitivo) throw e;
      ultimo = e.name === "AbortError" ? new Error("Resend no respondió a tiempo") : ultimo || e;
    } finally {
      clearTimeout(reloj);
    }
    if (intento === 0) {
      log.warn("reintento de correo", { error: ultimo?.message });
      await new Promise((ok) => setTimeout(ok, 800));
    }
  }
  throw ultimo;
}

export function crearCorreo(config, log, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const c = config.correo;
  const buzon = [];
  const base = { remitente: direccion(c.remitente), buzon };

  if (c.driver === "resend") {
    const listo = Boolean(c.resend.clave);
    return {
      ...base, driver: "resend", activo: listo,
      async enviar({ para, asunto, html, texto, nombreRemitente }) {
        if (!listo) { log.warn("correo sin configurar (falta RESEND_API_KEY)", { asunto }); return false; }
        const r = await enviarResend({ clave: c.resend.clave, fetchImpl, log }, {
          from: remitenteCon(c.remitente, nombreRemitente), to: [para], subject: asunto, html, text: texto,
          ...(c.responderA ? { reply_to: c.responderA } : {}),
        });
        log.info("correo enviado", { para: enmascarar(para), asunto, id: r?.id });
        return true;
      },
    };
  }

  if (c.driver === "smtp") {
    let transporte = null;
    const listo = Boolean(c.smtp.host && c.smtp.user && c.smtp.pass);
    return {
      ...base, driver: "smtp", activo: listo,
      async enviar({ para, asunto, html, texto, nombreRemitente }) {
        if (!listo) { log.warn("correo sin configurar", { asunto }); return false; }
        if (!transporte) {
          const nodemailer = (await import("nodemailer")).default;
          transporte = nodemailer.createTransport({
            host: c.smtp.host, port: c.smtp.port, secure: c.smtp.secure, auth: { user: c.smtp.user, pass: c.smtp.pass },
            connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
          });
        }
        await transporte.sendMail({ from: remitenteCon(c.remitente, nombreRemitente), to: para, replyTo: c.responderA || undefined, subject: asunto, html, text: texto });
        log.info("correo enviado", { para: enmascarar(para), asunto });
        return true;
      },
    };
  }

  return {
    ...base, driver: "console", activo: true,
    async enviar(m) {
      buzon.push({ ...m, de: remitenteCon(c.remitente, m.nombreRemitente), responderA: c.responderA, ts: Date.now() });
      if (buzon.length > 50) buzon.shift();
      if (config.dev) {
        process.stdout.write("\n── correo (driver console) ──\nDe: " + remitenteCon(c.remitente, m.nombreRemitente) + "\nPara: " + m.para + "\nAsunto: " + m.asunto + "\n\n" + m.texto + "\n────────────────────────────\n\n");
      } else {
        log.info("correo omitido (driver console)", { asunto: m.asunto });
      }
      return true;
    },
  };
}
