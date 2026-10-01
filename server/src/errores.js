// Casa Lotus · errors that travel to the client as CONTRATO §4:
// { ok: false, error: "<codigo>", mensaje: "<texto>", campos?, motivo? }.
// Anything else that is thrown becomes a generic 500 with no details.

const ESTADOS = {
  "no-autenticado": 401,
  "sin-permiso": 403,
  "no-existe": 404,
  validacion: 422,
  conflicto: 409,
  limite: 429,
  servidor: 500,
  "no-configurado": 503,
};

export class ErrorApp extends Error {
  constructor(codigo, mensaje, extra = {}) {
    super(mensaje);
    this.codigo = codigo;
    this.status = extra.status || ESTADOS[codigo] || 500;
    this.campos = extra.campos;
    this.motivo = extra.motivo;
  }
  cuerpo() {
    const o = { ok: false, error: this.codigo, mensaje: this.message };
    if (this.motivo) o.motivo = this.motivo;
    if (this.campos) o.campos = this.campos;
    return o;
  }
}

export const noAutenticado = (m = "Necesitas entrar de nuevo.") => new ErrorApp("no-autenticado", m);
export const sinPermiso = (m = "No tienes permiso para hacer esto.") => new ErrorApp("sin-permiso", m);
export const noExiste = (m = "No lo encontramos.") => new ErrorApp("no-existe", m);
export const validacion = (m, campos) => new ErrorApp("validacion", m || "Revisa los datos.", { campos });
export const conflicto = (motivo, m) => new ErrorApp("conflicto", m, { motivo });
export const limite = (m = "Demasiados intentos. Espera un momento y vuelve a intentarlo.") => new ErrorApp("limite", m);
export const noConfigurado = (m = "Esto todavía no está conectado.") => new ErrorApp("no-configurado", m);

/** Spanish message for a booking conflict motive. */
export const MENSAJES_CONFLICTO = {
  llena: "Esa clase ya está llena. Puedes anotarte en la lista de espera.",
  tarde: "Ya pasó la hora límite para hacer este cambio.",
  cancelada: "Esa clase fue cancelada.",
  "ya-reservada": "Ya tienes un cupo en esa clase.",
  "muchas-pendientes": "Ya tienes dos reservas esperando el pago. Envía el comprobante de una antes de apartar otra.",
  cambios: "Esta reserva ya usó los cambios permitidos.",
  empezo: "Esa clase ya empezó.",
  estado: "Esta reserva ya no se puede cambiar.",
};

export const conflictoReserva = (motivo, m) => conflicto(motivo, m || MENSAJES_CONFLICTO[motivo] || "No se pudo hacer el cambio.");
