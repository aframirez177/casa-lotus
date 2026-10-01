// Casa Lotus · e-mail templates (HTML + text). Brand palette from shared/tema.css; Arial for mail clients.
import { whatsappLegible, enlaceWhatsApp, primerNombre } from "../../../shared/reglas.js";

const h = (t) => String(t ?? "").replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]);

const boton = (href, texto, fondo, color) =>
  '<a href="' + h(href) + '" style="display:inline-block;margin:0 8px 10px 0;padding:13px 22px;border-radius:999px;background:' + fondo +
  ";color:" + color + ';text-decoration:none;font-weight:bold;font-size:15px">' + h(texto) + "</a>";

function marco(publicUrl, cuerpo, pie) {
  return '<div style="margin:0;padding:24px 12px;background:#EFF4F8">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#24434C">' +
    '<tr><td style="padding:4px 4px 18px"><img src="' + h(publicUrl) + '/apple-touch-icon.png" width="44" height="44" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:12px">' +
    '<span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:22px;color:#165472;letter-spacing:.01em">Casa Lotus</span></td></tr>' +
    '<tr><td style="background:#FFFFFF;border-radius:22px;padding:28px 26px">' + cuerpo + "</td></tr>" +
    '<tr><td style="padding:16px 6px 0;font-size:12px;line-height:1.5;color:#53748C">' + pie + "</td></tr></table></div>";
}

/**
 * Ana hears about a web booking at once (port of apps-script/api/Api.js avisarReserva_).
 * d: { nombre, whatsapp, codigo, clase: { fechaTexto, horaTexto, clase }, venceTexto, publicUrl }
 */
export function correoReservaWeb(d) {
  const c = d.clase, cuando = c.fechaTexto + " · " + c.horaTexto, primer = primerNombre(d.nombre);
  const waTexto = "Hola " + primer + ", recibimos tu reserva para el " + c.fechaTexto + " a las " + c.horaTexto +
    " en Casa Lotus. Para confirmarla, envíanos por aquí el comprobante de pago. ¡Te esperamos!";
  const waLink = enlaceWhatsApp(d.whatsapp, waTexto);
  const panel = d.publicUrl + "/app/admin";
  const cuerpo =
    '<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;font-weight:bold;color:#53748C">NUEVA RESERVA WEB</p>' +
    '<h1 style="margin:0 0 18px;font-size:26px;line-height:1.15;font-weight:normal;color:#165472">' + h(primer) + " apartó un columpio</h1>" +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;background:#D2F3A2;border-radius:16px"><tr><td style="padding:16px 18px">' +
    '<p style="margin:0;font-size:20px;line-height:1.25;color:#0E3A4E">' + h(cuando) + "</p>" +
    '<p style="margin:4px 0 0;font-size:14px;color:#24434C">' + h((c.clase ? c.clase + " · " : "") + "código " + d.codigo) + "</p></td></tr></table>" +
    '<p style="margin:18px 0 4px;font-size:15px"><strong style="color:#165472">' + h(d.nombre) + "</strong> · " + h(whatsappLegible(d.whatsapp)) + "</p>" +
    '<p style="margin:0 0 22px;font-size:14px;line-height:1.45;color:#53748C">El columpio queda apartado hasta el ' + h(d.venceTexto) +
    " Cuando te llegue el comprobante, confírmala en el panel. Si no llega, el columpio se libera solo.</p>" +
    boton(panel, "Abrir el panel", "#165472", "#FFFFFF") + boton(waLink, "Escribirle por WhatsApp", "#99E27C", "#0E3A4E");
  const html = marco(d.publicUrl, cuerpo, "Aviso automático del sistema de Casa Lotus. Para dejar de recibirlo, borra el correo en Ajustes → «Correo para avisos».");
  const texto = "Nueva reserva web\n\n" + d.nombre + " · " + whatsappLegible(d.whatsapp) + "\n" + cuando + (c.clase ? " · " + c.clase : "") +
    "\nCódigo " + d.codigo + "\n\nEl columpio queda apartado hasta el " + d.venceTexto + " Confírmala en el panel cuando llegue el comprobante.\n\nPanel: " +
    panel + "\nWhatsApp: " + waLink;
  return { asunto: "Nueva reserva web · " + d.nombre + " · " + cuando, html, texto };
}

export function correoCodigo({ codigo, publicUrl }) {
  const cuerpo = '<h1 style="margin:0 0 14px;font-size:24px;font-weight:normal;color:#165472">Tu código para entrar</h1>' +
    '<p style="margin:0 0 18px;font-size:34px;letter-spacing:.18em;font-weight:bold;color:#0E3A4E">' + h(codigo) + "</p>" +
    '<p style="margin:0;font-size:14px;line-height:1.45;color:#53748C">Vence en 10 minutos. Si no lo pediste, ignora este correo.</p>';
  return {
    asunto: "Tu código de Casa Lotus: " + codigo,
    html: marco(publicUrl, cuerpo, "Casa Lotus · Bogotá"),
    texto: "Tu código para entrar a Casa Lotus es " + codigo + ". Vence en 10 minutos. Si no lo pediste, ignora este correo.",
  };
}

export function correoRestablecer({ nombre, enlace, publicUrl }) {
  const cuerpo = '<h1 style="margin:0 0 14px;font-size:24px;font-weight:normal;color:#165472">Hola ' + h(primerNombre(nombre)) + "</h1>" +
    '<p style="margin:0 0 20px;font-size:15px;line-height:1.5">Para crear una contraseña nueva, abre este enlace. Vence en una hora y sirve una sola vez.</p>' +
    boton(enlace, "Crear contraseña nueva", "#165472", "#FFFFFF") +
    '<p style="margin:12px 0 0;font-size:13px;line-height:1.45;color:#53748C">Si no lo pediste, ignora este correo: tu contraseña sigue igual.</p>';
  return {
    asunto: "Restablece tu contraseña de Casa Lotus",
    html: marco(publicUrl, cuerpo, "Casa Lotus · Bogotá"),
    texto: "Hola " + primerNombre(nombre) + ", para crear una contraseña nueva abre este enlace (vence en una hora): " + enlace +
      "\nSi no lo pediste, ignora este correo.",
  };
}
