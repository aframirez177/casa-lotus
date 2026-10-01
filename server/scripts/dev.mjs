// Casa Lotus · local studio: memory driver (a believable fake studio), port 8787, CORS for the app (5180)
// and the site (4321), console e-mail. Every restart starts a fresh studio Sheet; accounts and sessions
// live in ./data/dev.db (gitignored), so a code change does not log anyone out.
process.env.NODE_ENV ||= "development";
process.env.PORT ||= "8787";
process.env.DATOS ||= "memoria";
// SQLite persists in dev (sessions and staff survive a --watch restart); the Sheet stays a fresh fake studio
process.env.SQLITE_PATH ||= "./data/dev.db";
process.env.PUBLIC_URL ||= "http://localhost:5180";
process.env.CORREO_DRIVER ||= "console";
process.env.LOG_LEVEL ||= "info";

const { iniciar } = await import("../src/index.js");
const { CUENTAS_DEV } = await import("../src/datos/semilla.js");
const { config } = await iniciar();
const linea = "─".repeat(64);
process.stdout.write([
  "", linea,
  " Casa Lotus API (desarrollo) → http://localhost:" + config.puerto + "/api",
  " Datos: estudio de mentiras en memoria (se reinicia con cada arranque); sesiones en ./data/dev.db",
  " Cuentas de desarrollo (solo en este modo):",
  ...CUENTAS_DEV.map((c) => "   " + c.rol.padEnd(6) + c.correo.padEnd(26) + c.password),
  " Clientas: entra con el código; llega por «correo» en esta consola.",
  linea, "",
].join("\n") + "\n");
