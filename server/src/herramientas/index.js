// Casa Lotus · the domain as a typed tool catalog for a future AI agent (CONTRATO §7).
// Each tool: nombre, descripcion (Spanish, written for an agent), JSON schema of its input, rol,
// soloLectura, and a handler that calls the SAME domain functions the REST routes use.
// Write tools need an actor and are audited with actor.tipo = "ia".
import * as E from "../dominio/esquemas.js";
import { listarClientas, segmentos, verClienta, SEGMENTOS, ETAPAS, ORDENES_CLIENTAS } from "../dominio/clientas.js";
import { agenda, disponibilidad, verClase, editarClase } from "../dominio/clases.js";
import { reservar, cancelar, reagendar, confirmar, listarEspera, unirseEspera, tomarCupo, asistencia } from "../dominio/reservas.js";
import { listarProfes } from "../dominio/asignacion.js";
import { registrarPago, planes } from "../dominio/pagos.js";
import { tablero } from "../dominio/tablero.js";
import { anotarRegistro } from "../dominio/registro.js";
import { validar } from "../rutas/validar.js";
import { sinPermiso, validacion } from "../errores.js";

const { z } = E;
const vacio = z.object({});

export const HERRAMIENTAS = [
  {
    nombre: "ver_tablero", rol: "admin", soloLectura: true, entrada: vacio,
    descripcion: "Resumen del día del estudio: ocupación de la semana (el número que manda), clases de hoy y mañana, asistencias por marcar, reservas que esperan el pago y alertas ordenadas por urgencia. Úsala primero para saber qué necesita atención.",
    manejar: (ctx) => tablero(ctx),
  },
  {
    nombre: "listar_segmentos", rol: "admin", soloLectura: true, entrada: vacio,
    descripcion: "Los segmentos de clientas con cuántas hay en cada uno (agendadas, con clases, les quedan poquitas, vence pronto, renovar, deben un pago, vinieron a prueba, nuevas, inactivas, cumpleaños, ficha incompleta, interesadas).",
    manejar: (ctx) => segmentos(ctx),
  },
  {
    nombre: "buscar_clientas", rol: "admin", soloLectura: true,
    entrada: z.object({
      segmento: z.enum(SEGMENTOS.map((s) => s.id)).optional().describe("id del segmento, por ejemplo «poquitas» o «prueba»"),
      q: z.string().max(80).optional().describe("texto a buscar en nombre, WhatsApp, correo o etiquetas"),
      etapa: z.enum(ETAPAS).optional().describe("lead, prueba, activa, en-riesgo o inactiva"),
      orden: z.enum(ORDENES_CLIENTAS).optional().describe("nombre, reciente, saldo, proxima (próxima clase primero) o visita (última visita primero)"),
    }),
    descripcion: "Busca clientas por segmento y/o texto. Devuelve para cada una su etapa (lead, prueba, activa, en-riesgo, inactiva), saldo de clases, próxima clase y última visita. No incluye datos de salud.",
    manejar: (ctx, _a, i) => listarClientas(ctx, i),
  },
  {
    nombre: "ver_clienta", rol: "admin", soloLectura: true, entrada: z.object({ id: E.idClienta.describe("id de la clienta, como C-0003") }),
    descripcion: "Ficha completa de una clienta: perfil, autorizaciones, compras, reservas, lista de espera y línea de tiempo. Contiene datos de salud: úsalos solo para cuidar a la persona, nunca los repitas a terceros.",
    manejar: (ctx, _a, i) => verClienta(ctx, i.id),
  },
  {
    nombre: "ver_agenda", rol: "admin", soloLectura: true,
    entrada: z.object({ desde: E.fecha.optional(), hasta: E.fecha.optional() }),
    descripcion: "Clases entre dos fechas (aaaa-mm-dd) con profe, cupos, quién va, lista de espera y si falta marcar asistencia. Sin fechas: de hace 7 días a 21 días adelante.",
    manejar: (ctx, _a, i) => agenda(ctx, i),
  },
  {
    nombre: "ver_clase", rol: "admin", soloLectura: true, entrada: z.object({ id: E.claseId.describe("id de la clase: «aaaa-mm-dd HH:mm»") }),
    descripcion: "Detalle de una clase: asistentes con su estado, primera vez, cumpleaños, y la lista de espera.",
    manejar: (ctx, _a, i) => verClase(ctx, i.id),
  },
  {
    nombre: "ver_disponibilidad", rol: "publico", soloLectura: true,
    entrada: z.object({ desde: E.fecha.optional(), dias: z.number().int().min(1).max(60).optional() }),
    descripcion: "Cupos libres de las próximas clases (solo conteos, sin nombres). Sirve para proponer horarios a alguien que quiere reservar.",
    manejar: (ctx, _a, i) => disponibilidad(ctx, i),
  },
  {
    nombre: "ver_planes", rol: "publico", soloLectura: true, entrada: vacio,
    descripcion: "Planes activos con su número de clases, precio en pesos colombianos y vigencia en días.",
    manejar: (ctx) => planes(ctx, { soloActivos: true }),
  },
  {
    nombre: "reservar_clase", rol: "admin", soloLectura: false,
    entrada: z.object({ clienta: E.idClienta, clase: E.claseId }),
    descripcion: "Reserva un columpio para una clienta. Si tiene un plan vigente que cubre la fecha, queda confirmada y gasta una clase; si no, queda «Pendiente de pago» guardando el cupo unas horas. Falla si la clase está llena (ofrece la lista de espera) o cancelada.",
    manejar: (ctx, a, i) => reservar(ctx, a, i),
  },
  {
    nombre: "cancelar_reserva", rol: "admin", soloLectura: false,
    entrada: z.object({ reserva: E.idReserva, sinCosto: z.boolean().optional().describe("solo si Ana lo autoriza: devuelve la clase aunque sea tarde") }),
    descripcion: "Cancela una reserva. Con el aviso mínimo la clase vuelve al plan; con menos aviso se libera el columpio pero la clase se descuenta («Cancelada tarde»). Una reserva sin pagar simplemente se cancela. Si alguien espera ese cupo, avisa.",
    manejar: (ctx, a, i) => cancelar(ctx, a, i.reserva, { sinCosto: i.sinCosto }),
  },
  {
    nombre: "reagendar_reserva", rol: "admin", soloLectura: false,
    entrada: z.object({ reserva: E.idReserva, clase: E.claseId.describe("la clase nueva") }),
    descripcion: "Mueve una reserva a otra clase en un solo paso: crea la nueva y cancela la anterior (la clase vuelve al plan). La nueva clase debe tener cupo.",
    manejar: (ctx, a, i) => reagendar(ctx, a, i.reserva, i.clase),
  },
  {
    nombre: "confirmar_reserva", rol: "admin", soloLectura: false,
    entrada: z.object({ reserva: E.idReserva, pago: E.pago.optional().describe("el pago recibido, si lo hubo: plan, medio y valor") }),
    descripcion: "Confirma una reserva «Pendiente de pago» cuando llegó el comprobante. Si se indica el pago, primero lo registra y la reserva queda cargada a ese plan.",
    manejar: (ctx, a, i) => confirmar(ctx, a, i.reserva, { pago: i.pago }),
  },
  {
    nombre: "registrar_pago", rol: "admin", soloLectura: false,
    entrada: E.pago.extend({ clienta: E.idClienta }),
    descripcion: "Registra la compra de un plan (una fila en Compras). El saldo de clases se calcula solo; nunca se escribe a mano.",
    manejar: (ctx, a, i) => registrarPago(ctx, a, i),
  },
  {
    nombre: "ver_lista_de_espera", rol: "admin", soloLectura: true, entrada: vacio,
    descripcion: "Personas esperando un cupo en clases de hoy en adelante, en orden de llegada.",
    manejar: (ctx) => listarEspera(ctx),
  },
  {
    nombre: "anotar_en_espera", rol: "admin", soloLectura: false, entrada: z.object({ clienta: E.idClienta, clase: E.claseId }),
    descripcion: "Anota a una clienta en la lista de espera de una clase.",
    manejar: (ctx, a, i) => unirseEspera(ctx, a, i),
  },
  {
    nombre: "listar_profes", rol: "admin", soloLectura: true, entrada: vacio,
    descripcion: "Profes del equipo (y personas administradoras que dan clase) con el nombre que se usa en el horario. Solo a estas personas se les puede asignar una clase.",
    manejar: (ctx) => listarProfes(ctx),
  },
  {
    nombre: "asignar_profe", rol: "admin", soloLectura: false,
    entrada: z.object({ clase: E.claseId, profe: z.string().max(60).describe("nombre en el horario de alguien del equipo activo, o «Por confirmar»") }),
    descripcion: "Asigna quién dicta una clase. Solo acepta a alguien activo del equipo (ver listar_profes) o «Por confirmar». Cierra el pedido de reemplazo de esa clase y le avisa a la persona asignada.",
    manejar: (ctx, a, i) => editarClase(ctx, a, i.clase, { profe: i.profe }),
  },
  {
    nombre: "marcar_asistencia", rol: "admin", soloLectura: false,
    entrada: z.object({ reserva: E.idReserva, vino: z.boolean() }),
    descripcion: "Marca si una persona vino («Asistió») o no («No vino») a una clase que ya pasó. Las dos gastan la clase del plan.",
    manejar: (ctx, a, i) => asistencia(ctx, a, i.reserva, i.vino),
  },
  {
    nombre: "dar_cupo_de_espera", rol: "admin", soloLectura: false, entrada: z.object({ espera: E.idEspera }),
    descripcion: "La persona de la lista de espera toma el cupo libre: se crea su reserva (confirmada si tiene plan, si no pendiente de pago).",
    manejar: (ctx, a, i) => tomarCupo(ctx, a, i.espera),
  },
];

const porNombre = new Map(HERRAMIENTAS.map((h) => [h.nombre, h]));

/** The catalog as an agent sees it: JSON schemas, no handlers. */
export function catalogo({ rol } = {}) {
  return HERRAMIENTAS.filter((h) => !rol || h.rol === rol || h.rol === "publico" || rol === "admin").map((h) => ({
    nombre: h.nombre, descripcion: h.descripcion, rol: h.rol, soloLectura: h.soloLectura,
    esquema: z.toJSONSchema(h.entrada, { io: "input", unrepresentable: "any" }),
  }));
}

/**
 * Runs a tool for an agent. actor: { tipo: "ia", id, nombre, rol: "admin" } — the role the agent acts
 * with. Writes are audited (the domain records them with this actor; the call itself too).
 */
export async function ejecutar(ctx, nombre, actor, entrada) {
  const h = porNombre.get(nombre);
  if (!h) throw validacion("No existe la herramienta «" + nombre + "».");
  if (!actor || actor.tipo !== "ia") throw sinPermiso("Las herramientas se usan con un actor de tipo «ia».");
  if (h.rol === "admin" && actor.rol !== "admin") throw sinPermiso("Esta herramienta es solo para el equipo administrador.");
  const datos = validar(h.entrada, entrada);
  if (!h.soloLectura) anotarRegistro(ctx, actor, "ia." + nombre, "", { entrada: datos });
  return h.manejar(ctx, actor, datos);
}
