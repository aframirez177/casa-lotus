// Casa Lotus · the clienta's own account (/api/yo). A limited session (opened by a public booking
// with a WhatsApp that was already known) sees only what it typed and the bookings it made.
import * as R from "../../../shared/reglas.js";
import { modelo } from "./base.js";
import { estudio } from "./publico.js";
import { vistaCompra, vistaEspera, vistaReservaClienta, vistaSaldo, perfilDe, fichaDe, MEDIOS_LLAVE } from "./vistas.js";
import { noAutenticado } from "../errores.js";

const fechaDe = (M, r) => M.clasePorId.get(r.clase)?.fecha || String(r.clase).slice(0, 10);

function pagoGeneral(M) {
  return { llave: M.ajustes["Llave de pago"], medios: MEDIOS_LLAVE, whatsapp: M.ajustes["WhatsApp de reservas"] };
}

function separar(M, reservas, ahora, opciones = {}) {
  const hoy = R.hoyClave(ahora);
  const proximas = [], historial = [];
  for (const r of reservas) {
    const c = M.clasePorId.get(r.clase);
    const futura = c ? ahora < R.inicioClase(c) + 3 * 3600000 : fechaDe(M, r) >= hoy;
    if (R.ACTIVAS.includes(r.estado) && futura) proximas.push(r);
    else historial.push(r);
  }
  proximas.sort((a, b) => (a.clase < b.clase ? -1 : 1));
  historial.sort((a, b) => (a.clase < b.clase ? 1 : -1));
  return {
    proximas: proximas.map((r) => vistaReservaClienta(M, r, ahora, opciones)),
    historial: historial.slice(0, 20).map((r) => vistaReservaClienta(M, r, ahora, opciones)),
  };
}

export async function miCuenta(ctx, actor) {
  const M = await modelo(ctx), ahora = ctx.ahora(), hoy = R.hoyClave(ahora);
  const c = M.clientaPorId.get(actor.id);
  if (!c) throw noAutenticado("No encontramos tu ficha. Entra de nuevo.");
  const { politicas } = await estudio(ctx);

  if (actor.limitada) {
    const mias = M.reservasDeClienta(c.id).filter((r) => (actor.reservas || []).includes(r.id));
    const { proximas, historial } = separar(M, mias, ahora, { nombre: actor.nombre, limitada: true });
    return {
      limitada: true,
      clienta: {
        id: c.id,
        perfil: {
          nombre: actor.nombre, whatsapp: actor.whatsapp, correo: "", nacimiento: "", barrio: "", intereses: [], salud: "", eps: "",
          contactoEmergencia: { nombre: "", whatsapp: "" }, experiencia: "", llego: "",
        },
        consentimientos: { datos: { acepta: true, fecha: "", version: "" }, sensibles: { acepta: false, fecha: "", version: "" }, descargo: { acepta: true, fecha: "", version: "" }, imagen: { acepta: null, fecha: "" } },
        fichaCompleta: false,
      },
      saldo: { clases: 0, vence: "", venceTexto: "" }, compras: [], proximas, historial, espera: [], politicas, pago: pagoGeneral(M),
    };
  }

  const { proximas, historial } = separar(M, M.reservasDeClienta(c.id), ahora);
  return {
    limitada: false,
    clienta: { id: c.id, perfil: perfilDe(c), consentimientos: c.consentimientos, fichaCompleta: fichaDe(c) },
    saldo: vistaSaldo(M, c.id, hoy),
    compras: M.comprasDeClienta(c.id).map((p) => vistaCompra(M, p, hoy)).filter((p) => p.estado === "Vigente"),
    proximas, historial,
    espera: M.espera.filter((e) => e.clienta === c.id && (e.estado === "Esperando" || e.estado === "Avisada") && String(e.clase).slice(0, 10) >= hoy).map((e) => vistaEspera(M, e)),
    politicas, pago: pagoGeneral(M),
  };
}

/** The name to show for a clienta session (full: from the Sheet; limited: what she typed). */
export async function nombreDeSesion(ctx, actor) {
  if (actor.limitada) return actor.nombre;
  const M = await modelo(ctx);
  return M.clientaPorId.get(actor.id)?.nombre || actor.nombre || "";
}
