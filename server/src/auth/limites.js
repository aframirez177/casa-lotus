// Casa Lotus · sliding-window rate limits in SQLite (they survive a restart).
import { limite } from "../errores.js";

/** Counts one attempt for `clave`; throws «limite» when `max` attempts already happened in the window. */
export function consumir(ctx, clave, max, ventanaMs, mensaje) {
  const ahora = ctx.ahora();
  const n = ctx.db.prepare("SELECT COUNT(*) AS n FROM limites WHERE clave = ? AND ts > ?").get(clave, ahora - ventanaMs).n;
  if (n >= max) throw limite(mensaje);
  ctx.db.prepare("INSERT INTO limites (clave, ts) VALUES (?, ?)").run(clave, ahora);
}

export function limpiar(ctx, clave) {
  ctx.db.prepare("DELETE FROM limites WHERE clave = ?").run(clave);
}

/** Housekeeping: forget attempts older than a day. */
export function purgar(ctx) {
  ctx.db.prepare("DELETE FROM limites WHERE ts < ?").run(ctx.ahora() - 86400000);
}

export const MINUTO = 60000;
export const HORA = 3600000;
