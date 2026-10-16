// Casa Lotus · the team view and the platform's health.
import * as R from "../../../shared/reglas.js";
import { modelo } from "./base.js";
import { listarUsuarios } from "../auth/usuarios.js";
import { dictada, profeDeClase } from "./profes.js";
import { PESTANAS_OPCIONALES } from "../datos/esquema.js";

export async function equipo(ctx) {
  const M = await modelo(ctx), ahora = ctx.ahora(), mes = R.hoyClave(ahora).slice(0, 7);
  const pago = M.ajustes["Pago por clase a profes"];
  const delMes = M.clases.filter((c) => c.fecha.startsWith(mes) && dictada(M, c, ahora));
  return listarUsuarios(ctx).map((u) => {
    const clasesMes = u.nombreHorario ? delMes.filter((c) => profeDeClase({ nombreHorario: u.nombreHorario }, c)).length : 0;
    return { ...u, clasesMes, pagoMes: pago ? clasesMes * pago : null };
  });
}

export async function salud(ctx) {
  const d = await ctx.datos.describir();
  const faltan = d.faltan || [];
  // «Cupos fijos» may be missing: the server creates it with the first fijo
  let fijos = { pestana: !faltan.includes("Cupos fijos"), activos: 0 };
  try {
    const M = await modelo(ctx);
    fijos = { pestana: M.tienePestana("Cupos fijos"), activos: M.fijos.filter((f) => f.estado === "Activo").length };
  } catch { /* the Sheet is reported below */ }
  let conversiones = { destino: "ninguno", ok: false };
  try { conversiones = await ctx.conversiones.describir(); } catch { /* reported as not ok */ }
  let whatsapp = { conectado: false, modo: "desconectado" };
  try { whatsapp = (await ctx.whatsapp.estado()) || whatsapp; } catch { /* reported as disconnected */ }
  return {
    datos: ctx.datos.tipo,
    hoja: {
      ok: Boolean(d.ok) && !faltan.some((f) => !PESTANAS_OPCIONALES.has(f.split(".")[0])),
      faltan, ...(d.zona ? { zona: d.zona } : {}), ...(d.error ? { error: d.error } : {}),
      ...(d.zona && d.zona !== R.ZONA ? { aviso: "La hoja debe estar en la zona horaria America/Bogota." } : {}),
    },
    fijos: { ...fijos, ...(fijos.pestana ? {} : { aviso: "La pestaña «Cupos fijos» se crea sola con el primer cupo fijo." }) },
    whatsapp,
    conversiones: { ...conversiones, sheetId: ctx.config.conversiones.sheetId || "" },
    correo: { driver: ctx.correo.driver, remitente: ctx.correo.remitente, ok: Boolean(ctx.correo.activo) },
    google: { activo: Boolean(ctx.google) },
    push: { activo: ctx.push.activo, clavePublica: ctx.push.clavePublica || "", suscripciones: ctx.push.total() },
    version: ctx.config.version,
  };
}
