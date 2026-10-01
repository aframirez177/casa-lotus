-- Casa Lotus · a profe asks for a substitute for one of her classes. The request lives while the
-- class's «Profe» is still the one who asked (an admin assigning someone else closes it).
CREATE TABLE reemplazos (
  clase    TEXT PRIMARY KEY,
  profe    TEXT NOT NULL,
  usuario  TEXT NOT NULL,
  motivo   TEXT NOT NULL DEFAULT '',
  fecha    INTEGER NOT NULL
);
