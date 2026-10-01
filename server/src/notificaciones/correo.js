// Casa Lotus · e-mail. Drivers: `console` (development: prints it; tests: keeps an outbox) and `smtp`
// (nodemailer; Gmail SMTP with an app password works). A failed e-mail is logged, never thrown at a
// booking: callers run it in the background.

export function crearCorreo(config, log) {
  const c = config.correo;
  const buzon = [];
  if (c.driver === "smtp") {
    let transporte = null;
    const listo = Boolean(c.smtp.host && c.smtp.user && c.smtp.pass);
    return {
      driver: "smtp", activo: listo, buzon,
      async enviar({ para, asunto, html, texto, nombreRemitente }) {
        if (!listo) { log.warn("correo sin configurar", { asunto }); return false; }
        if (!transporte) {
          const nodemailer = (await import("nodemailer")).default;
          transporte = nodemailer.createTransport({
            host: c.smtp.host, port: c.smtp.port, secure: c.smtp.secure, auth: { user: c.smtp.user, pass: c.smtp.pass },
            connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
          });
        }
        const remitente = nombreRemitente ? nombreRemitente + " <" + (c.remitente.match(/<([^>]+)>/)?.[1] || c.smtp.user) + ">" : c.remitente;
        await transporte.sendMail({ from: remitente, to: para, subject: asunto, html, text: texto });
        log.info("correo enviado", { para, asunto });
        return true;
      },
    };
  }
  return {
    driver: "console", activo: true, buzon,
    async enviar(m) {
      buzon.push({ ...m, ts: Date.now() });
      if (buzon.length > 50) buzon.shift();
      if (config.dev) {
        process.stdout.write("\n── correo (driver console) ──\nPara: " + m.para + "\nAsunto: " + m.asunto + "\n\n" + m.texto + "\n────────────────────────────\n\n");
      } else {
        log.info("correo omitido (driver console)", { asunto: m.asunto });
      }
      return true;
    },
  };
}
