// Casa Lotus · demo studio. A seeded, invented studio (no real people, no real numbers) that lights up
// every screen: a full class with a waiting list, a freed swing, a class with few people, holds about to
// expire, low balances, expiring plans, trials without a plan, birthdays, incomplete fichas.
// Deterministic for a given day, so the demo looks the same on every reload.
import {
  ESTADO, CONSUMEN, sumarDias, hoyClave, fechasDeClase, festivosEntre, momentoMs, inicioClase,
  ocupados, siguienteId, elegirCompra, diaDeSemana, claseId,
} from "../../lib/reglas.js";
import { CONSENTIMIENTOS, SALUD_SIN_DATOS } from "../../lib/reglas.js";

export const AJUSTES_DEFECTO = [
  ["Cupos por clase", "8", "Columpios por clase cuando creas una nueva."],
  ["Horas para pagar una reserva web", "12", "Cuánto tiempo se aparta un columpio sin pago."],
  ["Horas mínimas para reservar", "3", "Hasta cuántas horas antes se puede reservar."],
  ["Horas mínimas para cancelar", "6", "Con este aviso o más, la clase vuelve al plan."],
  ["Cambios permitidos clase de prueba", "1", "Cuántas veces se puede cambiar una clase de prueba."],
  ["Mínimo de personas", "2", "Por debajo, la clase se marca con «poca gente»."],
  ["Semanas de clases hacia adelante", "4", "Hasta dónde se abre el calendario."],
  ["Aviso de saldo bajo (clases)", "2", "Desde cuántas clases se avisa que quedan poquitas."],
  ["Días para avisar vencimiento", "7", "Cuántos días antes se avisa que un plan vence."],
  ["WhatsApp de reservas", "573128720888", "A dónde llegan los comprobantes."],
  ["Llave de pago", "319 328 8469", "Nequi, DaviPlata y Bre-B. Nunca un número de cuenta."],
  ["Correo para avisos", "avisos@demo.casalotus.studio", "Recibe un correo por cada reserva web."],
  ["Pago por clase a profes", "", "Costo por clase dictada. Vacío: la app no lo muestra."],
];

export const PLANES = [
  { nombre: "Clase de prueba", clases: 1, precio: 25000, vigencia: 30, tipo: "Prueba", activo: true },
  { nombre: "4 clases al mes", clases: 4, precio: 158000, vigencia: 30, tipo: "Mensual", activo: true },
  { nombre: "8 clases al mes", clases: 8, precio: 263000, vigencia: 30, tipo: "Mensual", activo: true },
  { nombre: "12 clases al mes", clases: 12, precio: 330000, vigencia: 30, tipo: "Mensual", activo: true },
  { nombre: "16 clases al mes", clases: 16, precio: 390000, vigencia: 30, tipo: "Mensual", activo: true },
  { nombre: "Trimestral · 4 al mes", clases: 12, precio: 440000, vigencia: 90, tipo: "Trimestral", activo: true },
  { nombre: "Trimestral · 8 al mes", clases: 24, precio: 750000, vigencia: 90, tipo: "Trimestral", activo: true },
  { nombre: "Trimestral · 12 al mes", clases: 36, precio: 950000, vigencia: 90, tipo: "Trimestral", activo: true },
  { nombre: "Trimestral · 16 al mes", clases: 48, precio: 1111000, vigencia: 90, tipo: "Trimestral", activo: true },
  { nombre: "Ajuste de saldo", clases: 0, precio: 0, vigencia: 30, tipo: "Ajuste", activo: true },
];

export const HORARIO = [
  { dia: "Lunes", hora: "18:00", clase: "Stretch Aéreo", profe: "Tomás", cupos: 8, activa: true },
  { dia: "Miércoles", hora: "18:00", clase: "Pilates Aéreo", profe: "Tomás", cupos: 8, activa: true },
  { dia: "Miércoles", hora: "19:00", clase: "Yoga Aéreo multinivel", profe: "Salomé", cupos: 8, activa: true },
  { dia: "Sábado", hora: "08:00", clase: "Pilates Aéreo", profe: "Salomé", cupos: 8, activa: true },
  { dia: "Sábado", hora: "09:15", clase: "Yoga Aéreo", profe: "Renata", cupos: 8, activa: true },
  { dia: "Domingo", hora: "09:15", clase: "Yoga Aéreo", profe: "Renata", cupos: 8, activa: false },
];

const EQUIPO = [
  { id: "U-1", rol: "admin", nombre: "Ana", nombreHorario: "Ana", correo: "ana@demo.casalotus.studio", whatsapp: "573005550100", bio: "Fundadora de Casa Lotus." },
  { id: "U-2", rol: "profe", nombre: "Salomé Vargas", nombreHorario: "Salomé", correo: "salome@demo.casalotus.studio", whatsapp: "573005550201", bio: "Pilates y stretch aéreo." },
  { id: "U-3", rol: "profe", nombre: "Tomás Rueda", nombreHorario: "Tomás", correo: "tomas@demo.casalotus.studio", whatsapp: "573005550202", bio: "Fuerza y movilidad." },
  { id: "U-4", rol: "profe", nombre: "Renata Gil", nombreHorario: "Renata", correo: "renata@demo.casalotus.studio", whatsapp: "573005550203", bio: "Yoga aéreo y respiración." },
];

const BARRIOS = ["Chapinero", "Usaquén", "Cedritos", "Teusaquillo", "La Soledad", "Colina Campestre", "Rosales", "Galerías", "Modelia", "Santa Bárbara"];
const EPS = ["Sura", "Sanitas", "Compensar", "Nueva EPS", "Salud Total", "Famisanar"];

// p: plan, s: target balance, ini: days since the plan started, fut: hand-made future bookings below
const GENTE = [
  ["Valentina Ríos", { p: "8 clases al mes", s: 3, ini: 12, llego: "Instagram", exp: "Algo de experiencia", sinContacto: true }],
  ["Camila Peñaranda", { p: "12 clases al mes", s: 6, ini: 9, llego: "Referencia de un amigo/a", exp: "Practico seguido" }],
  ["Mariana Ochoa", { p: "4 clases al mes", s: 1, ini: 18, llego: "Instagram", exp: "Algo de experiencia", cumple: 2 }],
  ["Daniela Cárdenas", { p: "8 clases al mes", s: 3, ini: 26, llego: "Google", exp: "Algo de experiencia" }],
  ["Sofía Arango", { p: "8 clases al mes", s: 0, ini: 27, llego: "Instagram", exp: "Practico seguido" }],
  ["Juliana Mesa", { p: "16 clases al mes", s: 9, ini: 8, llego: "Referencia de un amigo/a", exp: "Practico seguido" }],
  ["Natalia Becerra", { p: "Clase de prueba", s: 0, ini: 6, llego: "Instagram", exp: "Primera vez", prueba: 5 }],
  ["Paula Andrea Silva", { p: "Clase de prueba", s: 0, ini: 11, llego: "Facebook", exp: "Primera vez", prueba: 10 }],
  ["Catalina Herrera", { p: "8 clases al mes", s: 2, ini: 75, llego: "Instagram", exp: "Algo de experiencia", inactiva: true }],
  ["Manuela Quintero", { llego: "Instagram", exp: "Primera vez", nueva: 0 }],
  ["Isabela Gómez", { llego: "Google", exp: "Primera vez", lead: true }],
  ["Andrea Villamil", { p: "8 clases al mes", s: 4, ini: 14, llego: "Instagram", exp: "Algo de experiencia" }],
  ["Lucía Pardo", { p: "4 clases al mes", s: 2, ini: 10, llego: "Referencia de un amigo/a", exp: "Algo de experiencia" }],
  ["Carolina Vélez", { p: "8 clases al mes", s: 5, ini: 7, llego: "Google", exp: "Algo de experiencia", salud: "Hernia discal L5-S1. Evitar inversiones profundas y cargas en la zona lumbar." }],
  ["Tatiana Lozano", { llego: "Facebook", exp: "Primera vez", nueva: 1 }],
  ["Gabriela Niño", { llego: "Instagram", exp: "Primera vez", lead: true }],
  ["Diana Suárez", { p: "12 clases al mes", s: 7, ini: 6, llego: "Instagram", exp: "Practico seguido" }],
  ["Melissa Torres", { p: "8 clases al mes", s: 2, ini: 20, llego: "Google", exp: "Algo de experiencia", salud: "Asma leve. Lleva su inhalador." }],
  ["Alejandra Cifuentes", { p: "12 clases al mes", s: 4, ini: 25, llego: "Referencia de un amigo/a", exp: "Practico seguido" }],
  ["Sara Montoya", { p: "8 clases al mes", s: 5, ini: 5, llego: "Instagram", exp: "Algo de experiencia", cumple: 0 }],
  ["Luisa Fernanda Ruiz", { p: "4 clases al mes", s: 0, ini: 58, llego: "Facebook", exp: "Primera vez", inactiva: true }],
  ["María José Castaño", { p: "16 clases al mes", s: 11, ini: 0, llego: "Instagram", exp: "Practico seguido" }],
  ["Ángela Rincón", { p: "4 clases al mes", s: 0, ini: 22, llego: "Google", exp: "Algo de experiencia" }],
  ["Verónica Salazar", { p: "4 clases al mes", s: 3, ini: 0, llego: "Instagram", exp: "Primera vez", sinContacto: true, sinSalud: true }],
  ["Paola Guerrero", { p: "8 clases al mes", s: 6, ini: 6, llego: "Referencia de un amigo/a", exp: "Algo de experiencia" }],
  ["Lina Marcela Ortiz", { p: "Clase de prueba", s: 0, ini: 0, llego: "Instagram", exp: "Primera vez", nueva: 1, pruebaFutura: true }],
  ["Adriana Bermúdez", { p: "12 clases al mes", s: 4, ini: 16, llego: "Google", exp: "Practico seguido", salud: SALUD_SIN_DATOS[1] }],
  ["Felipe Moreno", { p: "8 clases al mes", s: 5, ini: 9, llego: "Referencia de un amigo/a", exp: "Algo de experiencia" }],
  ["Santiago Leal", { llego: "Google", exp: "Primera vez", nueva: 2 }],
  ["Elena Patiño", { llego: "Instagram", exp: "Primera vez", lead: true }],
];

/** Small deterministic PRNG (mulberry32). */
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms) => new Date(ms).toISOString();

export function sembrar(ahora = Date.now()) {
  const hoy = hoyClave(ahora);
  const r = azar(Number(hoy.replace(/-/g, "")));
  const pick = (lista) => lista[Math.floor(r() * lista.length)];
  const consentidoEn = (dias) => iso(ahora - dias * 86400000);

  /* ── classes: template from −60 to +28 days, plus two extra classes today ── */
  const desde = sumarDias(hoy, -60);
  const festivos = festivosEntre(desde, sumarDias(hoy, 40));
  const clases = fechasDeClase(HORARIO, desde, 13, festivos).map((c) => ({ ...c, estado: "Programada", notas: "", tipo: "Regular" }));
  for (const [hora, clase] of [["07:00", "Stretch Aéreo"], ["19:30", "Yoga Aéreo multinivel"]]) {
    const id = claseId(hoy, hora);
    if (!clases.some((c) => c.id === id)) clases.push({ id, fecha: hoy, dia: diaDeSemana(hoy), hora, clase, profe: "Salomé", cupos: 8, estado: "Programada", notas: "", tipo: "Extra" });
  }
  clases.sort((a, b) => (a.id < b.id ? -1 : 1));
  const pasadas = clases.filter((c) => inicioClase(c) < ahora);
  const futuras = clases.filter((c) => inicioClase(c) >= ahora);

  /* ── people ── */
  const clientas = GENTE.map(([nombre, g], i) => {
    const n = i + 1;
    const id = "C-" + String(n).padStart(4, "0");
    const desdeDias = g.ini != null ? g.ini + 3 + Math.floor(r() * 40) : g.nueva != null ? g.nueva : 2 + Math.floor(r() * 10);
    let nacimiento = `${1984 + Math.floor(r() * 16)}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 27)).padStart(2, "0")}`;
    if (g.cumple != null) nacimiento = (1990 + (n % 9)) + sumarDias(hoy, g.cumple).slice(4);
    const completa = !g.lead && !g.sinContacto;
    const contactoNombre = ["Andrés", "Carlos", "Marta", "Jorge", "Patricia", "Luis", "Gloria"][n % 7] + " " + nombre.split(" ").slice(-1)[0];
    return {
      id, nombre,
      whatsapp: "57300555" + String(1000 + n * 37).slice(-4),
      correo: g.lead ? "" : nombre.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + n + "@correo.demo",
      desde: sumarDias(hoy, -desdeDias),
      llego: g.llego || "",
      nacimiento: g.lead ? "" : nacimiento,
      barrio: g.lead ? "" : pick(BARRIOS),
      intereses: g.lead ? [] : [pick([0, 1, 2]), pick([3, 4, 5, 6, 7])].map((k) => INTERESES_IDX[k]),
      salud: g.lead || g.sinSalud ? "" : g.salud || (r() < 0.75 ? SALUD_SIN_DATOS[0] : SALUD_SIN_DATOS[1]),
      eps: g.lead ? "" : pick(EPS),
      contactoEmergencia: completa ? { nombre: contactoNombre, whatsapp: "57311555" + String(2000 + n * 41).slice(-4) } : { nombre: "", whatsapp: "" },
      experiencia: g.exp || "",
      consentimientos: g.lead ? { datos: { acepta: true, fecha: consentidoEn(desdeDias), version: CONSENTIMIENTOS.datos.version } } : {
        datos: { acepta: true, fecha: consentidoEn(desdeDias), version: CONSENTIMIENTOS.datos.version },
        descargo: { acepta: true, fecha: consentidoEn(desdeDias), version: CONSENTIMIENTOS.descargo.version },
        imagen: { acepta: r() < 0.7, fecha: consentidoEn(desdeDias) },
        ...(r() < 0.4 ? { novedades: { acepta: true, fecha: consentidoEn(desdeDias), version: CONSENTIMIENTOS.novedades.version } } : {}),
        ...(g.salud && !SALUD_SIN_DATOS.includes(g.salud) ? { sensibles: { acepta: true, fecha: consentidoEn(desdeDias), version: CONSENTIMIENTOS.sensibles.version } } : {}),
      },
      notas: n === 14 ? "Prefiere el columpio junto a la ventana." : n === 6 ? "Quiere empezar a preparar la postura de la estrella." : "",
      etiquetas: n === 6 || n === 22 ? ["Constante"] : n === 2 ? ["Trae amigas"] : [],
      _g: g,
    };
  });
  const porNombre = (nombre) => clientas.find((c) => c.nombre.startsWith(nombre));

  const compras = [], reservas = [], espera = [];
  const planDe = (nombre) => PLANES.find((p) => p.nombre === nombre);

  function nuevaCompra(clienta, plan, inicio, medio, creadaDias) {
    const p = planDe(plan);
    const c = {
      id: siguienteId("P", compras.map((x) => x.id)), fecha: sumarDias(hoy, -creadaDias), clienta: clienta.id,
      plan: p.nombre, clases: p.clases, valor: p.precio, medio, inicio, vence: sumarDias(inicio, p.vigencia - 1), notas: "",
    };
    compras.push(c);
    return c;
  }
  function nuevaReserva(clienta, clase, estado, extra = {}) {
    const compra = CONSUMEN.includes(estado) ? (extra.compra || elegirCompra(compras, reservas, clienta.id, clase.fecha)) : null;
    const res = {
      id: siguienteId("R", reservas.map((x) => x.id)),
      creada: extra.creada || iso(Math.min(ahora - 3600000, inicioClase(clase) - (2 + Math.floor(r() * 5)) * 86400000)),
      clase: clase.id, clienta: clienta.id, estado, compra: compra ? compra.id : "", origen: extra.origen || pick(["App", "App", "Panel", "Web · WEB-HERO"]),
      venceApartado: extra.venceApartado || "", notas: "", reagendadaDe: "", atribucion: extra.atribucion || "",
    };
    reservas.push(res);
    return res;
  }
  const libre = (c) => ocupados(reservas, c.id) < c.cupos;

  /* ── hand-made future: the scenes the demo must show ── */
  const sab = futuras.filter((c) => c.dia === "Sábado");
  const sab08 = sab.find((c) => c.hora === "08:00"), sab09 = sab.find((c) => c.hora === "09:15");
  const hoy07 = clases.find((c) => c.id === claseId(hoy, "07:00")), hoy1930 = clases.find((c) => c.id === claseId(hoy, "19:30"));
  const lun = futuras.find((c) => c.dia === "Lunes");
  const mie = futuras.filter((c) => c.dia === "Miércoles");
  const futuro = new Map(); // clienta id → [clase]
  const plan = (nombre, clase) => { const c = porNombre(nombre); if (!futuro.has(c.id)) futuro.set(c.id, []); futuro.get(c.id).push(clase); };

  if (hoy07 && inicioClase(hoy07) >= ahora) for (const n of ["Lina", "Mariana", "Carolina", "Juliana", "Paola"]) plan(n, hoy07);
  if (hoy1930 && inicioClase(hoy1930) >= ahora) plan("Felipe", hoy1930);
  if (sab08) for (const n of ["Juliana", "María José", "Camila", "Diana", "Sara", "Paola", "Adriana", "Alejandra"]) plan(n, sab08);
  if (sab09) for (const n of ["Valentina", "Carolina", "Melissa", "Lucía", "Juliana", "María José", "Felipe"]) plan(n, sab09);
  if (lun) for (const n of ["Andrea", "Camila", "Diana"]) plan(n, lun);
  if (mie[0]) for (const n of ["Valentina", "Juliana", "Verónica", "Daniela"]) plan(n, mie[0]);
  if (mie[1]) for (const n of ["María José", "Camila", "Paola", "Sara", "Alejandra"]) plan(n, mie[1]);
  for (const c of futuras.slice(8)) if (r() < 0.6) for (const n of ["Juliana", "María José", "Diana"]) if (r() < 0.5) plan(n, c);

  /* ── purchases and history: each plan's balance lands on its target ── */
  for (const cl of clientas) {
    const g = cl._g;
    if (!g.p) continue;
    const inicio = sumarDias(hoy, -g.ini);
    const compra = nuevaCompra(cl, g.p, inicio, pick(["Nequi", "Nequi", "DaviPlata", "Bre-B", "Transferencia"]), g.ini);
    const fut = (futuro.get(cl.id) || []).filter((c) => c.fecha <= compra.vence);
    const pasadasMeta = Math.max(0, compra.clases - g.s - fut.length);
    // recent first, so this week looks like the real studio (full)
    const candidatas = pasadas.filter((c) => c.fecha >= inicio && c.fecha <= compra.vence).reverse();
    let hechas = 0;
    for (const c of candidatas) {
      if (hechas >= pasadasMeta) break;
      if (!libre(c) || (g.inactiva && c.fecha > sumarDias(hoy, -32)) || (g.prueba && c.fecha > sumarDias(hoy, -g.prueba)) || r() < 0.4) continue;
      const reciente = ahora - inicioClase(c) < 30 * 3600000;
      nuevaReserva(cl, c, reciente ? ESTADO.CONFIRMADA : r() < 0.92 ? ESTADO.ASISTIO : ESTADO.NO_VINO, { compra });
      hechas++;
    }
    for (const c of fut) if (libre(c)) nuevaReserva(cl, c, ESTADO.CONFIRMADA, { compra, creada: iso(ahora - (1 + Math.floor(r() * 4)) * 86400000) });
    if (g.prueba) {
      const c = pasadas.filter((k) => k.fecha <= sumarDias(hoy, -g.prueba)).reverse().find(libre);
      // the trial booking was made above if a slot fit; otherwise make sure it exists
      if (c && !reservas.some((x) => x.clienta === cl.id)) nuevaReserva(cl, c, ESTADO.ASISTIO, { compra });
    }
  }
  // the late cancellation that freed a swing on Saturday 09:15, and the waiting lists
  if (sab09) {
    const andrea = porNombre("Andrea");
    nuevaReserva(andrea, sab09, ESTADO.CANCELADA, { creada: iso(ahora - 3 * 86400000) });
    espera.push({ id: "E-0001", creada: iso(ahora - 8 * 3600000), clase: sab09.id, clienta: porNombre("Elena").id, estado: "Esperando", notas: "" });
  }
  if (sab08) {
    espera.push({ id: "E-0002", creada: iso(ahora - 26 * 3600000), clase: sab08.id, clienta: porNombre("Valentina").id, estado: "Esperando", notas: "" });
    espera.push({ id: "E-0003", creada: iso(ahora - 20 * 3600000), clase: sab08.id, clienta: porNombre("Gabriela").id, estado: "Esperando", notas: "" });
  }
  // unpaid web holds: one about to expire
  const holds = [["Manuela", lun || futuras[2], 40, "WEB-HERO", 25], ["Tatiana", mie[0] || futuras[3], 9 * 60, "WEB-PLAN-8", 180], ["Santiago", mie[1] || futuras[4], 11 * 60, "WEB-HORARIO-MIE-1900", 60]];
  for (const [n, c, minVence, ref, haceMin] of holds) {
    if (!c || !libre(c)) continue;
    nuevaReserva(porNombre(n), c, ESTADO.PENDIENTE, {
      origen: "Web · " + ref, creada: iso(ahora - haceMin * 60000), venceApartado: iso(ahora + minVence * 60000),
      atribucion: JSON.stringify({ ref, utm: { source: "instagram", medium: "social", campaign: "octubre" } }),
    });
  }

  // a class nobody teaches yet, a profe who cannot make it, and someone who came without a plan
  const lejana = futuras.find((c) => c.fecha >= sumarDias(hoy, 9) && c.dia === "Sábado" && c.hora === "09:15");
  if (lejana) lejana.profe = "";
  if (mie[0]) mie[0].reemplazoPedido = { motivo: "Tengo una cita médica a esa hora", fecha: iso(ahora - 2 * 3600000), pedidoPor: "U-3" };
  const ayer = pasadas.filter((c) => c.fecha === sumarDias(hoy, -1)).pop();
  if (ayer) {
    const gabriela = porNombre("Gabriela");
    reservas.push({ id: siguienteId("R", reservas.map((x) => x.id)), creada: iso(inicioClase(ayer) + 15 * 60000), clase: ayer.id, clienta: gabriela.id, estado: ESTADO.ASISTIO, compra: "", origen: "Profe", venceApartado: "", notas: "", reagendadaDe: "", atribucion: "" });
    if (ocupados(reservas, ayer.id) > ayer.cupos) ayer.cupos = ocupados(reservas, ayer.id);
  }

  /* ── messages (WhatsApp Cloud API, test mode) ── */
  const conv = (id, cl, nombre, whatsapp, mensajes, ventanaHoras, noLeidos, etiquetas = []) => ({
    id, whatsapp, nombre, clienta: cl ? { id: cl.id, nombre: cl.nombre } : null, noLeidos, estado: "abierta", etiquetas,
    ventanaHasta: ventanaHoras > 0 ? iso(ahora + ventanaHoras * 3600000) : null, mensajes,
  });
  const msg = (dir, texto, haceMin, extra = {}) => ({ direccion: dir, texto, ts: iso(ahora - haceMin * 60000), tipo: "texto", ...extra });
  const manuela = porNombre("Manuela"), camila = porNombre("Camila"), gabriela = porNombre("Gabriela"), sofia = porNombre("Sofía");
  const conversaciones = [
    conv("W-1", manuela, manuela.nombre, manuela.whatsapp, [
      msg("entrante", "¡Hola! Acabo de reservar la clase de prueba por la página 🙌", 24),
      msg("entrante", "Te envío el comprobante de Nequi", 22),
      msg("entrante", "", 22, { tipo: "imagen", media: { tipo: "imagen", id: "demo", mime: "image/jpeg" } }),
    ], 23.6, 3, ["Prueba"]),
    conv("W-2", null, "+57 301 555 4410", "573015554410", [
      msg("entrante", "Buenas tardes, ¿cuánto vale la clase de prueba? ¿Y qué días hay clase?", 95),
    ], 22.4, 1),
    conv("W-3", camila, camila.nombre, camila.whatsapp, [
      msg("entrante", "Ana, ¿puedo llevar a una amiga el sábado?", 300),
      msg("saliente", "¡Claro! Que reserve por la página y le apartamos el columpio a tu lado 💚", 290, { autor: { tipo: "admin", nombre: "Ana" }, estado: "leido" }),
      msg("entrante", "Listo, ya le pasé el enlace", 280),
    ], 19, 0, ["Trae amigas"]),
    conv("W-4", gabriela, gabriela.nombre, gabriela.whatsapp, [
      msg("entrante", "Hola, ¿hay cupo para el sábado a las 8?", 60 * 50),
      msg("saliente", "Hola Gabriela, por ahora está llena. Te dejé en la lista de espera y te aviso si se libera un columpio.", 60 * 49, { autor: { tipo: "admin", nombre: "Ana" }, estado: "leido" }),
    ], 0, 0),
    conv("W-5", sofia, sofia.nombre, sofia.whatsapp, [
      msg("saliente", "Hola Sofía, se te acabaron las clases de tu plan. ¿Te lo renuevo?", 60 * 75, { tipo: "plantilla", plantilla: "renovar_plan", autor: { tipo: "admin", nombre: "Ana" }, estado: "entregado" }),
    ], 0, 0),
  ];

  /* ── news for the bell, and the audit log ── */
  const ev = (tipo, titulo, detalle, haceMin, extra = {}) => ({ id: "EV-" + tipo + "-" + haceMin, ts: iso(ahora - haceMin * 60000), tipo, titulo, detalle, actor: { tipo: "sistema", nombre: "Casa Lotus" }, ...extra });
  const eventos = [
    ev("reserva-web", "Nueva reserva web", `${manuela.nombre} · clase de prueba`, 25, { clienta: manuela.id }),
    ev("espera", "Lista de espera", "Elena Patiño espera un columpio el sábado", 480),
    ev("reserva-web", "Nueva reserva web", "Tatiana Lozano · espera el pago", 180, { clienta: porNombre("Tatiana").id }),
    ev("cancelacion", "Canceló a tiempo", "Andrea Villamil · la clase volvió a su plan", 360, { clienta: porNombre("Andrea").id }),
    ev("pago", "Pago registrado", "Camila Peñaranda · 12 clases al mes", 60 * 26, { clienta: camila.id, actor: { tipo: "admin", nombre: "Ana" } }),
    ev("asistencia", "Asistencia marcada", "Salomé marcó la clase del sábado", 60 * 40, { actor: { tipo: "profe", nombre: "Salomé" } }),
  ];
  const registro = eventos.map((e) => ({ ts: e.ts, actor: { tipo: e.actor.tipo, id: e.actor.tipo === "admin" ? "U-1" : "", nombre: e.actor.nombre }, accion: e.tipo, objeto: e.clienta || "", detalle: e.detalle }));

  return {
    version: 1, dia: hoy,
    ajustes: AJUSTES_DEFECTO.map(([ajuste, valor, ayuda]) => ({ ajuste, valor, ayuda })),
    planes: PLANES.map((p) => ({ ...p })),
    horario: HORARIO.map((h) => ({ ...h, id: h.dia + " " + h.hora })),
    clases, clientas: clientas.map(({ _g, ...c }) => c), compras, reservas, espera,
    equipo: EQUIPO.map((u, i) => ({ ...u, activa: true, foto: "", creada: sumarDias(hoy, -200 + i * 20), ultimoAcceso: iso(ahora - (i + 1) * 3 * 3600000) })),
    eventos, registro, conversaciones,
    plantillas: PLANTILLAS,
    sesiones: [],
    invitaciones: {},
    contadores: { E: 3, W: 5, M: 100, EV: 0 },
  };
}

const INTERESES_IDX = [
  "Desarrollar fuerza, flexibilidad y conciencia corporal",
  "Reducir niveles de estrés / ansiedad",
  "Objetivos estéticos: bajar de peso / tono muscular",
  "Progreso físico hacia posturas más avanzadas y acrobáticas",
  "Aprender sobre meditación, mindfulness o técnicas de respiración",
  "Incorporar buenos hábitos, disciplina y constancia",
  "Mejorar la calidad de sueño y relajación",
  "Construir comunidad en torno al bienestar",
];

export const PLANTILLAS = [
  { nombre: "recordatorio_clase", categoria: "UTILITY", idioma: "es", cuerpo: "Hola {{1}}, te esperamos {{2}} a las {{3}} en Casa Lotus. Llega 10 minutos antes. Si no puedes venir, avísanos con tiempo.", variables: ["nombre", "dia", "hora"], estadoMeta: "APPROVED", uso: "Un día antes de cada clase" },
  { nombre: "confirmacion_pago", categoria: "UTILITY", idioma: "es", cuerpo: "Hola {{1}}, recibimos tu pago. Tu columpio del {{2}} está confirmado. ¡Nos vemos!", variables: ["nombre", "clase"], estadoMeta: "APPROVED", uso: "Al confirmar un pago" },
  { nombre: "cupo_liberado", categoria: "UTILITY", idioma: "es", cuerpo: "Hola {{1}}, se liberó un columpio para el {{2}}. ¿Lo quieres? Responde SÍ y te lo apartamos.", variables: ["nombre", "clase"], estadoMeta: "APPROVED", uso: "Lista de espera" },
  { nombre: "renovar_plan", categoria: "MARKETING", idioma: "es", cuerpo: "Hola {{1}}, se acabaron las clases de tu plan. ¿Quieres renovarlo? Te esperamos en el aire.", variables: ["nombre"], estadoMeta: "PENDING", uso: "Saldo en cero" },
  { nombre: "codigo_acceso", categoria: "AUTHENTICATION", idioma: "es", cuerpo: "Tu código de Casa Lotus es {{1}}. Vence en 10 minutos.", variables: ["codigo"], estadoMeta: "APPROVED", uso: "Entrar a la app" },
];

export { momentoMs };
