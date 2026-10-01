// Casa Lotus · a believable fake studio for development and tests (invented people, example.com
// e-mails, 300 555 xxxx phones). It lights up every segment and every alert of the contract.
// Never used in production (config refuses DATOS=memoria there).
import * as R from "../../../shared/reglas.js";
import { CONSENTIMIENTOS, SALUD_SIN_DATOS } from "../../../shared/consentimientos.js";
import { AJUSTES, PLANES_BASE } from "./esquema.js";
import { aFila, textoConsentimiento } from "./modelo.js";

/** Dev-only staff accounts (memory driver + development only). Passwords are public on purpose. */
export const CUENTAS_DEV = [
  { rol: "admin", nombre: "Ana Admin (dev)", nombreHorario: "", correo: "admin@casalotus.test", password: "lotus-admin-dev-2026" },
  { rol: "profe", nombre: "Ximena Profe (dev)", nombreHorario: "Ximena", correo: "ximena@casalotus.test", password: "lotus-profe-dev-2026" },
  { rol: "profe", nombre: "Laura Profe (dev)", nombreHorario: "Laura", correo: "laura@casalotus.test", password: "lotus-profe-dev-2026" },
  { rol: "profe", nombre: "Geral Profe (dev)", nombreHorario: "Geral", correo: "geral@casalotus.test", password: "lotus-profe-dev-2026" },
];

export const HORARIO_BASE = [
  ["Miércoles", "18:00", "Yoga Aéreo", "Ximena", 8, "Sí"],
  ["Miércoles", "19:00", "Pilates Aéreo", "Laura", 8, "Sí"],
  ["Sábado", "08:00", "Stretch Aéreo", "Geral", 8, "Sí"],
  ["Sábado", "09:15", "Yoga Aéreo multinivel", "Ximena", 8, "Sí"],
];

const si = (k, hoy) => textoConsentimiento(true, hoy, CONSENTIMIENTOS[k].version);

/**
 * tipo: "vacia" (headers only) · "basica" (settings, plans, schedule, 4 weeks of classes) · "demo" (+ people).
 * Returns { clientas, clases } summaries for tests.
 */
export async function sembrar(driver, { tipo = "demo", ahora = Date.now() } = {}) {
  if (tipo === "vacia") return {};
  const hoy = R.hoyClave(ahora);
  const poner = (pestana, filas) => driver.agregar(pestana, filas.map((f) => aFila(pestana, f)));

  await poner("Ajustes", AJUSTES.map(([k, v, a]) => ({ "Ajuste": k, "Valor": v, "Para qué sirve": a })));
  await poner("Planes", PLANES_BASE.map(([p, c, pr, v, t, a]) => ({ "Plan": p, "Clases": c, "Precio": pr, "Vigencia (días)": v, "Tipo": t, "Activo": a })));
  await poner("Horario", HORARIO_BASE.map(([d, h, c, p, cu, a]) => ({ "Día": d, "Hora": h, "Clase": c, "Profe": p, "Cupos": cu, "Activa": a })));

  const horario = HORARIO_BASE.map(([dia, hora, clase, profe, cupos]) => ({ dia, hora, clase, profe, cupos, activa: true }));
  const desde = tipo === "demo" ? R.sumarDias(hoy, -91) : hoy;
  const semanas = tipo === "demo" ? 17 : 4;
  const fin = R.sumarDias(hoy, 28);
  const clases = R.fechasDeClase(horario, desde, semanas).filter((c) => c.fecha < fin && (tipo === "demo" || R.inicioClase(c) > ahora));
  const filasClase = clases.map((c) => ({ "ID": c.id, "Fecha": c.fecha, "Día": c.dia, "Hora": c.hora, "Clase": c.clase, "Profe": c.profe, "Cupos": c.cupos, "Estado": "Programada", "Notas": "", "Tipo": "Regular" }));

  if (tipo !== "demo") {
    await poner("Clases", filasClase);
    return { clases: clases.map((c) => c.id) };
  }

  // an extra class tomorrow morning, with one person: «poca gente»
  let manana = R.sumarDias(hoy, 1);
  if (R.festivosEntre(manana, manana)[manana]) manana = R.sumarDias(manana, 1);
  const extra = { id: R.claseId(manana, "07:00"), fecha: manana, dia: R.diaDeSemana(manana), hora: "07:00", clase: "Stretch Aéreo", profe: "Geral", cupos: 8 };
  filasClase.push({ "ID": extra.id, "Fecha": extra.fecha, "Día": extra.dia, "Hora": extra.hora, "Clase": extra.clase, "Profe": extra.profe, "Cupos": 8, "Estado": "Programada", "Notas": "Clase extra de prueba", "Tipo": "Extra" });
  clases.push(extra);
  // a class in five days nobody teaches yet: «sin profe»
  let enCinco = R.sumarDias(hoy, 5);
  if (R.festivosEntre(enCinco, enCinco)[enCinco]) enCinco = R.sumarDias(enCinco, 1);
  const sinProfe = { id: R.claseId(enCinco, "07:00"), fecha: enCinco, dia: R.diaDeSemana(enCinco), hora: "07:00", clase: "Pilates Aéreo", profe: "Por confirmar", cupos: 8 };
  filasClase.push({ "ID": sinProfe.id, "Fecha": sinProfe.fecha, "Día": sinProfe.dia, "Hora": sinProfe.hora, "Clase": sinProfe.clase, "Profe": sinProfe.profe, "Cupos": 8, "Estado": "Programada", "Notas": "", "Tipo": "Extra" });
  clases.push(sinProfe);
  clases.sort((a, b) => (a.id < b.id ? -1 : 1));
  await poner("Clases", filasClase.sort((a, b) => (a["ID"] < b["ID"] ? -1 : 1)));

  const pasadas = clases.filter((c) => R.inicioClase(c) + 3600000 < ahora).reverse(); // most recent first
  const futuras = clases.filter((c) => R.inicioClase(c) > ahora && c.id !== extra.id && c.id !== sinProfe.id);

  /* ── people ── */
  const cumple = (dias, anios) => { const f = R.sumarDias(hoy, dias); return String(Number(f.slice(0, 4)) - anios) + f.slice(4); };
  const gente = [
    // [nombre, wa, correo, desdeDias, salud, sensibles, contacto, imagen, nacimiento, experiencia, llego, notas]
    ["Valentina Ruiz", "3005550101", "valentina.ruiz@example.com", -60, "Ninguna", false, ["Mamá", "3005559101"], true, "1994-03-12", "Practico seguido", "Instagram", "Prefiere el columpio cerca de la ventana."],
    ["Camila Torres", "3005550102", "", -50, "Ninguna", false, ["Andrés", "3005559102"], true, "1990-07-21", "Algo de experiencia", "Referencia de un amigo/a", ""],
    ["Daniela Mora", "3005550103", "daniela.mora@example.com", -40, "Lesión antigua en la rodilla derecha: evita impactos.", true, ["Hermana", "3005559103"], false, "1988-11-02", "Algo de experiencia", "Google", ""],
    ["Sofía Pardo", "3005550104", "", -45, "Ninguna", false, ["Papá", "3005559104"], true, "1997-01-30", "Practico seguido", "Instagram", ""],
    ["Mariana León", "3005550105", "mariana.leon@example.com", -8, "Ninguna", false, ["Mamá", "3005559105"], true, "2000-05-15", "Primera vez", "Instagram", ""],
    ["Isabela Quintero", "3005550106", "isabela.quintero@example.com", 0, "Ninguna", false, ["Pareja", "3005559106"], true, "1995-09-09", "Primera vez", "Google", ""],
    ["Lucía Gómez", "3005550107", "", -30, "Ninguna", false, ["Mamá", "3005559107"], true, "1992-02-18", "Algo de experiencia", "Facebook", ""],
    ["Paula Ríos", "3005550108", "paula.rios@example.com", -70, SALUD_SIN_DATOS[1], false, ["Esposo", "3005559108"], true, cumple(2, 31), "Practico seguido", "Referencia de un amigo/a", ""],
    ["Natalia Vargas", "3005550109", "", -5, "", false, null, null, "", "Primera vez", "Instagram", ""],
    ["Andrea Castillo", "3005550110", "andrea.castillo@example.com", -120, "Ninguna", false, ["Mamá", "3005559110"], true, "1985-12-01", "Algo de experiencia", "Google", ""],
    ["Juliana Herrera", "3005550111", "", -3, "", false, null, null, "", "", "Instagram", "Preguntó por Instagram por los horarios del sábado."],
    ["Carolina Díaz", "3005550112", "", -40, "Ninguna", false, ["Mamá", "3005559112"], true, "1993-04-04", "Practico seguido", "Instagram", ""],
    ["Gabriela Rojas", "3005550113", "", -35, "Ninguna", false, ["Hermano", "3005559113"], true, "1991-08-08", "Algo de experiencia", "Facebook", ""],
    ["Manuela Ortiz", "3005550114", "", -33, "Ninguna", false, ["Mamá", "3005559114"], false, "1999-10-10", "Primera vez", "Google", ""],
    ["Tatiana Peña", "3005550115", "", -28, "Ninguna", false, ["Papá", "3005559115"], true, "1987-06-06", "Practico seguido", "Referencia de un amigo/a", ""],
    ["Alejandra Suárez", "3005550116", "", -25, "Ninguna", false, ["Mamá", "3005559116"], true, "1996-03-03", "Algo de experiencia", "Instagram", ""],
    ["Verónica Silva", "3005550117", "", -22, "Ninguna", false, ["Pareja", "3005559117"], true, "1989-09-19", "Practico seguido", "Instagram", ""],
    ["Diana Cárdenas", "3005550118", "", -20, "Ninguna", false, ["Mamá", "3005559118"], true, "1994-12-12", "Algo de experiencia", "Facebook", ""],
  ];
  const ids = {};
  await poner("Clientas", gente.map(([nombre, wa, correo, d, salud, sens, contacto, imagen, nac, exp, llego, notas], i) => {
    const id = "C-" + String(i + 1).padStart(4, "0");
    ids[nombre.split(" ")[0]] = id;
    const f = R.sumarDias(hoy, d);
    const completa = Boolean(contacto);
    return {
      "ID": id, "Nombre": nombre, "WhatsApp": R.normalizaWhatsApp(wa), "Correo": correo, "Desde": f, "Cómo llegó": llego,
      "Acepta datos": si("datos", f), "Notas": notas, "Nacimiento": nac, "Barrio": completa ? ["Chapinero", "Usaquén", "Cedritos", "Teusaquillo"][i % 4] : "",
      "Intereses": completa ? ["Desarrollar fuerza, flexibilidad y conciencia corporal", "Reducir niveles de estrés / ansiedad"].join(" · ") : "",
      "Salud": salud, "EPS": completa ? ["Sura", "Sanitas", "Compensar", "Nueva EPS"][i % 4] : "",
      "Contacto de emergencia": contacto ? contacto[0] + " · " + R.whatsappLegible(R.normalizaWhatsApp(contacto[1])) : "",
      "Experiencia": exp, "Autoriza imagen": imagen === null ? "" : imagen ? "Sí" : "No", "Descargo": completa ? si("descargo", f) : "",
      "Datos sensibles": sens ? si("sensibles", f) : "", "Etiquetas": i === 0 ? "constante, mañanas, novedades-whatsapp" : i % 3 === 0 ? "novedades-whatsapp" : "",
    };
  }));

  /* ── purchases ── */
  const compras = [];
  const comprar = (quien, plan, dias, medio = "Nequi") => {
    const p = PLANES_BASE.find((x) => x[0] === plan);
    const id = "P-" + String(compras.length + 1).padStart(4, "0");
    const f = R.sumarDias(hoy, dias);
    compras.push({ id, clienta: ids[quien], inicio: f, vence: R.sumarDias(f, p[3] - 1), clases: p[1], fila: { "ID": id, "Fecha": f, "Clienta": ids[quien], "Plan": plan, "Clases": p[1], "Valor": p[2], "Medio de pago": medio, "Inicio": f, "Notas": "" } });
    return id;
  };
  const P = {
    Valentina: comprar("Valentina", "8 clases al mes", -10),
    Camila: comprar("Camila", "4 clases al mes", -20, "DaviPlata"),
    Daniela: comprar("Daniela", "12 clases al mes", -26, "Bre-B"),
    Sofia: comprar("Sofía", "8 clases al mes", -20),
    Mariana: comprar("Mariana", "Clase de prueba", -6),
    Lucia: comprar("Lucía", "16 clases al mes", -5, "Transferencia"),
    Paula: comprar("Paula", "8 clases al mes", -15),
    Natalia: comprar("Natalia", "4 clases al mes", -5),
    Andrea: comprar("Andrea", "4 clases al mes", -90, "Efectivo"),
    Carolina: comprar("Carolina", "8 clases al mes", -12),
    Gabriela: comprar("Gabriela", "8 clases al mes", -11, "DaviPlata"),
    Manuela: comprar("Manuela", "8 clases al mes", -9),
    Tatiana: comprar("Tatiana", "8 clases al mes", -8, "Bre-B"),
    Alejandra: comprar("Alejandra", "8 clases al mes", -7),
    Veronica: comprar("Verónica", "8 clases al mes", -6),
    Diana: comprar("Diana", "8 clases al mes", -4),
  };
  await poner("Compras", compras.map((c) => c.fila));

  /* ── bookings ── */
  const reservas = [];
  const ocup = {};
  const reservar = (quien, clase, estado, compra, extraFila = {}) => {
    const id = "R-" + String(reservas.length + 1).padStart(4, "0");
    ocup[clase.id] = (ocup[clase.id] || 0) + (R.OCUPAN.includes(estado) ? 1 : 0);
    reservas.push({
      "ID": id, "Creada": Math.min(R.inicioClase(clase) - 2 * 86400000, ahora - 3600000), "Clase": clase.id, "Clienta": ids[quien], "Estado": estado,
      "Compra": compra || "", "Origen": "Panel", "Notas": "", ...extraFila,
    });
    return id;
  };
  const conCupo = (c) => (ocup[c.id] || 0) < c.cupos;
  /** n past attended classes for a person, after her plan started, spread over the calendar. */
  const historia = (quien, compra, n, estados = []) => {
    const c0 = compras.find((x) => x.id === compra);
    const opciones = pasadas.slice(1).filter((c) => c.fecha >= c0.inicio && c.fecha <= c0.vence && conCupo(c)).reverse();
    for (let i = 0; i < n && i < opciones.length; i++) reservar(quien, opciones[i], estados[i] || R.ESTADO.ASISTIO, compra);
  };

  // the latest class still has attendance to mark
  for (const q of ["Carolina", "Gabriela", "Manuela"]) reservar(q, pasadas[0], R.ESTADO.CONFIRMADA, P[q]);
  historia("Valentina", P.Valentina, 3);
  historia("Camila", P.Camila, 3, [R.ESTADO.ASISTIO, R.ESTADO.ASISTIO, R.ESTADO.NO_VINO]);        // 1 class left
  historia("Daniela", P.Daniela, 6);                                                               // expires in 3 days
  historia("Sofía".normalize("NFC") === "Sofía" ? "Sofía" : "Sofía", P.Sofia, 7);                  // used it all (+1 ahead)
  historia("Mariana", P.Mariana, 1);                                                               // trial, no plan
  historia("Lucía", P.Lucia, 2);
  historia("Paula", P.Paula, 3);
  historia("Andrea", P.Andrea, 4);                                                                  // inactive
  for (const q of ["Carolina", "Gabriela", "Manuela", "Tatiana", "Alejandra", "Verónica", "Diana"]) historia(q, P[q.normalize("NFD").replace(/[̀-ͯ]/g, "")], 1);

  // ahead: the next class, a full one with a waiting list, and one where a swing just freed up
  const [f0, f1, f2] = futuras;
  for (const q of ["Valentina", "Daniela", "Natalia", "Paula"]) reservar(q, f0, R.ESTADO.CONFIRMADA, P[q]);
  for (const q of ["Valentina", "Carolina", "Gabriela", "Manuela", "Tatiana", "Alejandra", "Verónica", "Sofía"]) {
    reservar(q, f1, R.ESTADO.CONFIRMADA, P[q.normalize("NFD").replace(/[̀-ͯ]/g, "")]);
  }
  reservar("Daniela", f2, R.ESTADO.CONFIRMADA, P.Daniela);
  reservar("Lucía", f2, R.ESTADO.CONFIRMADA, P.Lucia);
  reservar("Diana", f2, R.ESTADO.CANCELADA_TARDE, P.Diana, { "Notas": "Cancelada con menos de 6 h" });
  // the web booking still waiting for its receipt (from a Google Ads click)
  reservar("Isabela", f2, R.ESTADO.PENDIENTE, "", {
    "Creada": ahora - 10 * 3600000, "Origen": "Web · WEB-HERO", "Vence apartado": Math.min(ahora + 2 * 3600000, R.inicioClase(f2)),
    "Atribución": JSON.stringify({ source: "google", medium: "cpc", campaign: "prueba-octubre", gclid: "Cj0KCQjwDEMO-gclid-casa-lotus" }),
  });
  reservar("Tatiana", extra, R.ESTADO.CONFIRMADA, P.Tatiana);
  // she came to the last class without a booking and without a plan: the profe registered her («vino sin plan»)
  reservar("Juliana", pasadas[0], R.ESTADO.PENDIENTE, "", { "Origen": "Profe · " + pasadas[0].profe, "Notas": "Vino sin plan", "Creada": R.inicioClase(pasadas[0]) + 600000 });
  await poner("Reservas", reservas);

  await poner("Espera", [
    { "ID": "E-0001", "Creada": ahora - 26 * 3600000, "Clase": f1.id, "Clienta": ids["Lucía"], "Estado": "Esperando", "Notas": "" },
    { "ID": "E-0002", "Creada": ahora - 30 * 3600000, "Clase": f2.id, "Clienta": ids["Carolina"], "Estado": "Esperando", "Notas": "" },
  ]);

  return { ids, compras: P, clases: { pasada: pasadas[0].id, proxima: f0.id, llena: f1.id, liberada: f2.id, extra: extra.id, sinProfe: sinProfe.id }, profeLlena: f1.profe };
}
