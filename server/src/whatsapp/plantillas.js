// Casa Lotus · WhatsApp message templates (the catalogue we submit to Meta and send from).
//
// Rules this file follows (sources in docs/whatsapp/guia-whatsapp-cloud-api.md §4):
// - Names: lowercase letters, digits and underscores. Language "es".
// - Named parameters ({{nombre}}), parameter_format NAMED, one example per parameter.
// - A body never starts or ends with a parameter, and two parameters are never side by side.
// - UTILITY = triggered by something she did or agreed to (a booking, the waiting list, her plan)
//   and purely informational. Anything that sells is MARKETING. AUTHENTICATION is Meta's fixed
//   text with a copy-code button.
// - Never gender the teachers («tu profe»). Never publish the trial-credit rule.
// Changing a body after approval means editing it in Meta again (or a new name): keep them stable.

export const IDIOMA = "es";

/** Minutes a login code lives (CONTRATO §3: codes last 10 minutes). Shown in the auth template footer. */
export const MINUTOS_CODIGO = 10;

const v = (nombre, ejemplo, descripcion) => ({ nombre, ejemplo, descripcion });

export const PLANTILLAS = Object.freeze([
  {
    nombre: "reserva_recibida",
    categoria: "UTILITY",
    uso: "Apenas alguien reserva en la web y falta el pago: le dice cuánto, a qué llave y hasta cuándo le guardamos el cupo.",
    // The payment key and the bookings WhatsApp are written in the text (both public) to keep the
    // variable count low, which Meta's review rewards. If «Llave de pago» or «WhatsApp de reservas»
    // change in Ajustes, this body must be edited in Meta too.
    cuerpo:
      "Hola {{nombre}}, recibimos tu reserva para {{clase}} el {{cuando}}. Te guardamos el cupo hasta el {{vence}}.\n\n" +
      "Para confirmarla, paga {{monto}} por Nequi, DaviPlata o Bre-B a la llave 319 328 8469 y envía el comprobante al WhatsApp 312 872 0888 (o por este chat) con tu código {{codigo}}.\n\n" +
      "¡Gracias por elegir Casa Lotus!",
    variables: [
      v("nombre", "Laura", "Primer nombre"),
      v("clase", "Pilates Aéreo", "Nombre de la clase"),
      v("cuando", "sábado 3 de octubre a las 8:00 a. m.", "Fecha y hora de la clase"),
      v("vence", "viernes 2 de octubre a las 8:00 p. m.", "Hasta cuándo se guarda el cupo sin pago"),
      v("monto", "$25.000", "Valor a pagar"),
      v("codigo", "R-0042", "Código de la reserva"),
    ],
  },
  {
    nombre: "reserva_confirmada",
    categoria: "UTILITY",
    uso: "Cuando Ana confirma el pago o una reserva que cubre un plan.",
    cuerpo:
      "¡Listo, {{nombre}}! Tu clase de {{clase}} quedó confirmada para el {{cuando}}.\n\n" +
      "Si necesitas cancelarla o cambiarla, avísanos por aquí con al menos {{horas}} horas de anticipación. ¡Te esperamos!",
    variables: [
      v("nombre", "Laura", "Primer nombre"),
      v("clase", "Pilates Aéreo", "Nombre de la clase"),
      v("cuando", "sábado 3 de octubre a las 8:00 a. m.", "Fecha y hora de la clase"),
      v("horas", "6", "Horas mínimas para cancelar (Ajustes)"),
    ],
  },
  {
    nombre: "recordatorio_clase",
    categoria: "UTILITY",
    uso: "El día anterior a cada clase, a quien tiene la reserva confirmada.",
    cuerpo:
      "Hola {{nombre}}, te esperamos mañana {{cuando}} en tu clase de {{clase}}.\n\n" +
      "Llega 10 minutos antes, con ropa deportiva ajustada y tu botella de agua.\n\n" +
      "Si no puedes venir, avísanos por aquí lo antes posible para darle el cupo a alguien más.",
    variables: [
      v("nombre", "Laura", "Primer nombre"),
      v("cuando", "sábado 3 de octubre a las 8:00 a. m.", "Fecha y hora de la clase"),
      v("clase", "Pilates Aéreo", "Nombre de la clase"),
    ],
    botones: [
      { tipo: "QUICK_REPLY", texto: "Ahí estaré" },
      { tipo: "QUICK_REPLY", texto: "Necesito cancelar" },
    ],
  },
  {
    nombre: "cupo_liberado",
    categoria: "UTILITY",
    uso: "A quien está en lista de espera de una clase cuando se libera un cupo.",
    cuerpo:
      "Hola {{nombre}}, se liberó un cupo en {{clase}} del {{cuando}}, la clase en la que estás en lista de espera.\n\n" +
      "Si lo quieres, respóndenos por aquí y te lo apartamos. Se lo damos a quien responda primero.",
    variables: [
      v("nombre", "Laura", "Primer nombre"),
      v("clase", "Yoga Aéreo", "Nombre de la clase"),
      v("cuando", "miércoles 7 de octubre a las 6:00 p. m.", "Fecha y hora de la clase"),
    ],
    botones: [{ tipo: "QUICK_REPLY", texto: "Lo quiero" }],
  },
  {
    nombre: "clase_cancelada",
    categoria: "UTILITY",
    uso: "Cuando el estudio cancela una clase: a cada persona que estaba reservada.",
    cuerpo:
      "Hola {{nombre}}, lo sentimos mucho: tuvimos que cancelar la clase de {{clase}} del {{cuando}}.\n\n" +
      "Si ya la habías pagado, la clase queda a tu favor. Respóndenos por aquí y te ayudamos a reagendarla.",
    variables: [
      v("nombre", "Laura", "Primer nombre"),
      v("clase", "Stretch Aéreo", "Nombre de la clase"),
      v("cuando", "sábado 3 de octubre a las 9:15 a. m.", "Fecha y hora de la clase"),
    ],
  },
  {
    nombre: "cambio_de_clase",
    categoria: "UTILITY",
    uso: "Cuando cambia algo de una clase reservada (horario, tipo de clase o profe), o tras reagendarla.",
    cuerpo:
      "Hola {{nombre}}, hubo un cambio en tu clase del {{cuando}}: {{cambio}}.\n\n" +
      "Si tienes dudas o prefieres otro horario, respóndenos por aquí.",
    variables: [
      v("nombre", "Laura", "Primer nombre"),
      v("cuando", "sábado 3 de octubre a las 8:00 a. m.", "Fecha y hora original"),
      v("cambio", "ahora será Stretch Aéreo con tu profe Geral", "Qué cambió, en una frase"),
    ],
  },
  {
    nombre: "saldo_bajo",
    categoria: "UTILITY",
    uso: "Cuando a alguien le quedan pocas clases en su plan (umbral en Ajustes).",
    cuerpo:
      "Hola {{nombre}}, te contamos que te quedan {{saldo}} en tu plan de Casa Lotus, vigente hasta el {{vence}}.\n\n" +
      "Si tienes preguntas sobre tu plan, respóndenos por aquí.",
    variables: [
      v("nombre", "Laura", "Primer nombre"),
      v("saldo", "2 clases", "Clases que le quedan, con la palabra «clase(s)»"),
      v("vence", "viernes 30 de octubre", "Fecha en que vence el plan"),
    ],
  },
  {
    nombre: "plan_por_vencer",
    categoria: "UTILITY",
    uso: "Unos días antes de que venza un plan que todavía tiene clases sin usar.",
    cuerpo:
      "Hola {{nombre}}, tu plan de Casa Lotus vence el {{vence}} y todavía tienes {{saldo}} por usar.\n\n" +
      "Reserva antes de esa fecha para que no se pierdan. Si necesitas ayuda para agendarlas, respóndenos por aquí.",
    variables: [
      v("nombre", "Laura", "Primer nombre"),
      v("vence", "viernes 30 de octubre", "Fecha en que vence el plan"),
      v("saldo", "3 clases", "Clases sin usar, con la palabra «clase(s)»"),
    ],
  },
  {
    nombre: "bienvenida_prueba",
    categoria: "MARKETING",
    uso: "Al día siguiente de la clase de prueba, a quien todavía no tiene plan. Es marketing: solo con su autorización y nunca a quien pidió la baja.",
    cuerpo:
      "Hola {{nombre}}, ¡gracias por venir a tu clase de prueba en Casa Lotus! Esperamos que te hayas sentido muy bien.\n\n" +
      "Si quieres seguir practicando, tenemos planes mensuales y trimestrales. Respóndenos por aquí y te ayudamos a elegir el tuyo.",
    variables: [v("nombre", "Laura", "Primer nombre")],
    pie: "Responde BAJA si no quieres recibir más mensajes.",
    botones: [{ tipo: "QUICK_REPLY", texto: "Quiero ver los planes" }],
  },
  {
    nombre: "codigo_acceso",
    categoria: "AUTHENTICATION",
    uso: "Código de 6 dígitos para entrar a la app de Casa Lotus (lo pide ella misma).",
    // Meta writes the text of authentication templates; this is how it reads in Spanish, for the inbox.
    cuerpo: "Tu código de verificación es *{{codigo}}*. Por tu seguridad, no lo compartas.",
    variables: [v("codigo", "482913", "Código de 6 dígitos")],
    pie: `Este código caduca en ${MINUTOS_CODIGO} minutos.`,
    botones: [{ tipo: "OTP", otp: "COPY_CODE", texto: "Copiar código" }],
  },
].map((p) => Object.freeze({ idioma: IDIOMA, ...p })));

const POR_NOMBRE = new Map(PLANTILLAS.map((p) => [p.nombre, p]));

export function buscarPlantilla(nombre) { return POR_NOMBRE.get(String(nombre ?? "")) || null; }

/** Parameter value as Meta accepts it: one line, no tabs, no runs of 4+ spaces, bounded length. */
function limpiarValor(valor) {
  return String(valor ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Checks and normalizes the variables for a template.
 * Accepts `{ nombre: "Laura", ... }` or an array in catalogue order.
 * Returns { ok: true, valores } or { ok: false, campos: { variable: "mensaje" } }.
 */
export function validarVariables(plantilla, variables) {
  const valores = {};
  const campos = {};
  const lista = Array.isArray(variables) ? variables : null;
  const obj = !lista && variables && typeof variables === "object" ? variables : {};
  plantilla.variables.forEach((def, i) => {
    const bruto = lista ? lista[i] : obj[def.nombre];
    const valor = limpiarValor(bruto);
    if (!valor) campos[def.nombre] = `Falta «${def.descripcion || def.nombre}».`;
    else if (valor.length > 200) campos[def.nombre] = "Máximo 200 caracteres.";
    else valores[def.nombre] = valor;
  });
  if (plantilla.categoria === "AUTHENTICATION" && valores.codigo && !/^[0-9A-Za-z]{4,15}$/.test(valores.codigo)) {
    campos.codigo = "El código debe tener entre 4 y 15 letras o números.";
  }
  return Object.keys(campos).length ? { ok: false, campos } : { ok: true, valores };
}

/** The body with its variables filled in: what the person reads (stored in the inbox). */
export function renderizar(plantilla, valores) {
  return plantilla.cuerpo.replace(/\{\{(\w+)\}\}/g, (_, k) => (valores?.[k] ?? `{{${k}}}`));
}

/** Template body for Meta's create endpoint (POST /<WABA_ID>/message_templates). */
export function aPayloadCreacion(plantilla) {
  if (plantilla.categoria === "AUTHENTICATION") {
    const boton = plantilla.botones.find((b) => b.tipo === "OTP");
    return {
      name: plantilla.nombre,
      language: plantilla.idioma,
      category: "AUTHENTICATION",
      components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: MINUTOS_CODIGO },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: boton?.otp || "COPY_CODE", text: boton?.texto || "Copiar código" }] },
      ],
    };
  }
  const components = [
    {
      type: "BODY",
      text: plantilla.cuerpo,
      example: { body_text_named_params: plantilla.variables.map((x) => ({ param_name: x.nombre, example: x.ejemplo })) },
    },
  ];
  if (plantilla.pie) components.push({ type: "FOOTER", text: plantilla.pie });
  const respuestas = (plantilla.botones || []).filter((b) => b.tipo === "QUICK_REPLY");
  if (respuestas.length) components.push({ type: "BUTTONS", buttons: respuestas.map((b) => ({ type: "QUICK_REPLY", text: b.texto })) });
  return { name: plantilla.nombre, language: plantilla.idioma, category: plantilla.categoria, parameter_format: "NAMED", components };
}

/** `template` object for POST /<PHONE_NUMBER_ID>/messages. `valores` must come from validarVariables. */
export function aPlantillaEnvio(plantilla, valores) {
  const template = { name: plantilla.nombre, language: { code: plantilla.idioma } };
  if (plantilla.categoria === "AUTHENTICATION") {
    // The code goes twice: in the body and as the copy-code button's parameter.
    template.components = [
      { type: "body", parameters: [{ type: "text", text: valores.codigo }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: valores.codigo }] },
    ];
    return template;
  }
  if (plantilla.variables.length) {
    template.components = [
      { type: "body", parameters: plantilla.variables.map((x) => ({ type: "text", parameter_name: x.nombre, text: valores[x.nombre] })) },
    ];
  }
  return template;
}

/** CONTRATO §6 `Plantilla`, merged with what Meta last said about it (cache row or undefined). */
export function aPlantillaContrato(plantilla, cache) {
  const out = {
    nombre: plantilla.nombre,
    categoria: plantilla.categoria,
    idioma: plantilla.idioma,
    cuerpo: plantilla.cuerpo,
    variables: plantilla.variables.map((x) => x.nombre),
    ejemplo: Object.fromEntries(plantilla.variables.map((x) => [x.nombre, x.ejemplo])),
    estadoMeta: cache?.estado || "NO_ENVIADA",
    uso: plantilla.uso,
  };
  if (plantilla.pie) out.pie = plantilla.pie;
  if (plantilla.botones?.length) out.botones = plantilla.botones.map((b) => b.texto);
  if (cache?.motivo) out.motivo = cache.motivo;
  if (cache?.categoria && cache.categoria !== plantilla.categoria) out.categoriaMeta = cache.categoria; // Meta recategorized it
  return out;
}

/** Checks the catalogue against Meta's template rules. Returns a list of problems ([] = fine). */
export function revisarCatalogo(lista = PLANTILLAS) {
  const problemas = [];
  const vistos = new Set();
  for (const p of lista) {
    const donde = p.nombre;
    if (vistos.has(p.nombre)) problemas.push(`${donde}: nombre repetido`);
    vistos.add(p.nombre);
    if (!/^[a-z0-9_]{1,512}$/.test(p.nombre)) problemas.push(`${donde}: el nombre solo admite minúsculas, números y _`);
    if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(p.categoria)) problemas.push(`${donde}: categoría inválida`);
    if (p.categoria === "AUTHENTICATION") continue; // Meta writes the text
    const usados = [...p.cuerpo.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const declarados = p.variables.map((x) => x.nombre);
    for (const u of usados) if (!declarados.includes(u)) problemas.push(`${donde}: {{${u}}} sin declarar`);
    for (const d of declarados) if (!usados.includes(d)) problemas.push(`${donde}: variable ${d} declarada y no usada`);
    for (const d of declarados) if (!/^[a-z][a-z0-9_]*$/.test(d)) problemas.push(`${donde}: variable ${d} con caracteres no permitidos`);
    if (p.cuerpo.length > 1024) problemas.push(`${donde}: el cuerpo pasa de 1024 caracteres`);
    if (/^\s*\{\{/.test(p.cuerpo) || /\}\}\s*$/.test(p.cuerpo)) problemas.push(`${donde}: el cuerpo no puede empezar ni terminar con una variable`);
    if (/\}\}\s*\{\{/.test(p.cuerpo)) problemas.push(`${donde}: dos variables seguidas`);
    if (p.pie && p.pie.length > 60) problemas.push(`${donde}: el pie pasa de 60 caracteres`);
    for (const b of p.botones || []) if (b.texto.length > 25) problemas.push(`${donde}: el botón «${b.texto}» pasa de 25 caracteres`);
    if (/profesora|profesor\b/i.test(p.cuerpo)) problemas.push(`${donde}: usa «profe», sin género`);
  }
  return problemas;
}
