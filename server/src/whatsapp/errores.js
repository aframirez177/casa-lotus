// Errors the module throws, shaped for CONTRATO §4 ({ ok:false, error, mensaje }), plus the map
// from Meta's error codes to a sentence Ana can act on. Meta codes: see the Cloud API
// «Error codes» reference (docs/whatsapp/guia-whatsapp-cloud-api.md §8 links it).

export class WhatsAppError extends Error {
  /**
   * @param {string} codigo   CONTRATO §4 code: validacion | no-existe | conflicto | no-configurado | limite | servidor
   * @param {string} mensaje  Spanish, shown to Ana as is
   * @param {object} [extra]  { status, motivo, meta: { codigo, subcodigo, traza }, campos, reintentable }
   */
  constructor(codigo, mensaje, extra = {}) {
    super(mensaje);
    this.name = "WhatsAppError";
    this.codigo = codigo;
    this.status = extra.status ?? STATUS[codigo] ?? 500;
    if (extra.motivo) this.motivo = extra.motivo;
    if (extra.campos) this.campos = extra.campos;
    if (extra.meta) this.meta = extra.meta;
    this.reintentable = Boolean(extra.reintentable);
  }

  /** JSON body for the HTTP response. */
  cuerpo() {
    const c = { ok: false, error: this.codigo, mensaje: this.message };
    if (this.motivo) c.motivo = this.motivo;
    if (this.campos) c.campos = this.campos;
    if (this.meta?.codigo) c.meta = { codigo: this.meta.codigo };
    return c;
  }
}

const STATUS = { validacion: 422, "no-existe": 404, conflicto: 409, "no-configurado": 503, limite: 429, servidor: 502, "sin-permiso": 403 };

export const noConfigurado = () =>
  new WhatsAppError("no-configurado", "WhatsApp todavía no está conectado. Mientras tanto, escríbele desde el celular del estudio.");

export const validacion = (mensaje, campos) => new WhatsAppError("validacion", mensaje, { campos });

// Meta code → [message for Ana, retry makes sense]. Unknown codes fall back to a generic sentence.
const META = {
  0: ["WhatsApp rechazó la conexión (token). Hay que revisar la configuración.", false],
  1: ["WhatsApp tuvo un error interno. Intenta de nuevo en un momento.", true],
  2: ["WhatsApp no está disponible en este momento. Intenta de nuevo en unos minutos.", true],
  4: ["Se enviaron demasiados mensajes en poco tiempo. Espera unos minutos.", true],
  10: ["La app de WhatsApp no tiene permiso para esto. Hay que revisar los permisos del token.", false],
  100: ["WhatsApp no entendió el mensaje (parámetro inválido). Revisa el texto o la plantilla.", false],
  190: ["El token de WhatsApp venció o fue revocado. Hay que generar uno nuevo.", false],
  200: ["La app de WhatsApp no tiene permiso para esto. Hay que revisar los permisos del token.", false],
  368: ["Meta bloqueó temporalmente el número por sus políticas. Revisa el WhatsApp Manager.", false],
  80007: ["Se alcanzó el límite de uso de la cuenta de WhatsApp. Espera un rato.", true],
  130429: ["Se enviaron demasiados mensajes por segundo. Intenta de nuevo en un momento.", true],
  130472: ["WhatsApp no entregó el mensaje a este número por un experimento de Meta.", false],
  130497: ["Este negocio no puede enviar mensajes a números de este país.", false],
  131000: ["WhatsApp tuvo un error inesperado. Intenta de nuevo.", true],
  131005: ["El token no tiene permiso para enviar. Hay que revisar el usuario del sistema.", false],
  131008: ["Al mensaje le falta un dato obligatorio.", false],
  131009: ["Uno de los datos del mensaje no es válido.", false],
  131016: ["WhatsApp está sobrecargado. Intenta de nuevo en unos minutos.", true],
  131021: ["No puedes enviarte mensajes al mismo número del estudio.", false],
  131026: ["No se pudo entregar: puede que el número no tenga WhatsApp o que deba actualizar la app.", false],
  131030: ["En modo de prueba solo se puede escribir a los números autorizados en Meta. Agrega este número a la lista.", false],
  131031: ["La cuenta de WhatsApp del estudio está bloqueada. Revisa el WhatsApp Manager.", false],
  131037: ["El número todavía no tiene un nombre visible aprobado.", false],
  131042: ["Hay un problema con el método de pago de WhatsApp. Revisa la facturación en Meta.", false],
  131045: ["El número no está bien registrado en WhatsApp Cloud API.", false],
  131047: ["Pasaron más de 24 horas desde su último mensaje. Solo se le puede escribir con una plantilla aprobada.", false],
  131048: ["WhatsApp frenó los envíos porque muchas personas reportaron o bloquearon mensajes. Espera y revisa la calidad.", false],
  131049: ["WhatsApp decidió no entregar este mensaje para cuidar la experiencia de la persona. No reintentes enseguida.", false],
  131050: ["Esta persona pidió no recibir mensajes de marketing del estudio.", false],
  131051: ["Este tipo de mensaje no es compatible.", false],
  131052: ["No se pudo descargar el archivo que envió la persona.", false],
  131053: ["No se pudo subir el archivo.", false],
  131056: ["Le enviaste demasiados mensajes seguidos a esta persona. Espera un momento.", true],
  131057: ["La cuenta de WhatsApp está en mantenimiento. Intenta más tarde.", true],
  132000: ["La plantilla no recibió el número correcto de datos.", false],
  132001: ["La plantilla no existe o todavía no está aprobada en este idioma.", false],
  132005: ["El texto de la plantilla quedó demasiado largo con estos datos.", false],
  132007: ["Los datos de la plantilla no cumplen las políticas de WhatsApp.", false],
  132012: ["Los datos de la plantilla no tienen el formato esperado.", false],
  132015: ["La plantilla está en pausa por baja calidad. Revisa el WhatsApp Manager.", false],
  132016: ["La plantilla fue desactivada por baja calidad. Hay que crear otra.", false],
  133010: ["El número del estudio no está registrado en WhatsApp Cloud API.", false],
  135000: ["WhatsApp tuvo un error genérico. Intenta de nuevo.", true],
};

/** Spanish sentence + retry hint for a Meta error object ({ code, error_subcode, message, error_data }). */
export function explicarErrorMeta(error) {
  const codigo = Number(error?.code);
  const [mensaje, reintentable] = META[codigo] || [`WhatsApp no aceptó el mensaje (código ${Number.isFinite(codigo) ? codigo : "desconocido"}).`, false];
  return { codigo: Number.isFinite(codigo) ? codigo : null, mensaje, reintentable };
}

/** Builds the error thrown when the Graph API answers with a failure. */
export function errorDeMeta(error, httpStatus) {
  const { codigo, mensaje, reintentable } = explicarErrorMeta(error);
  const codigoContrato = httpStatus === 429 || codigo === 4 || codigo === 80007 || codigo === 130429 || codigo === 131056 ? "limite" : "servidor";
  return new WhatsAppError(codigoContrato, mensaje, {
    status: codigoContrato === "limite" ? 429 : 502,
    reintentable: reintentable || httpStatus === 429 || httpStatus >= 500,
    meta: { codigo, subcodigo: error?.error_subcode ?? null, traza: error?.fbtrace_id ?? null, detalle: String(error?.error_data?.details ?? error?.message ?? "").slice(0, 300) },
  });
}
