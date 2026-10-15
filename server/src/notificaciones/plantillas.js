// Casa Lotus · e-mail templates (HTML + text). Brand palette from shared/tema.css; Arial for mail clients.
import { whatsappLegible, enlaceWhatsApp, primerNombre, dinero } from "../../../shared/reglas.js";

/** Hosted by the public site (no inline cid images: Resend sends plain HTML). */
export const LOGO_CORREO = "https://casalotus.studio/apple-touch-icon.png";

/** "… a las 10:00 p. m." already ends a sentence: never write "m..". */
const conPunto = (t) => (/[.!?]$/.test(t) ? t : t + ".");

const h = (t) => String(t ?? "").replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]);

const boton = (href, texto, fondo, color) =>
  '<a href="' + h(href) + '" style="display:inline-block;margin:0 8px 10px 0;padding:13px 22px;border-radius:999px;background:' + fondo +
  ";color:" + color + ';text-decoration:none;font-weight:bold;font-size:15px">' + h(texto) + "</a>";

function marco(publicUrl, cuerpo, pie) {
  return '<div style="margin:0;padding:24px 12px;background:#EFF4F8">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#24434C">' +
    '<tr><td style="padding:4px 4px 18px"><img src="' + LOGO_CORREO + '" width="44" height="44" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:12px">' +
    '<span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:22px;color:#165472;letter-spacing:.01em">Casa Lotus</span></td></tr>' +
    '<tr><td style="background:#FFFFFF;border-radius:22px;padding:28px 26px">' + cuerpo + "</td></tr>" +
    '<tr><td style="padding:16px 6px 0;font-size:12px;line-height:1.5;color:#53748C">' + pie + "</td></tr></table></div>";
}

/**
 * Ana hears about a web booking at once (port of apps-script/api/Api.js avisarReserva_).
 * d: { nombre, whatsapp, codigo, clase: { fechaTexto, horaTexto, clase }, venceTexto, publicUrl, conPlan?, saldo? }
 * conPlan: a returning student booked with her own plan («Reservó con su plan»); otherwise she held a swing.
 */
export function correoReservaWeb(d) {
  const c = d.clase, cuando = c.fechaTexto + " · " + c.horaTexto, primer = primerNombre(d.nombre);
  const waTexto = d.conPlan
    ? "Hola " + primer + ", recibimos tu reserva para el " + c.fechaTexto + " a las " + c.horaTexto + " en Casa Lotus. ¡Te esperamos!"
    : "Hola " + primer + ", recibimos tu reserva para el " + c.fechaTexto + " a las " + c.horaTexto +
      " en Casa Lotus. Para confirmarla, envíanos por aquí el comprobante de pago. ¡Te esperamos!";
  const waLink = enlaceWhatsApp(d.whatsapp, waTexto);
  const panel = d.publicUrl + "/app/admin";
  const quedan = typeof d.saldo === "number" ? " Le " + (d.saldo === 1 ? "queda 1 clase." : "quedan " + d.saldo + " clases.") : "";
  const estado = d.conPlan
    ? "Quedó confirmada con su plan." + quedan + " No tienes que hacer nada."
    : "El columpio queda apartado hasta el " + conPunto(d.venceTexto) + " Cuando te llegue el comprobante, confírmala en el panel. Si no llega, el columpio se libera solo.";
  const cuerpo =
    '<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;font-weight:bold;color:#53748C">NUEVA RESERVA WEB</p>' +
    '<h1 style="margin:0 0 18px;font-size:26px;line-height:1.15;font-weight:normal;color:#165472">' + h(primer) + (d.conPlan ? " reservó con su plan" : " apartó un columpio") + "</h1>" +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;background:#D2F3A2;border-radius:16px"><tr><td style="padding:16px 18px">' +
    '<p style="margin:0;font-size:20px;line-height:1.25;color:#0E3A4E">' + h(cuando) + "</p>" +
    '<p style="margin:4px 0 0;font-size:14px;color:#24434C">' + h((c.clase ? c.clase + " · " : "") + "código " + d.codigo) + "</p></td></tr></table>" +
    '<p style="margin:18px 0 4px;font-size:15px"><strong style="color:#165472">' + h(d.nombre) + "</strong> · " + h(whatsappLegible(d.whatsapp)) + "</p>" +
    '<p style="margin:0 0 22px;font-size:14px;line-height:1.45;color:#53748C">' + h(estado) + "</p>" +
    boton(panel, "Abrir el panel", "#165472", "#FFFFFF") + boton(waLink, "Escribirle por WhatsApp", "#99E27C", "#0E3A4E");
  const html = marco(d.publicUrl, cuerpo, "Aviso automático del sistema de Casa Lotus. Para dejar de recibirlo, borra el correo en Ajustes → «Correo para avisos».");
  const texto = "Nueva reserva web · " + (d.conPlan ? "reservó con su plan" : "apartó un columpio") + "\n\n" + d.nombre + " · " + whatsappLegible(d.whatsapp) + "\n" +
    cuando + (c.clase ? " · " + c.clase : "") + "\nCódigo " + d.codigo + "\n\n" + estado + "\n\nPanel: " + panel + "\nWhatsApp: " + waLink;
  return { asunto: "Nueva reserva web · " + d.nombre + " · " + cuando, html, texto };
}

const parrafo = (t, color = "#24434C", margen = "0 0 14px") =>
  '<p style="margin:' + margen + ';font-size:15px;line-height:1.5;color:' + color + '">' + t + "</p>";
const fuerte = (t) => '<strong style="color:#0E3A4E">' + h(t) + "</strong>";

/** The lime card with the class: name, day, time range and profe. c: { nombre, fechaTexto, horaTexto, finTexto, profe } */
function tarjetaClase(c) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;background:#D2F3A2;border-radius:16px;margin:0 0 18px"><tr><td style="padding:16px 18px">' +
    '<p style="margin:0;font-size:20px;line-height:1.25;color:#0E3A4E">' + h(c.nombre) + "</p>" +
    '<p style="margin:6px 0 0;font-size:15px;color:#24434C">' + h(c.fechaTexto.charAt(0).toUpperCase() + c.fechaTexto.slice(1)) + "</p>" +
    '<p style="margin:2px 0 0;font-size:15px;color:#24434C">' + h(c.horaTexto + (c.finTexto ? " – " + c.finTexto : "")) + "</p>" +
    (c.profe ? '<p style="margin:2px 0 0;font-size:15px;color:#24434C">Con tu profe ' + h(c.profe) + "</p>" : "") +
    "</td></tr></table>";
}

const quedanTexto = (n) => (n === 0 ? "Era la última clase de tu plan." : n === 1 ? "Te queda 1 clase." : "Te quedan " + n + " clases.");

/**
 * The student's confirmation after any booking (web, app, Ana's panel, a reschedule, a confirmed payment).
 * d: {
 *   nombre, codigo, publicUrl, calendario (Google Calendar link), horasCancelar,
 *   clase: { nombre, fechaTexto, horaTexto, finTexto, profe },
 *   confirmada: boolean, saldo?: number | null,                       // classes left, when it may be shown
 *   pago?: { monto, llave, medios: string[], whatsappTexto, venceTexto, waEnlace },  // a held swing
 *   reagendadaDe?: "jueves 1 de octubre a las 6:00 p. m."
 * }
 */
export function correoClaseClienta(d) {
  const c = d.clase, primer = primerNombre(d.nombre);
  const cuandoAsunto = c.fechaTexto + ", " + c.horaTexto;
  const ojo = d.reagendadaDe ? "CAMBIAMOS TU CLASE" : d.confirmada ? "TU CLASE ESTÁ CONFIRMADA" : "APARTAMOS TU CUPO";
  const titulo = d.confirmada ? "¡Te esperamos" + (primer ? ", " + primer : "") + "!" : (primer ? primer + ", tu" : "Tu") + " cupo está apartado";
  const p = d.pago || {};
  const medios = (p.medios && p.medios.length ? p.medios : ["Nequi", "DaviPlata", "Bre-B"]);
  const mediosTexto = medios.length > 1 ? medios.slice(0, -1).join(", ") + " o " + medios[medios.length - 1] : medios[0];
  const paga = p.monto > 0 ? "paga " + dinero(p.monto) : "paga tu clase";

  let estadoHtml, estadoTexto;
  if (d.confirmada) {
    const quedan = typeof d.saldo === "number" ? " " + quedanTexto(d.saldo) : "";
    estadoTexto = "Quedó confirmada con tu plan." + quedan;
    estadoHtml = parrafo(h(estadoTexto));
  } else {
    estadoTexto = "Para confirmarla, " + paga + " por " + mediosTexto + " a la llave " + p.llave + " y envía el comprobante al WhatsApp " +
      conPunto(p.whatsappTexto + (p.venceTexto ? " antes del " + p.venceTexto : "")) + " Si no llega a tiempo, el cupo se libera solo.";
    estadoHtml = parrafo("Para confirmarla, " + (p.monto > 0 ? "paga " + fuerte(dinero(p.monto)) : "paga tu clase") + " por " + h(mediosTexto) + " a la llave " + fuerte(p.llave) +
      " y envía el comprobante al WhatsApp " + fuerte(p.whatsappTexto) + (p.venceTexto ? " antes del " + fuerte(p.venceTexto) + (/\.$/.test(p.venceTexto) ? "" : ".") : ".") +
      " Si no llega a tiempo, el cupo se libera solo.");
  }
  const regla = d.confirmada
    ? "¿No puedes venir? Cancela o cambia tu clase en la app hasta " + d.horasCancelar + " horas antes y la clase vuelve a tu plan. Con menos aviso se libera tu columpio, pero la clase se descuenta."
    : "¿No puedes venir? Cancélala en la app para liberar el cupo.";
  const mi = d.publicUrl + "/app/mi";
  const cuerpo =
    '<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;font-weight:bold;color:#53748C">' + ojo + "</p>" +
    '<h1 style="margin:0 0 18px;font-size:26px;line-height:1.15;font-weight:normal;color:#165472">' + h(titulo) + "</h1>" +
    (d.reagendadaDe ? parrafo("Movimos tu reserva del " + h(d.reagendadaDe) + " a esta clase.") : "") +
    tarjetaClase(c) + estadoHtml +
    (!d.confirmada && p.waEnlace ? boton(p.waEnlace, "Enviar el comprobante por WhatsApp", "#99E27C", "#0E3A4E") : "") +
    parrafo(h(regla), "#53748C", "4px 0 20px") +
    boton(mi, "Ver mis clases", "#165472", "#FFFFFF") + boton(d.calendario, "Agregar a Google Calendar", "#D2F3A2", "#0E3A4E");
  const html = marco(d.publicUrl, cuerpo, "Casa Lotus · Bogotá. Código de tu reserva: " + h(d.codigo) +
    ". Adjuntamos la clase como archivo de calendario (.ics) por si usas otro calendario.");
  const texto = ojo.charAt(0) + ojo.slice(1).toLowerCase() + "\n\n" + titulo + "\n\n" +
    (d.reagendadaDe ? "Movimos tu reserva del " + d.reagendadaDe + " a esta clase.\n\n" : "") +
    c.nombre + "\n" + c.fechaTexto + "\n" + c.horaTexto + (c.finTexto ? " – " + c.finTexto : "") + (c.profe ? "\nCon tu profe " + c.profe : "") +
    "\n\n" + estadoTexto + (!d.confirmada && p.waEnlace ? "\nEnviar el comprobante: " + p.waEnlace : "") + "\n\n" + regla +
    "\n\nTus clases: " + mi + "\nAgregar a Google Calendar: " + d.calendario + "\n\nCódigo de tu reserva: " + d.codigo;
  return { asunto: "Tu clase en Casa Lotus · " + cuandoAsunto, html, texto };
}

/**
 * «Cancelamos tu clase»: she cancelled, Ana cancelled her booking, or the studio cancelled the class.
 * d: { nombre, publicUrl, horasCancelar, whatsappTexto, clase: { nombre, fechaTexto, horaTexto, finTexto, profe },
 *      porEstudio: boolean (the class itself was cancelled), motivo?: string,
 *      resultado: "devuelta" (the class went back to her plan) | "descontada" (late: spent) | "liberada" (unpaid hold) }
 */
export function correoCancelacionClienta(d) {
  const c = d.clase, primer = primerNombre(d.nombre);
  const titulo = d.porEstudio ? "Tuvimos que cancelar tu clase" : "Cancelamos tu reserva";
  let detalle;
  if (d.porEstudio) {
    detalle = "Tuvimos que cancelar esta clase" + (d.motivo ? " (" + d.motivo + ")" : "") + ". " +
      (d.resultado === "liberada" ? "No tienes que pagar nada." : "La clase volvió a tu plan.") + " Perdona el cambio.";
  } else if (d.resultado === "devuelta") {
    detalle = "La clase volvió a tu plan.";
  } else if (d.resultado === "descontada") {
    detalle = "Como faltaban menos de " + d.horasCancelar + " horas, se liberó tu columpio pero la clase se descuenta de tu plan.";
  } else {
    detalle = "Liberamos el cupo. No tienes que pagar nada.";
  }
  const otra = d.publicUrl + "/app/reservar";
  const cuerpo =
    '<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;font-weight:bold;color:#53748C">CLASE CANCELADA</p>' +
    '<h1 style="margin:0 0 18px;font-size:26px;line-height:1.15;font-weight:normal;color:#165472">' + h((primer ? primer + ", " : "") + titulo.charAt(0).toLowerCase() + titulo.slice(1)) + "</h1>" +
    tarjetaClase(c) + parrafo(h(detalle)) +
    parrafo("¿Quieres venir otro día? Reserva otro horario en la app o escríbenos al WhatsApp " + fuerte(d.whatsappTexto) + ".", "#53748C", "4px 0 20px") +
    boton(otra, "Reservar otra clase", "#165472", "#FFFFFF");
  const html = marco(d.publicUrl, cuerpo, "Casa Lotus · Bogotá");
  const texto = titulo + "\n\n" + c.nombre + "\n" + c.fechaTexto + "\n" + c.horaTexto + (c.finTexto ? " – " + c.finTexto : "") + "\n\n" + detalle +
    "\n\n¿Quieres venir otro día? Reserva otro horario: " + otra + " o escríbenos al WhatsApp " + d.whatsappTexto + ".";
  return { asunto: "Cancelamos tu clase · " + c.fechaTexto + ", " + c.horaTexto, html, texto };
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
