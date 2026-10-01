// SQLite storage for the WhatsApp inbox (node:sqlite DatabaseSync, shared with the server).
// Every table is prefixed `wa_` so it can live next to the server's own tables.
// Media: only Meta's media id and mime type are kept; files are never downloaded to disk.
// Idempotency: inbound messages are unique on Meta's message id (wamid), status events on
// (wamid, status), so Meta's at-least-once webhook delivery never duplicates anything.

import { randomBytes } from "node:crypto";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS wa_conversaciones (
  id TEXT PRIMARY KEY,
  whatsapp TEXT UNIQUE,              -- digits with country code; NULL for a username-only contact
  usuario_id TEXT UNIQUE,            -- Meta business-scoped user id (BSUID), when the webhook carries it
  usuario TEXT,                      -- WhatsApp username, when she has one
  nombre TEXT NOT NULL DEFAULT '',
  perfil TEXT NOT NULL DEFAULT '',
  clienta TEXT,
  clienta_nombre TEXT,
  clienta_etapa TEXT,
  vincular INTEGER NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  etiquetas TEXT NOT NULL DEFAULT '[]',
  no_leidos INTEGER NOT NULL DEFAULT 0,
  ventana_desde_ms INTEGER,
  ultimo_texto TEXT NOT NULL DEFAULT '',
  ultimo_ts TEXT,
  ultima_direccion TEXT,
  creada TEXT NOT NULL,
  actualizada TEXT NOT NULL,
  CHECK (whatsapp IS NOT NULL OR usuario_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS wa_conversaciones_ultimo ON wa_conversaciones (ultimo_ts);
CREATE INDEX IF NOT EXISTS wa_conversaciones_clienta ON wa_conversaciones (clienta);

CREATE TABLE IF NOT EXISTS wa_mensajes (
  id TEXT PRIMARY KEY,
  meta_id TEXT UNIQUE,
  conversacion TEXT NOT NULL REFERENCES wa_conversaciones (id),
  direccion TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  tipo TEXT NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  plantilla TEXT,
  variables TEXT,
  media TEXT,
  datos TEXT,
  responde_a TEXT,
  estado TEXT NOT NULL,
  error TEXT,
  error_codigo INTEGER,
  ts TEXT NOT NULL,
  autor_tipo TEXT NOT NULL,
  autor_nombre TEXT NOT NULL DEFAULT '',
  autor_id TEXT,
  creado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_mensajes_conversacion ON wa_mensajes (conversacion, ts);

CREATE TABLE IF NOT EXISTS wa_estados (
  meta_id TEXT NOT NULL,
  estado TEXT NOT NULL,
  ts TEXT NOT NULL,
  destinatario TEXT,
  error_codigo INTEGER,
  error TEXT,
  categoria TEXT,
  cobrable INTEGER,
  tipo_precio TEXT,
  recibido TEXT NOT NULL,
  PRIMARY KEY (meta_id, estado)
);
CREATE INDEX IF NOT EXISTS wa_estados_ts ON wa_estados (ts);

CREATE TABLE IF NOT EXISTS wa_plantillas (
  nombre TEXT NOT NULL,
  idioma TEXT NOT NULL,
  meta_id TEXT,
  estado TEXT NOT NULL,
  categoria TEXT,
  motivo TEXT,
  actualizada TEXT NOT NULL,
  PRIMARY KEY (nombre, idioma)
);

CREATE TABLE IF NOT EXISTS wa_bajas (
  whatsapp TEXT PRIMARY KEY,         -- number, or the BSUID for a username-only contact
  alcance TEXT NOT NULL CHECK (alcance IN ('todo', 'marketing')),
  motivo TEXT NOT NULL,
  texto TEXT,
  creada TEXT NOT NULL
);
`;

/** Delivery states in the order they can only move forward («fallido» handled apart). */
export const RANGO_ESTADO = { recibido: 0, enviado: 1, entregado: 2, leido: 3, fallido: 4 };
export const ESTADO_META = { sent: "enviado", delivered: "entregado", read: "leido", played: "leido", failed: "fallido" };

const nuevoId = (prefijo) => prefijo + randomBytes(9).toString("base64url");
const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
export const desjson = (s, porDefecto = null) => { if (s == null) return porDefecto; try { return JSON.parse(s); } catch { return porDefecto; } };

/** Plain search text: lowercase, no accents. */
export const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function crearAlmacen(db, { ahora = () => Date.now() } = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.exec !== "function") throw new Error("crearAlmacen: db must be a node:sqlite DatabaseSync");
  db.exec(ESQUEMA);

  const iso = () => new Date(ahora()).toISOString();
  let nivel = 0;
  /** Runs fn atomically; nests through SAVEPOINTs so it is safe inside the server's own transactions. */
  function transaccion(fn) {
    const sp = `wa_sp_${nivel++}`;
    db.exec(`SAVEPOINT ${sp}`);
    try {
      const r = fn();
      db.exec(`RELEASE ${sp}`);
      return r;
    } catch (e) {
      db.exec(`ROLLBACK TO ${sp}`);
      db.exec(`RELEASE ${sp}`);
      throw e;
    } finally {
      nivel--;
    }
  }

  const st = {
    convPorId: db.prepare("SELECT * FROM wa_conversaciones WHERE id = ?"),
    convPorWa: db.prepare("SELECT * FROM wa_conversaciones WHERE whatsapp = ?"),
    convPorUsuario: db.prepare("SELECT * FROM wa_conversaciones WHERE usuario_id = ?"),
    convCrear: db.prepare(`INSERT OR IGNORE INTO wa_conversaciones (id, whatsapp, usuario_id, usuario, nombre, perfil, clienta, clienta_nombre, clienta_etapa, creada, actualizada)
                           VALUES (:id, :whatsapp, :usuario_id, :usuario, :nombre, :perfil, :clienta, :clienta_nombre, :clienta_etapa, :ts, :ts)`),
    convIdentidad: db.prepare(`UPDATE wa_conversaciones SET whatsapp = COALESCE(whatsapp, :whatsapp), usuario_id = COALESCE(usuario_id, :usuario_id),
                           usuario = COALESCE(:usuario, usuario), actualizada = :ts WHERE id = :id`),
    convMoverMensajes: db.prepare("UPDATE wa_mensajes SET conversacion = ? WHERE conversacion = ?"),
    convBorrar: db.prepare("DELETE FROM wa_conversaciones WHERE id = ?"),
    convListar: db.prepare("SELECT * FROM wa_conversaciones ORDER BY COALESCE(ultimo_ts, creada) DESC LIMIT ?"),
    convEntrante: db.prepare(`UPDATE wa_conversaciones SET
        no_leidos = no_leidos + :suma,
        ventana_desde_ms = MAX(COALESCE(ventana_desde_ms, 0), :ventana),
        ultimo_texto = CASE WHEN :ts >= COALESCE(ultimo_ts, '') THEN :texto ELSE ultimo_texto END,
        ultima_direccion = CASE WHEN :ts >= COALESCE(ultimo_ts, '') THEN 'entrante' ELSE ultima_direccion END,
        ultimo_ts = MAX(COALESCE(ultimo_ts, ''), :ts),
        estado = 'abierta', actualizada = :ahora
      WHERE id = :id`),
    convSaliente: db.prepare(`UPDATE wa_conversaciones SET
        ultimo_texto = CASE WHEN :ts >= COALESCE(ultimo_ts, '') THEN :texto ELSE ultimo_texto END,
        ultima_direccion = CASE WHEN :ts >= COALESCE(ultimo_ts, '') THEN 'saliente' ELSE ultima_direccion END,
        ultimo_ts = MAX(COALESCE(ultimo_ts, ''), :ts), actualizada = :ahora
      WHERE id = :id`),
    convLeida: db.prepare("UPDATE wa_conversaciones SET no_leidos = 0, actualizada = ? WHERE id = ?"),
    msgInsertar: db.prepare(`INSERT OR IGNORE INTO wa_mensajes
        (id, meta_id, conversacion, direccion, tipo, texto, plantilla, variables, media, datos, responde_a, estado, error, error_codigo, ts, autor_tipo, autor_nombre, autor_id, creado)
        VALUES (:id, :meta_id, :conversacion, :direccion, :tipo, :texto, :plantilla, :variables, :media, :datos, :responde_a, :estado, :error, :error_codigo, :ts, :autor_tipo, :autor_nombre, :autor_id, :creado)`),
    msgPorId: db.prepare("SELECT * FROM wa_mensajes WHERE id = ?"),
    msgPorMeta: db.prepare("SELECT * FROM wa_mensajes WHERE meta_id = ?"),
    msgDeConv: db.prepare("SELECT * FROM (SELECT * FROM wa_mensajes WHERE conversacion = :c AND ts < :antes ORDER BY ts DESC, creado DESC LIMIT :limite) ORDER BY ts ASC, creado ASC"),
    msgUltimoEntrante: db.prepare("SELECT meta_id FROM wa_mensajes WHERE conversacion = ? AND direccion = 'entrante' AND meta_id IS NOT NULL ORDER BY ts DESC LIMIT 1"),
    msgEstado: db.prepare("UPDATE wa_mensajes SET estado = :estado, error = :error, error_codigo = :error_codigo WHERE id = :id"),
    estInsertar: db.prepare(`INSERT OR IGNORE INTO wa_estados (meta_id, estado, ts, destinatario, error_codigo, error, categoria, cobrable, tipo_precio, recibido)
        VALUES (:meta_id, :estado, :ts, :destinatario, :error_codigo, :error, :categoria, :cobrable, :tipo_precio, :recibido)`),
    estCobros: db.prepare(`SELECT categoria, COUNT(*) AS n FROM wa_estados
        WHERE cobrable = 1 AND estado IN ('enviado', 'entregado', 'leido') AND ts >= ? GROUP BY categoria`),
    estPodar: db.prepare("DELETE FROM wa_estados WHERE ts < ?"),
    // estado NULL = keep the current one (a category change does not say whether it is approved).
    plaUpsert: db.prepare(`INSERT INTO wa_plantillas (nombre, idioma, meta_id, estado, categoria, motivo, actualizada)
        VALUES (:nombre, :idioma, :meta_id, COALESCE(:estado, 'PENDING'), :categoria, :motivo, :ts)
        ON CONFLICT (nombre, idioma) DO UPDATE SET
          meta_id = COALESCE(excluded.meta_id, wa_plantillas.meta_id),
          estado = CASE WHEN :estado IS NULL THEN wa_plantillas.estado ELSE excluded.estado END,
          categoria = COALESCE(excluded.categoria, wa_plantillas.categoria),
          motivo = CASE WHEN :estado IS NULL THEN wa_plantillas.motivo ELSE excluded.motivo END,
          actualizada = excluded.actualizada`),
    plaBorrar: db.prepare("DELETE FROM wa_plantillas WHERE nombre = ? AND idioma = ?"),
    plaPorMetaId: db.prepare("SELECT * FROM wa_plantillas WHERE meta_id = ?"),
    plaTodas: db.prepare("SELECT * FROM wa_plantillas"),
    bajaPorWa: db.prepare("SELECT * FROM wa_bajas WHERE whatsapp = ?"),
    bajaUpsert: db.prepare(`INSERT INTO wa_bajas (whatsapp, alcance, motivo, texto, creada) VALUES (:whatsapp, :alcance, :motivo, :texto, :ts)
        ON CONFLICT (whatsapp) DO UPDATE SET
          alcance = CASE WHEN wa_bajas.alcance = 'todo' THEN 'todo' ELSE excluded.alcance END,
          motivo = excluded.motivo, texto = excluded.texto, creada = excluded.creada`),
    bajaQuitar: db.prepare("DELETE FROM wa_bajas WHERE whatsapp = ?"),
  };

  // Status history older than 13 months is noise (cost reports look at the last month).
  try { st.estPodar.run(new Date(ahora() - 400 * 86400000).toISOString()); } catch { /* best effort */ }

  const almacen = {
    transaccion,

    conversacion: (id) => st.convPorId.get(String(id ?? "")) || null,
    conversacionPorWhatsApp: (wa) => (wa ? st.convPorWa.get(String(wa)) || null : null),
    conversacionPorUsuarioId: (u) => (u ? st.convPorUsuario.get(String(u)) || null : null),

    /**
     * Finds the conversation by number and/or BSUID, or creates it. Returns { fila, nueva }.
     * When a username-only conversation later shows up with her number (or the other way round),
     * the two are merged into one so the history stays together.
     */
    obtenerOCrearConversacion({ whatsapp = null, usuarioId = null, usuario = null, perfil = "", clienta = null }) {
      whatsapp = whatsapp || null;
      usuarioId = usuarioId || null;
      if (!whatsapp && !usuarioId) throw new Error("obtenerOCrearConversacion: whatsapp or usuarioId required");
      return transaccion(() => {
        const ts = iso();
        const porWa = whatsapp ? st.convPorWa.get(whatsapp) : null;
        const porU = usuarioId ? st.convPorUsuario.get(usuarioId) : null;
        if (porWa && porU && porWa.id !== porU.id) {
          st.convMoverMensajes.run(porWa.id, porU.id);
          st.convBorrar.run(porU.id);
          db.prepare(`UPDATE wa_conversaciones SET
              no_leidos = no_leidos + :nl, ventana_desde_ms = MAX(COALESCE(ventana_desde_ms, 0), :v) WHERE id = :id`)
            .run({ id: porWa.id, nl: porU.no_leidos || 0, v: porU.ventana_desde_ms || 0 });
        }
        const existente = porWa || porU;
        if (existente) {
          if ((whatsapp && !existente.whatsapp) || (usuarioId && !existente.usuario_id) || (usuario && usuario !== existente.usuario)) {
            st.convIdentidad.run({ id: existente.id, whatsapp, usuario_id: usuarioId, usuario: usuario || null, ts });
          }
          return { fila: st.convPorId.get(existente.id), nueva: false };
        }
        const id = nuevoId("cv_");
        st.convCrear.run({
          id, whatsapp, usuario_id: usuarioId, usuario: usuario || null, nombre: clienta?.nombre || perfil || "", perfil: perfil || "",
          clienta: clienta?.id ?? null, clienta_nombre: clienta?.nombre ?? null, clienta_etapa: clienta?.etapa ?? null, ts,
        });
        return { fila: st.convPorId.get(id), nueva: true };
      });
    },

    /** Partial update of the editable fields. Unknown keys are ignored. */
    actualizarConversacion(id, campos) {
      const permitidos = {
        nombre: "nombre", perfil: "perfil", estado: "estado", clienta: "clienta", clientaNombre: "clienta_nombre",
        clientaEtapa: "clienta_etapa", etiquetas: "etiquetas", vincular: "vincular",
      };
      const sets = [];
      const params = { id, actualizada: iso() };
      for (const [k, col] of Object.entries(permitidos)) {
        if (!(k in campos)) continue;
        sets.push(`${col} = :${col}`);
        params[col] = k === "etiquetas" ? JSON.stringify(campos[k] || []) : k === "vincular" ? (campos[k] ? 1 : 0) : campos[k] ?? null;
      }
      if (!sets.length) return almacen.conversacion(id);
      db.prepare(`UPDATE wa_conversaciones SET ${sets.join(", ")}, actualizada = :actualizada WHERE id = :id`).run(params);
      return almacen.conversacion(id);
    },

    listarConversaciones({ filtro = "abiertas", q = "", limite = 300 } = {}) {
      let filas = st.convListar.all(Math.min(Math.max(Number(limite) || 300, 1), 1000));
      if (filtro === "abiertas") filas = filas.filter((f) => f.estado === "abierta");
      else if (filtro === "sin-leer") filas = filas.filter((f) => f.no_leidos > 0);
      const busca = plano(q).trim();
      if (busca) {
        const digitos = busca.replace(/\D/g, "");
        filas = filas.filter((f) =>
          plano(f.nombre).includes(busca) || plano(f.perfil).includes(busca) || plano(f.clienta_nombre).includes(busca) ||
          plano(f.etiquetas).includes(busca) || plano(f.usuario).includes(busca) || (digitos.length >= 3 && String(f.whatsapp ?? "").includes(digitos)));
      }
      return filas;
    },

    /**
     * Inbound message, idempotent on meta_id. Returns { nuevo, fila }.
     * Opens (or extends) the 24 h customer service window from the moment she wrote.
     */
    registrarEntrante(conversacion, m) {
      return transaccion(() => {
        const ts = new Date(m.tsMs).toISOString();
        const fila = {
          id: nuevoId("m_"), meta_id: m.metaId, conversacion: conversacion.id, direccion: "entrante", tipo: m.tipo,
          texto: m.texto ?? "", plantilla: null, variables: null, media: json(m.media), datos: json(m.datos), responde_a: m.respondeA ?? null,
          estado: "recibido", error: m.error ?? null, error_codigo: m.errorCodigo ?? null, ts,
          autor_tipo: "clienta", autor_nombre: m.autorNombre ?? "", autor_id: m.autorId ?? null, creado: iso(),
        };
        const r = st.msgInsertar.run(fila);
        if (r.changes !== 1) return { nuevo: false, fila: st.msgPorMeta.get(m.metaId) };
        st.convEntrante.run({
          id: conversacion.id, suma: m.cuentaComoNoLeido === false ? 0 : 1, ventana: m.abreVentana === false ? 0 : m.tsMs,
          texto: m.vistaPrevia ?? m.texto ?? "", ts, ahora: iso(),
        });
        return { nuevo: true, fila: st.msgPorId.get(fila.id) };
      });
    },

    /** Outbound message accepted by Meta (or a local system note). Returns the stored row. */
    registrarSaliente(conversacion, m) {
      return transaccion(() => {
        const ts = m.tsMs ? new Date(m.tsMs).toISOString() : iso();
        const fila = {
          id: nuevoId("m_"), meta_id: m.metaId ?? null, conversacion: conversacion.id, direccion: "saliente", tipo: m.tipo,
          texto: m.texto ?? "", plantilla: m.plantilla ?? null, variables: json(m.variables), media: json(m.media), datos: json(m.datos),
          responde_a: null, estado: m.estado ?? "enviado", error: m.error ?? null, error_codigo: m.errorCodigo ?? null, ts,
          autor_tipo: m.autor?.tipo ?? "sistema", autor_nombre: m.autor?.nombre ?? "", autor_id: m.autor?.id ?? null, creado: iso(),
        };
        st.msgInsertar.run(fila);
        st.convSaliente.run({ id: conversacion.id, texto: m.vistaPrevia ?? m.texto ?? "", ts, ahora: iso() });
        return st.msgPorId.get(fila.id);
      });
    },

    mensajes(conversacionId, { limite = 200, antes } = {}) {
      return st.msgDeConv.all({ c: conversacionId, antes: antes || "9999", limite: Math.min(Math.max(Number(limite) || 200, 1), 500) });
    },

    mensajePorMetaId: (metaId) => st.msgPorMeta.get(String(metaId ?? "")) || null,
    ultimoEntranteMetaId: (conversacionId) => st.msgUltimoEntrante.get(conversacionId)?.meta_id || null,
    marcarLeida: (id) => st.convLeida.run(iso(), id),

    /**
     * Delivery status from Meta, idempotent on (meta_id, estado). States only move forward;
     * «fallido» only replaces «enviado». Returns { nuevo, mensaje } (mensaje = updated row or null).
     */
    aplicarEstado(e) {
      return transaccion(() => {
        const r = st.estInsertar.run({
          meta_id: e.metaId, estado: e.estado, ts: new Date(e.tsMs).toISOString(), destinatario: e.destinatario ?? null,
          error_codigo: e.errorCodigo ?? null, error: e.error ?? null, categoria: e.categoria ?? null,
          cobrable: e.cobrable == null ? null : e.cobrable ? 1 : 0, tipo_precio: e.tipoPrecio ?? null, recibido: iso(),
        });
        if (r.changes !== 1) return { nuevo: false, mensaje: null };
        const msg = st.msgPorMeta.get(e.metaId);
        if (!msg) return { nuevo: true, mensaje: null };
        const actual = RANGO_ESTADO[msg.estado] ?? 0;
        const avanza = e.estado === "fallido" ? actual <= RANGO_ESTADO.enviado : RANGO_ESTADO[e.estado] > actual || msg.estado === "fallido";
        if (!avanza) return { nuevo: true, mensaje: msg };
        st.msgEstado.run({ id: msg.id, estado: e.estado, error: e.estado === "fallido" ? e.error ?? null : null, error_codigo: e.estado === "fallido" ? e.errorCodigo ?? null : null });
        return { nuevo: true, mensaje: st.msgPorId.get(msg.id) };
      });
    },

    /** Billable messages per category since an ISO date (from Meta's pricing info on statuses). */
    cobrosDesde(desdeIso) {
      const out = {};
      for (const f of st.estCobros.all(desdeIso)) out[f.categoria || "otra"] = f.n;
      return out;
    },

    guardarPlantilla({ nombre, idioma, metaId = null, estado = null, categoria = null, motivo = null }) {
      st.plaUpsert.run({ nombre, idioma, meta_id: metaId, estado, categoria, motivo, ts: iso() });
    },
    borrarPlantilla: (nombre, idioma) => st.plaBorrar.run(nombre, idioma).changes > 0,
    plantillaPorMetaId: (metaId) => st.plaPorMetaId.get(String(metaId ?? "")) || null,
    /** Map "nombre|idioma" → cache row. */
    plantillasCache() {
      return new Map(st.plaTodas.all().map((f) => [`${f.nombre}|${f.idioma}`, f]));
    },

    baja: (wa) => st.bajaPorWa.get(String(wa ?? "")) || null,
    registrarBaja: ({ whatsapp, alcance = "todo", motivo, texto = null }) => st.bajaUpsert.run({ whatsapp, alcance, motivo, texto, ts: iso() }),
    quitarBaja: (wa) => st.bajaQuitar.run(String(wa ?? "")).changes > 0,
  };
  return almacen;
}

