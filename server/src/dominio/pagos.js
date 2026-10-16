// Casa Lotus · payments (Compras) and plans. A payment is one row in Compras; the balance it gives is
// computed from the bookings that spend it, never typed.
import * as R from "../../../shared/reglas.js";
import { modelo, transaccion } from "./base.js";
import { vistaCompra, vistaPlan, vistaSaldo, vistaReservaClienta, fijoDeReserva, esPasada, NOTA_FIJO_SIN_PLAN } from "./vistas.js";
import { filaConversion } from "../datos/conversiones.js";
import { noExiste, validacion } from "../errores.js";

/** Writes a payment inside a transaction. Returns the purchase as the model sees it. */
export async function registrarPagoEnTx(tx, { clienta, plan, medio, valor, inicio, clases }) {
  const M = tx.M;
  const p = M.planPorNombre.get(plan);
  if (!p) throw validacion("Ese plan no existe.", { plan: "Elige un plan de la lista." });
  const n = p.clases || Number(clases) || 0;
  if (!n) throw validacion("Ese plan no trae clases: escribe cuántas clases le quedan.", { clases: "Escribe cuántas clases son." });
  const hoy = R.hoyClave(tx.ahora);
  const id = R.siguienteId("P", M.compras.map((c) => c.id));
  await tx.agregar("Compras", {
    "ID": id, "Fecha": hoy, "Clienta": clienta, "Plan": p.nombre, "Clases": n, "Valor": valor ?? p.precio, "Medio de pago": medio || "",
    "Inicio": inicio || hoy,
  });
  const compra = tx.M.compraPorId.get(id);
  // an ad-attributed sale becomes a Google Ads conversion (outside the lock; never fails the payment)
  const conversion = filaConversion(tx.M, compra, tx.ahora);
  if (conversion) {
    tx.auditar("ads.conversion", compra.id, { nombre: conversion["Conversion Name"], valor: conversion["Conversion Value"] });
    tx.despues(() => tx.ctx.conversiones.registrar(conversion));
  }
  return compra;
}

/**
 * After a payment: her cupo fijo holds still waiting for a plan («Pendiente de pago» made by a fijo, class not
 * started) are confirmed against the plan that covers each date, oldest class first, while classes last. No
 * e-mail for these (the payment itself is the news). Returns the ids it confirmed.
 */
export async function confirmarFijosPendientesEnTx(tx, clienta, { excepto } = {}) {
  const pendientes = tx.M.reservasDeClienta(clienta)
    .filter((r) => r.estado === R.ESTADO.PENDIENTE && r.id !== excepto && fijoDeReserva(r))
    .map((r) => ({ r, c: tx.M.clasePorId.get(r.clase) }))
    .filter(({ c }) => c && c.estado === "Programada" && !esPasada(c, tx.ahora))
    .sort((a, b) => (a.c.id < b.c.id ? -1 : 1));
  const hechas = [];
  for (const { r, c } of pendientes) {
    const M = tx.M;
    const compra = R.elegirCompra(M.compras, M.reservas, clienta, c.fecha);
    if (!compra) continue;
    await tx.actualizar("Reservas", r._fila, {
      "Estado": R.ESTADO.CONFIRMADA, "Compra": compra.id, "Vence apartado": "", ...(r.notas === NOTA_FIJO_SIN_PLAN ? { "Notas": "" } : {}),
    });
    tx.auditar("reserva.confirmar", r.id, { compra: compra.id, fijo: fijoDeReserva(r) });
    hechas.push(r.id);
  }
  return hechas;
}

export async function registrarPago(ctx, actor, input) {
  return transaccion(ctx, actor, async (tx) => {
    const c = tx.M.clientaPorId.get(input.clienta);
    if (!c) throw noExiste("No encontramos a esa clienta.");
    const compra = await registrarPagoEnTx(tx, input);
    const hoy = R.hoyClave(tx.ahora);
    tx.auditar("pago.registrar", compra.id, { clienta: c.id, plan: compra.plan, valor: compra.valor, medio: compra.medio });
    const confirmadas = await confirmarFijosPendientesEnTx(tx, c.id);
    tx.publicar({
      tipo: "pago", titulo: "Pago de " + c.nombre, clienta: c.id,
      detalle: compra.plan + " · " + R.dinero(compra.valor) + (compra.medio ? " · " + compra.medio : "") +
        (confirmadas.length ? " · " + (confirmadas.length === 1 ? "1 clase fija confirmada" : confirmadas.length + " clases fijas confirmadas") : ""),
    });
    const M = tx.M;
    return {
      compra: vistaCompra(M, M.compraPorId.get(compra.id), hoy), saldo: vistaSaldo(M, c.id, hoy),
      reservasConfirmadas: confirmadas.map((id) => vistaReservaClienta(M, M.reservaPorId.get(id), tx.ahora)),
    };
  });
}

export async function pagosDelMes(ctx, mes) {
  const M = await modelo(ctx);
  const hoy = R.hoyClave(ctx.ahora());
  const m = mes || hoy.slice(0, 7);
  const delMes = M.compras.filter((c) => c.fecha.startsWith(m)).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const porMedio = {}, porPlan = {};
  let total = 0;
  for (const c of delMes) {
    const v = Number(c.valor) || 0;
    total += v;
    porMedio[c.medio || "Sin medio"] = (porMedio[c.medio || "Sin medio"] || 0) + v;
    porPlan[c.plan || "Sin plan"] = (porPlan[c.plan || "Sin plan"] || 0) + v;
  }
  return { mes: m, total, porMedio, porPlan, compras: delMes.map((c) => vistaCompra(M, c, hoy)) };
}

export async function planes(ctx, { soloActivos = false } = {}) {
  const M = await modelo(ctx);
  return M.planes.filter((p) => !soloActivos || p.activo).map(vistaPlan);
}

/** Admin: change a plan's price, classes, validity or availability; a new name creates it. */
export async function editarPlan(ctx, actor, input) {
  return transaccion(ctx, actor, async (tx) => {
    const p = tx.M.planPorNombre.get(input.nombre);
    if (!p) {
      if (input.precio === undefined || input.clases === undefined || !input.tipo) {
        throw validacion("Para crear un plan escribe sus clases, precio y tipo.", { tipo: "Elige el tipo de plan." });
      }
      await tx.agregar("Planes", {
        "Plan": input.nombre, "Clases": input.clases, "Precio": input.precio, "Vigencia (días)": input.vigencia || 30, "Tipo": input.tipo,
        "Activo": input.activo === false ? "No" : "Sí",
      });
      tx.auditar("plan.crear", input.nombre, { precio: input.precio, clases: input.clases });
    } else {
      const cambios = {};
      if (input.precio !== undefined) cambios["Precio"] = input.precio;
      if (input.clases !== undefined) cambios["Clases"] = input.clases;
      if (input.vigencia !== undefined) cambios["Vigencia (días)"] = input.vigencia;
      if (input.tipo !== undefined) cambios["Tipo"] = input.tipo;
      if (input.activo !== undefined) cambios["Activo"] = input.activo ? "Sí" : "No";
      if (Object.keys(cambios).length) await tx.actualizar("Planes", p._fila, cambios);
      tx.auditar("plan.editar", p.nombre, cambios);
    }
    return tx.M.planes.map(vistaPlan);
  });
}
