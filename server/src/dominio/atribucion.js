// Casa Lotus · attribution report: which site CTAs and campaigns bring bookings and money.
// Clicks come from the site's beacons (SQLite); bookings and revenue from the Sheet (Origen «Web · REF»,
// «Atribución» JSON, the purchase the booking was charged to).
import * as R from "../../../shared/reglas.js";
import { modelo } from "./base.js";

export async function reporteAtribucion(ctx, { desde, hasta } = {}) {
  const M = await modelo(ctx), hoy = R.hoyClave(ctx.ahora());
  const d = desde || R.sumarDias(hoy, -30), h = hasta || hoy;
  const desdeMs = R.momentoMs(d, "00:00"), hastaMs = R.momentoMs(R.sumarDias(h, 1), "00:00");

  const porRef = new Map(), porCampana = new Map();
  const fila = (mapa, clave, extra = {}) => {
    if (!mapa.has(clave)) mapa.set(clave, { ...extra, clics: 0, reservas: 0, confirmadas: 0, ingresos: 0 });
    return mapa.get(clave);
  };

  for (const x of ctx.db.prepare("SELECT ref, utm_source, utm_medium, utm_campaign, COUNT(*) AS n FROM atribucion WHERE tipo = 'cta' AND ts >= ? AND ts < ? GROUP BY ref, utm_source, utm_medium, utm_campaign")
    .all(desdeMs, hastaMs)) {
    fila(porRef, x.ref || "(sin ref)", { ref: x.ref || "(sin ref)" }).clics += x.n;
    const camp = x.utm_campaign || "(sin campaña)";
    fila(porCampana, camp + "|" + x.utm_source + "|" + x.utm_medium, { campana: camp, source: x.utm_source || "", medium: x.utm_medium || "" }).clics += x.n;
  }

  const contadas = new Set();
  for (const r of M.reservas) {
    if (!/^Web · /.test(r.origen) || !r.creada || r.creada < desdeMs || r.creada >= hastaMs) continue;
    if (r.reagendadaDe) continue; // a moved booking is the same sale
    const ref = r.origen.slice(6) || "(sin ref)";
    const a = r.atribucion || {};
    const camp = a.campaign || "(sin campaña)";
    const filas = [fila(porRef, ref, { ref }), fila(porCampana, camp + "|" + (a.source || "") + "|" + (a.medium || ""), { campana: camp, source: a.source || "", medium: a.medium || "" })];
    // follow the chain to the booking that finally holds the sale
    let final = r;
    for (let i = 0; i < 20; i++) {
      const sig = M.reservas.find((x) => x.reagendadaDe === final.id);
      if (!sig) break;
      final = sig;
    }
    const confirmada = R.CONSUMEN.includes(final.estado);
    let ingreso = 0;
    if (confirmada && final.compra && !contadas.has(final.compra)) {
      contadas.add(final.compra);
      ingreso = Number(M.compraPorId.get(final.compra)?.valor) || 0;
    }
    for (const f of filas) {
      f.reservas++;
      if (confirmada) f.confirmadas++;
      f.ingresos += ingreso;
    }
  }
  const orden = (a, b) => b.ingresos - a.ingresos || b.reservas - a.reservas || b.clics - a.clics;
  return { desde: d, hasta: h, porRef: [...porRef.values()].sort(orden), porCampana: [...porCampana.values()].sort(orden) };
}
