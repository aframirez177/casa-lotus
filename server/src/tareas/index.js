// Casa Lotus · maintenance jobs.
//  - every 10 minutes: unpaid holds whose time ran out become «Vencida» (the swing goes back);
//  - daily at 03:00 Bogotá (and on start if it has not run today): the calendar is generated
//    «Semanas de clases hacia adelante» ahead from Horario, skipping holidays (existing classes are
//    never touched), missing Ajustes rows are added, old rate-limit rows, sessions and codes are purged,
//    Google Ads conversions older than 90 days leave the separate conversions spreadsheet,
//    and the WhatsApp templates are synced when WhatsApp is connected.
import * as R from "../../../shared/reglas.js";
import { expirarApartados } from "../dominio/reservas.js";
import { generarCalendario } from "../dominio/clases.js";
import { asegurarAjustes } from "../dominio/ajustes.js";
import { purgar } from "../auth/limites.js";
import { leerMeta, guardarMeta } from "../db/sqlite.js";

const CADA = 10 * 60000;

export async function tareaFrecuente(ctx) {
  const n = await expirarApartados(ctx);
  if (n) ctx.log.info("apartados vencidos", { n });
  return n;
}

export async function tareaDiaria(ctx) {
  const hoy = R.hoyClave(ctx.ahora());
  await asegurarAjustes(ctx);
  const creadas = await generarCalendario(ctx);
  purgar(ctx);
  const ahora = ctx.ahora();
  ctx.db.prepare("DELETE FROM sesiones WHERE vence < ?").run(ahora);
  ctx.db.prepare("DELETE FROM codigos WHERE vence < ?").run(ahora - 86400000);
  ctx.db.prepare("DELETE FROM tokens WHERE vence < ?").run(ahora - 30 * 86400000);
  try { await ctx.conversiones.podar(); } catch (e) { ctx.log.warn("no se pudieron podar las conversiones", { error: e }); }
  if (ctx.whatsapp?.configurado && typeof ctx.whatsapp.sincronizarPlantillas === "function") {
    try { await ctx.whatsapp.sincronizarPlantillas(); } catch (e) { ctx.log.warn("no se pudieron sincronizar las plantillas", { error: e }); }
  }
  guardarMeta(ctx.db, "diaria", hoy);
  ctx.log.info("tarea diaria", { clasesCreadas: creadas });
  return creadas;
}

function tocaDiaria(ctx) {
  const ahora = ctx.ahora();
  const hecho = leerMeta(ctx.db, "diaria");
  if (hecho === R.hoyClave(ahora)) return false;
  return !hecho || R.ahoraHora(ahora) >= "03:00";
}

export function iniciarTareas(ctx) {
  let corriendo = false;
  const ciclo = async (inicio = false) => {
    if (corriendo) return;
    corriendo = true;
    try {
      if (inicio ? leerMeta(ctx.db, "diaria") !== R.hoyClave(ctx.ahora()) : tocaDiaria(ctx)) await tareaDiaria(ctx);
      await tareaFrecuente(ctx);
    } catch (e) {
      ctx.log.error("tarea de mantenimiento falló", { error: e });
    } finally {
      corriendo = false;
    }
  };
  const primera = setTimeout(() => ciclo(true), 2000);
  const reloj = setInterval(() => ciclo(false), CADA);
  primera.unref?.();
  reloj.unref?.();
  return { detener() { clearTimeout(primera); clearInterval(reloj); } };
}
