// Casa Lotus · the Sheet's shape as the server knows it (CONTRATO §2).
// Each typed column has a kind, which says how a cell is read and written:
//   id       server-made reference, text-formatted in the Sheet (C-0001, 573…)
//   claseId  a class id "yyyy-MM-dd HH:mm" (Sheets may turn it into a date-time; it is read back either way)
//   hora     "HH:mm" (text-formatted; a time value is read back too)
//   fecha    a date: written as a date serial number, read from a serial or "yyyy-MM-dd"
//   fechaHora an instant: written as a Bogotá wall-clock serial, read back to epoch ms
//   numero   a number
//   lista    a value from a fixed list (Estado, Activa…), written as is
//   texto    free text in a General cell: the Sheets driver escapes it so it is never parsed as a
//            formula, number or date
//   plano    free text in a Plain-text ("@") cell: Sheets never parses it, so it is written as is
//   valor    Ajustes «Valor»: numbers stay numbers, text is escaped like texto
// Calculated columns (a formula in the header cell) are listed only to document them: never written.

export const PESTANAS = {
  Clases: {
    columnas: [["ID", "claseId"], ["Fecha", "fecha"], ["Día", "lista"], ["Hora", "hora"], ["Clase", "texto"], ["Profe", "texto"],
      ["Cupos", "numero"], ["Estado", "lista"], ["Notas", "texto"], ["Tipo", "lista"]],
    calculadas: ["Ocupados", "Libres"],
  },
  Reservas: {
    columnas: [["ID", "id"], ["Creada", "fechaHora"], ["Clase", "claseId"], ["Clienta", "id"], ["Estado", "lista"], ["Compra", "id"],
      ["Origen", "texto"], ["Vence apartado", "fechaHora"], ["Notas", "texto"], ["Reagendada de", "id"], ["Atribución", "plano"]],
    calculadas: ["Nombre", "WhatsApp"],
  },
  Clientas: {
    columnas: [["ID", "id"], ["Nombre", "texto"], ["WhatsApp", "id"], ["Correo", "texto"], ["Desde", "fecha"], ["Cómo llegó", "texto"],
      ["Acepta datos", "texto"], ["Notas", "texto"], ["Nacimiento", "fecha"], ["Barrio", "plano"], ["Intereses", "plano"], ["Salud", "plano"],
      ["EPS", "plano"], ["Contacto de emergencia", "plano"], ["Experiencia", "lista"], ["Autoriza imagen", "lista"], ["Descargo", "texto"],
      ["Datos sensibles", "texto"], ["Etiquetas", "plano"]],
    calculadas: ["Clases disponibles", "Plan vence"],
  },
  Compras: {
    columnas: [["ID", "id"], ["Fecha", "fecha"], ["Clienta", "id"], ["Plan", "texto"], ["Clases", "numero"], ["Valor", "numero"],
      ["Medio de pago", "lista"], ["Inicio", "fecha"], ["Notas", "texto"]],
    calculadas: ["Nombre", "Vence", "Usadas", "Disponibles", "Estado"],
  },
  Espera: {
    columnas: [["ID", "id"], ["Creada", "fechaHora"], ["Clase", "claseId"], ["Clienta", "id"], ["Estado", "lista"], ["Notas", "texto"]],
    calculadas: ["Nombre", "WhatsApp"],
  },
  Horario: {
    columnas: [["Día", "lista"], ["Hora", "hora"], ["Clase", "texto"], ["Profe", "texto"], ["Cupos", "numero"], ["Activa", "lista"]],
    calculadas: [],
  },
  Planes: {
    columnas: [["Plan", "texto"], ["Clases", "numero"], ["Precio", "numero"], ["Vigencia (días)", "numero"], ["Tipo", "lista"], ["Activo", "lista"]],
    calculadas: [],
  },
  Ajustes: {
    columnas: [["Ajuste", "texto"], ["Valor", "valor"], ["Para qué sirve", "texto"]],
    calculadas: [],
  },
  "Conversiones Ads": {
    // Google Ads Data Manager columns (see datos/conversiones.js). Fallback destination only: production
    // uses the first tab of a separate spreadsheet (CONVERSIONES_SHEET_ID).
    columnas: [["Google Click ID", "plano"], ["GBRAID", "plano"], ["WBRAID", "plano"], ["Order ID", "plano"], ["Conversion Name", "plano"],
      ["Conversion Time", "plano"], ["Conversion Value", "plano"], ["Conversion Currency", "plano"]],
    calculadas: [],
    opcional: true, // only exists once Google Ads offline conversions are set up
  },
};

export const NOMBRES_PESTANAS = Object.keys(PESTANAS);

/** Kind of a column, or "texto" for columns the server does not know. */
export function tipoColumna(pestana, encabezado) {
  const def = PESTANAS[pestana];
  const c = def?.columnas.find(([h]) => h === encabezado) || def?.extras?.find(([h]) => h === encabezado);
  return c ? c[1] : "texto";
}

/** Settings the platform reads (CONTRATO §2). Missing rows are appended with these defaults. */
export const AJUSTES = [
  ["Cupos por clase", 8, "Cuántos columpios se ofrecen en cada clase nueva."],
  ["Horas para pagar una reserva web", 12, "Cuánto tiempo se guarda un columpio reservado mientras llega el comprobante."],
  ["Horas mínimas para reservar", 3, "No se puede reservar una clase que empieza en menos de estas horas."],
  ["Horas mínimas para cancelar", 6, "Con este aviso o más, la clase vuelve al plan. Con menos, se libera el columpio pero la clase se descuenta."],
  ["Cambios permitidos clase de prueba", 1, "Cuántas veces se puede mover una clase de prueba a otro día."],
  ["Mínimo de personas", 2, "Si una clase no llega a esta cantidad, aparece como «poca gente»."],
  ["Semanas de clases hacia adelante", 4, "Cuántas semanas del calendario se crean por adelantado."],
  ["Aviso de saldo bajo (clases)", 2, "Cuando a alguien le quedan estas clases o menos, aparece en los avisos para ofrecerle renovar."],
  ["Días para avisar vencimiento", 7, "Cuántos días antes de que venza un plan aparece en «Vence pronto»."],
  ["WhatsApp de reservas", "573128720888", "El número al que se envían los comprobantes."],
  ["Llave de pago", "319 328 8469", "La llave de Nequi, DaviPlata y Bre-B. Nunca números de cuenta."],
  ["Correo para avisos", "casalotusbogota@gmail.com", "Aquí llega un correo cada vez que alguien reserva en la web. Déjalo vacío para no recibirlos."],
  ["Pago por clase a profes", "", "Lo que se le paga a la profe por cada clase dictada. Solo lo ve el equipo administrador. Vacío: no se muestra."],
];

export const AJUSTES_NUMERICOS = new Set([
  "Cupos por clase", "Horas para pagar una reserva web", "Horas mínimas para reservar", "Horas mínimas para cancelar",
  "Cambios permitidos clase de prueba", "Mínimo de personas", "Semanas de clases hacia adelante", "Aviso de saldo bajo (clases)",
  "Días para avisar vencimiento", "Pago por clase a profes",
]);

/** Plans of a fresh Sheet (the same seed as apps-script/sistema/Esquema.js; public prices). */
export const PLANES_BASE = [
  ["Clase de prueba", 1, 25000, 30, "Prueba", "Sí"],
  ["4 clases al mes", 4, 158000, 30, "Mensual", "Sí"],
  ["8 clases al mes", 8, 263000, 30, "Mensual", "Sí"],
  ["12 clases al mes", 12, 330000, 30, "Mensual", "Sí"],
  ["16 clases al mes", 16, 390000, 30, "Mensual", "Sí"],
  ["Trimestral · 4 al mes", 12, 440000, 90, "Trimestral", "Sí"],
  ["Trimestral · 8 al mes", 24, 750000, 90, "Trimestral", "Sí"],
  ["Trimestral · 12 al mes", 36, 950000, 90, "Trimestral", "Sí"],
  ["Trimestral · 16 al mes", 48, 1111000, 90, "Trimestral", "Sí"],
  ["Saldo anterior", 0, 0, 30, "Ajuste", "Sí"],
];

export const ESTADOS_ESPERA = ["Esperando", "Avisada", "Tomó el cupo", "Ya no"];
export const DIAS_HORARIO = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const TIPOS_PLAN = ["Prueba", "Mensual", "Trimestral", "Ajuste"];
