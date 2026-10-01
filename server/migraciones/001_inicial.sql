-- Casa Lotus · system internals. The business record lives in the Google Sheet; this file holds
-- what the Sheet must never carry: accounts, sessions, one-time codes and tokens, the audit log,
-- the novedades feed, attribution clicks, Web Push subscriptions and rate limits.
-- Times are epoch milliseconds (UTC instants).

CREATE TABLE usuarios (
  id              TEXT PRIMARY KEY,
  rol             TEXT NOT NULL CHECK (rol IN ('admin', 'profe')),
  nombre          TEXT NOT NULL,
  nombre_horario  TEXT NOT NULL DEFAULT '',
  correo          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  whatsapp        TEXT NOT NULL DEFAULT '',
  activa          INTEGER NOT NULL DEFAULT 1,
  bio             TEXT NOT NULL DEFAULT '',
  foto            TEXT NOT NULL DEFAULT '',
  hash            TEXT,
  creada          INTEGER NOT NULL,
  ultimo_acceso   INTEGER
);

CREATE TABLE sesiones (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  rol         TEXT NOT NULL CHECK (rol IN ('admin', 'profe', 'clienta')),
  usuario     TEXT,
  clienta     TEXT,
  whatsapp    TEXT,
  alcance     TEXT NOT NULL DEFAULT 'completa' CHECK (alcance IN ('completa', 'reserva')),
  datos       TEXT NOT NULL DEFAULT '{}',
  creada      INTEGER NOT NULL,
  ultimo_uso  INTEGER NOT NULL,
  vence       INTEGER NOT NULL,
  ua          TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX sesiones_usuario ON sesiones (usuario);
CREATE INDEX sesiones_clienta ON sesiones (clienta);

-- 6-digit login codes for clientas (stored hashed, single use, 10 minutes)
CREATE TABLE codigos (
  id        INTEGER PRIMARY KEY,
  destino   TEXT NOT NULL,
  clienta   TEXT NOT NULL,
  whatsapp  TEXT NOT NULL DEFAULT '',
  hash      TEXT NOT NULL,
  creado    INTEGER NOT NULL,
  vence     INTEGER NOT NULL,
  intentos  INTEGER NOT NULL DEFAULT 0,
  usado     INTEGER
);
CREATE INDEX codigos_destino ON codigos (destino);

-- invitations (7 days), password resets (1 hour), clienta access links (7 days): hashed, single use
CREATE TABLE tokens (
  hash     TEXT PRIMARY KEY,
  tipo     TEXT NOT NULL CHECK (tipo IN ('invitacion', 'restablecer', 'acceso')),
  usuario  TEXT,
  clienta  TEXT,
  creado   INTEGER NOT NULL,
  vence    INTEGER NOT NULL,
  usado    INTEGER
);
CREATE INDEX tokens_usuario ON tokens (usuario);

-- audit log: every write, with its actor
CREATE TABLE registro (
  id            INTEGER PRIMARY KEY,
  ts            INTEGER NOT NULL,
  actor_tipo    TEXT NOT NULL,
  actor_id      TEXT NOT NULL DEFAULT '',
  actor_nombre  TEXT NOT NULL DEFAULT '',
  accion        TEXT NOT NULL,
  objeto        TEXT NOT NULL DEFAULT '',
  detalle       TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX registro_ts ON registro (ts);

-- novedades: the admin bell, the SSE stream and the clienta timeline
CREATE TABLE eventos (
  id       INTEGER PRIMARY KEY,
  ts       INTEGER NOT NULL,
  tipo     TEXT NOT NULL,
  titulo   TEXT NOT NULL,
  detalle  TEXT NOT NULL DEFAULT '',
  clienta  TEXT,
  clase    TEXT,
  actor    TEXT NOT NULL DEFAULT '{}',
  datos    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX eventos_ts ON eventos (ts);
CREATE INDEX eventos_clienta ON eventos (clienta);

-- first-party attribution beacons from the site (no personal data: the IP is stored hashed)
CREATE TABLE atribucion (
  id            INTEGER PRIMARY KEY,
  ts            INTEGER NOT NULL,
  tipo          TEXT NOT NULL,
  ref           TEXT NOT NULL DEFAULT '',
  pagina        TEXT NOT NULL DEFAULT '',
  utm_source    TEXT NOT NULL DEFAULT '',
  utm_medium    TEXT NOT NULL DEFAULT '',
  utm_campaign  TEXT NOT NULL DEFAULT '',
  utm_term      TEXT NOT NULL DEFAULT '',
  utm_content   TEXT NOT NULL DEFAULT '',
  gclid         TEXT NOT NULL DEFAULT '',
  gbraid        TEXT NOT NULL DEFAULT '',
  wbraid        TEXT NOT NULL DEFAULT '',
  fbclid        TEXT NOT NULL DEFAULT '',
  ip_hash       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX atribucion_ts ON atribucion (ts);

CREATE TABLE push_suscripciones (
  endpoint  TEXT PRIMARY KEY,
  usuario   TEXT NOT NULL,
  p256dh    TEXT NOT NULL,
  auth      TEXT NOT NULL,
  creada    INTEGER NOT NULL,
  ultimo_ok INTEGER
);

-- sliding-window rate limits
CREATE TABLE limites (
  clave  TEXT NOT NULL,
  ts     INTEGER NOT NULL
);
CREATE INDEX limites_clave ON limites (clave, ts);

-- small key/value memory (e.g. the day the calendar was last generated)
CREATE TABLE meta (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);
