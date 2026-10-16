-- Casa Lotus · class reminders by e-mail (and WhatsApp when it is connected).
-- One row per booking that got its reminder: the job claims the row before sending, so a restart or a
-- second run never sends twice.
CREATE TABLE recordatorios (
  reserva  TEXT PRIMARY KEY,
  clienta  TEXT NOT NULL,
  clase    TEXT NOT NULL,
  enviado  INTEGER NOT NULL,
  canales  TEXT NOT NULL DEFAULT '',
  error    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX recordatorios_enviado ON recordatorios (enviado);

-- links inside a reminder, stored hashed and bound to one clienta:
--   reserva             «No puedo ir»: a session that sees only that booking, until the class starts
--   baja-recordatorios  «No quiero recordatorios»
CREATE TABLE enlaces (
  hash     TEXT PRIMARY KEY,
  tipo     TEXT NOT NULL CHECK (tipo IN ('reserva', 'baja-recordatorios')),
  clienta  TEXT NOT NULL,
  reserva  TEXT,
  creado   INTEGER NOT NULL,
  vence    INTEGER NOT NULL,
  usado    INTEGER
);
CREATE INDEX enlaces_vence ON enlaces (vence);
