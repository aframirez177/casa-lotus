// Plain-words policy copy for a booking: what happens if she cancels or reschedules now.
// Reads the server's ReservaClienta (puedeCancelar, cancelarSinCosto, limiteCancelar…) and re-checks
// the limit against the clock, so a sheet left open past the limit tells the truth.
import { ESTADO, inicioClase, horaLegible, partesBogota } from "./reglas.js";
import { faltaTexto, diaRelativo } from "./fechas.js";

/** Ends a sentence without doubling the period of «a. m.» / «p. m.». */
const punto = (texto) => (texto.endsWith(".") ? texto : texto + ".");

/** «el sábado 3 de octubre a las 2:00 a. m.» / «hoy a las 3:00 p. m.» */
export function cuandoTexto(ms) {
  const { fecha, hora } = partesBogota(ms);
  const dia = diaRelativo(fecha);
  const pre = dia === "hoy" || dia === "mañana" || dia === "ayer" ? dia : "el " + dia;
  return `${pre} a las ${horaLegible(hora)}`;
}

/**
 * Cancellation copy. Returns { puede, sinCosto, tono: "ok"|"aviso"|"no", titulo, detalle, boton }.
 * `reserva` = ReservaClienta from the API.
 */
export function politicaCancelarTexto(reserva, ahora = Date.now()) {
  const inicio = inicioClase(reserva.clase);
  const falta = faltaTexto(inicio, ahora);
  if (ahora >= inicio) return { puede: false, sinCosto: false, tono: "no", titulo: "La clase ya empezó", detalle: "Ya no se puede cancelar. Si pasó algo, escríbele a Ana.", boton: null };
  if (!reserva.puedeCancelar) return { puede: false, sinCosto: false, tono: "no", titulo: "Ya no se puede cancelar", detalle: "Esta reserva cambió de estado. Si tienes dudas, escríbele a Ana.", boton: null };
  if (reserva.estado === ESTADO.PENDIENTE) {
    return { puede: true, sinCosto: true, tono: "ok", titulo: `${falta} para tu clase`, detalle: "Todavía no la has pagado: si cancelas, tu columpio queda libre y no pagas nada.", boton: "Sí, cancelar" };
  }
  const limite = reserva.limiteCancelar ? Date.parse(reserva.limiteCancelar) : NaN;
  const sinCosto = Number.isFinite(limite) ? ahora <= limite : Boolean(reserva.cancelarSinCosto);
  if (sinCosto) {
    return {
      puede: true, sinCosto: true, tono: "ok",
      titulo: `${falta}: si cancelas, la clase vuelve a tu plan.`,
      detalle: Number.isFinite(limite) ? punto(`Puedes cancelar sin costo hasta ${cuandoTexto(limite)}`) : "",
      boton: "Sí, cancelar",
    };
  }
  return {
    puede: true, sinCosto: false, tono: "aviso",
    titulo: `${falta}: si cancelas, se descuenta de tu plan y tu columpio queda libre para alguien en lista de espera.`,
    detalle: "Avisar igual ayuda: alguien más puede tomar tu lugar.",
    boton: "Cancelar igual",
  };
}

/** Reschedule copy. Returns { puede, titulo, detalle }. */
export function politicaReagendarTexto(reserva, ahora = Date.now()) {
  const limite = reserva.limiteReagendar ? Date.parse(reserva.limiteReagendar) : NaN;
  const aTiempo = Number.isFinite(limite) ? ahora <= limite : true;
  if (!reserva.puedeReagendar || !aTiempo) {
    const tarde = Number.isFinite(limite) && ahora > limite;
    return {
      puede: false,
      titulo: tarde ? "Ya no se puede cambiar" : "Esta reserva ya no admite cambios",
      detalle: tarde ? "Los cambios se hacen con tiempo, para que el columpio le sirva a alguien más." : esPrueba(reserva) ? "La clase de prueba se puede cambiar una sola vez." : "",
    };
  }
  return {
    puede: true,
    titulo: "Elige tu nueva clase",
    detalle: Number.isFinite(limite) ? punto(`Puedes cambiarla hasta ${cuandoTexto(limite)}`) + (esPrueba(reserva) ? " La clase de prueba se cambia una sola vez." : "") : "",
  };
}

export const esPrueba = (r) => /prueba/i.test(r?.plan || "");
