// Casa Lotus · SQLite through Node's built-in node:sqlite (no native modules).
// Migrations are the ordered .sql files in ../../migraciones, applied once each at start.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migraciones");

export function abrirBase(ruta = ":memory:", { log } = {}) {
  if (ruta !== ":memory:") mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec("PRAGMA foreign_keys = ON;");
  if (ruta !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
  }
  migrar(db, log);
  return db;
}

export function migrar(db, log) {
  db.exec("CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada INTEGER NOT NULL)");
  const hechas = new Set(db.prepare("SELECT nombre FROM migraciones").all().map((r) => r.nombre));
  const archivos = readdirSync(CARPETA).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  for (const f of archivos) {
    if (hechas.has(f)) continue;
    const sql = readFileSync(join(CARPETA, f), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO migraciones (nombre, aplicada) VALUES (?, ?)").run(f, Date.now());
      db.exec("COMMIT");
      log?.info("migración aplicada", { archivo: f });
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error("Falló la migración " + f + ": " + e.message);
    }
  }
}

/** Runs fn inside a transaction. */
export function transaccion(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function leerMeta(db, clave) {
  return db.prepare("SELECT valor FROM meta WHERE clave = ?").get(clave)?.valor ?? null;
}

export function guardarMeta(db, clave, valor) {
  db.prepare("INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor").run(clave, String(valor));
}
