// Casa Lotus · the profe registers who ACTUALLY came: someone who showed up without a booking
// (walk-in), and closing the roster (whoever is still «Confirmada» did not come).
import * as R from "../../../shared/reglas.js";
import { modelo, transaccion } from "./base.js";
import { sinTilde } from "../datos/modelo.js";
import { vistaClaseEquipo, fichaDe } from "./vistas.js";
import { profeDeClase, exigirPlazoAsistencia } from "./profes.js";
import { conflicto, conflictoReserva, noExiste, sinPermiso, validacion } from "../errores.js";

export const NOTA_SIN_PLAN = "Vino sin plan";
const { ESTADO } = R;

function exigirSuya(actor, c) {
  if (actor.tipo === "profe" && !profeDeClase(actor, c)) throw sinPermiso("Esa clase no es tuya.");
}

/**
 * GET /api/profe/clientas?q=: names to find a walk-in. No phones, no health, no balances; at most 10.
 * Searches names only, so a phone number cannot be used to find out who is a clienta.
 */
export async function buscarParaProfe(ctx, q) {
  const t = sinTilde(q);
  if (t.length < 2) throw validacion("Escribe al menos 2 letras.", { q: "Escribe al menos 2 letras." });
  const M = await modelo(ctx);
  const palabras = t.split(/\s+/).filter(Boolean);
  return M.clientas
    .filter((c) => { const n = sinTilde(c.nombre); return palabras.every((p) => n.includes(p)); })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 10)
    .map((c) => ({
      id: c.id, nombre: c.nombre, fichaCompleta: fichaDe(c),
      primeraVez: !M.reservasDeClienta(c.id).some((r) => r.estado === ESTADO.ASISTIO),
    }));
}

/**
 * POST /api/profe/clases/:id/asistentes { clienta }: she came without a booking. Charged to her valid plan
 * («Asistió»); without classes left it stays «Pendiente de pago» («Vino sin plan») and Ana is alerted.
 * A full class refuses a walk-in unless an admin registers it.
 */
export async function registrarAsistente(ctx, actor, idClase, idClienta) {
  return transaccion(ctx, actor, async (tx) => {
    const M = tx.M;
    const c = M.clasePorId.get(idClase);
    if (!c) throw noExiste("Esa clase no existe.");
    exigirSuya(actor, c);
    if (c.estado === "Cancelada") throw conflictoReserva("cancelada");
    exigirPlazoAsistencia(actor, c, tx.ahora);
    const p = M.clientaPorId.get(idClienta);
    if (!p) throw noExiste("No encontramos a esa clienta.");
    if (M.reservasDeClase(c.id).some((r) => r.clienta === p.id && R.OCUPAN.includes(r.estado))) {
      throw conflictoReserva("ya-reservada", "Ya está en la lista de esta clase: márcala como que vino.");
    }
    if (actor.tipo !== "admin" && M.ocupados(c.id) >= c.cupos) {
      throw conflictoReserva("llena", "La clase está llena. Pídele a Ana que la agregue.");
    }
    const compra = R.elegirCompra(M.compras, M.reservas, p.id, c.fecha);
    const id = R.siguienteId("R", M.reservas.map((r) => r.id));
    await tx.agregar("Reservas", {
      "ID": id, "Creada": tx.ahora, "Clase": c.id, "Clienta": p.id, "Origen": "Profe · " + (actor.nombre || "equipo"),
      "Estado": compra ? ESTADO.ASISTIO : ESTADO.PENDIENTE, "Compra": compra ? compra.id : "", "Notas": compra ? "" : NOTA_SIN_PLAN,
    });
    tx.auditar("asistencia.sin-reserva", id, { clase: c.id, clienta: p.id, sinPlan: !compra });
    const cuando = R.fechaCorta(c.fecha) + " · " + R.horaLegible(c.hora);
    tx.publicar(compra
      ? { tipo: "asistencia", titulo: "Vino sin reserva: " + p.nombre, detalle: cuando + " · la registró " + (actor.nombre || "la profe"), clienta: p.id, clase: c.id }
      : {
        tipo: "asistencia", titulo: "Vino sin plan: " + p.nombre, detalle: cuando + " · no le quedan clases: falta cobrarle.", clienta: p.id, clase: c.id,
        ruta: "/app/admin/clientas/" + p.id, push: true,
      });
    return { clase: vistaClaseEquipo(tx.M, c, tx.ahora, { actor }), reserva: { id, clienta: p.id, estado: compra ? ESTADO.ASISTIO : ESTADO.PENDIENTE }, sinPlan: !compra };
  });
}

/** POST /api/profe/clases/:id/cerrar: whoever is still «Confirmada» did not come. Only once the class started. */
export async function cerrarLista(ctx, actor, idClase) {
  return transaccion(ctx, actor, async (tx) => {
    const c = tx.M.clasePorId.get(idClase);
    if (!c) throw noExiste("Esa clase no existe.");
    exigirSuya(actor, c);
    if (tx.ahora < R.inicioClase(c)) throw conflicto("no-ha-empezado", "Puedes cerrar la lista cuando empiece la clase.");
    exigirPlazoAsistencia(actor, c, tx.ahora);
    const quedan = tx.M.reservasDeClase(c.id).filter((r) => r.estado === ESTADO.CONFIRMADA);
    for (const r of quedan) await tx.actualizar("Reservas", r._fila, { "Estado": ESTADO.NO_VINO });
    tx.auditar("asistencia.cerrar", c.id, { noVinieron: quedan.map((r) => r.id) });
    return { ...vistaClaseEquipo(tx.M, tx.M.clasePorId.get(c.id), tx.ahora, { actor }), marcadas: quedan.length };
  });
}
