// Casa Lotus · bootstrap an admin: prints a one-time setup link (valid 7 days).
//   node scripts/crear-admin.mjs --correo ana@example.com --nombre "Ana Caona"
// In Docker: docker compose exec api node scripts/crear-admin.mjs --correo … --nombre …
import { parseArgs } from "node:util";
import { leerConfig } from "../src/config.js";
import { abrirBase } from "../src/db/sqlite.js";
import { crearLog } from "../src/log.js";
import { crearAdminInicial } from "../src/auth/usuarios.js";

const { values } = parseArgs({ options: { correo: { type: "string" }, nombre: { type: "string" } } });
const correo = String(values.correo || "").trim().toLowerCase();
const nombre = String(values.nombre || "").trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) || nombre.length < 2) {
  process.stderr.write("Uso: node scripts/crear-admin.mjs --correo ana@ejemplo.com --nombre \"Ana Caona\"\n");
  process.exit(1);
}
const config = leerConfig(process.env);
const log = crearLog({ nivel: "warn" });
const db = abrirBase(config.sqlitePath, { log });
const ctx = { config, db, log, ahora: () => Date.now(), enSegundoPlano: () => {} };
const { usuario, invitacion } = crearAdminInicial(ctx, { correo, nombre });
process.stdout.write("\nAdmin: " + usuario.nombre + " <" + usuario.correo + ">\nEnlace para entrar por primera vez (vence " + invitacion.vence + "):\n\n  " + invitacion.enlace + "\n\nÁbrelo una sola vez: ahí puede entrar con Google (con ese mismo correo) o crear una contraseña.\nSi se pierde, vuelve a correr este comando.\n\n");
db.close();
