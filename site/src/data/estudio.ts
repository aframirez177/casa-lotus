// Casa Lotus · public facts the site states. One place, so a price or a rule changes once.
// Everything here is already public (Ana's pieces, the v1 site). Business figures, Ana's ID and
// bank account numbers never go in this repo: it is public.
import type { ImageMetadata } from "astro";
import multinivel from "../assets/images/clases/multinivel.webp";
import yoga from "../assets/images/clases/yoga.webp";
import stretch from "../assets/images/clases/stretch.webp";
import pilates from "../assets/images/clases/pilates.webp";

export const SITIO = "https://casalotus.studio";

export const ESTUDIO = {
  nombre: "Casa Lotus",
  lema: "Suelta el peso.",
  descripcion:
    "Estudio boutique de yoga, pilates y stretch aéreo en Bogotá. Clases semipersonalizadas con cupos limitados, en una casa. Centro autorizado AÉREO®.",
  pilares: ["el cuerpo", "la mente", "el alma"],
  ciudad: "Bogotá",
  region: "Bogotá D.C.",
  pais: "CO",
  correo: "casalotusbogota@gmail.com",
  /** bookings and cancellations (not the payments number) */
  whatsapp: "573128720888",
  whatsappTexto: "312 872 0888",
  /** Nequi / DaviPlata / Bre-B key. Never the bank account number. */
  llavePago: "319 328 8469",
  mediosPago: ["Nequi", "DaviPlata", "Bre-B"],
  redes: {
    instagram: "https://www.instagram.com/casalotusbogota/",
    tiktok: "https://www.tiktok.com/@casalotus.aereo",
  },
  /** the founder and owner, named on /nosotros/ */
  ana: { nombre: "Ana Caona" },
} as const;

/* ── prices (COP). Source: Ana's «Planes 2026» piece ───────────────────── */

export const PRUEBA = { nombre: "Clase de prueba", precio: 25000 } as const;

export interface Plan {
  clases: number;            // classes per month
  mes: number;               // monthly price
  trimestre: number;         // quarterly price (3 months)
  mejor?: boolean;
}
export const PLANES: Plan[] = [
  { clases: 4, mes: 158000, trimestre: 440000 },
  { clases: 8, mes: 263000, trimestre: 750000 },
  { clases: 12, mes: 330000, trimestre: 950000 },
  { clases: 16, mes: 390000, trimestre: 1111000, mejor: true },
];

/** "$158.000" — COP, dot thousands (same rule as shared/reglas.js dinero()). */
export const dinero = (n: number) => "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const porClase = (p: Plan, periodo: "mes" | "trimestre" = "mes") =>
  periodo === "mes" ? p.mes / p.clases : p.trimestre / (p.clases * 3);

/* ── policies (Ana's «Condiciones y recomendaciones», «Prepárate para tu clase de prueba»,
      and the platform defaults in shared/CONTRATO.md §2 Ajustes) ───────────────────── */

export const POLITICAS = {
  horasReservar: 3,
  horasCancelar: 6,
  cambiosPrueba: 1,
  minutosTolerancia: 15,
  horasQuorum: 2,
} as const;

/* ── classes ─────────────────────────────────────────────────────────────── */

export interface Clase {
  slug: "yoga-aereo-multinivel" | "yoga-aereo" | "stretch-aereo" | "pilates-aereo";
  /** the name as Ana writes it, and as the Sheet's «Clase» column holds it */
  nombre: string;
  corto: string;             // tag on the card
  ref: string;               // v1 attribution ref
  color: string;             // class code (tokens.css)
  colorVar: string;
  foto: ImageMetadata;
  alt: string;
  beneficios: [string, string, string]; // verbatim from Ana's class piece
}

export const CLASES: Clase[] = [
  {
    slug: "yoga-aereo-multinivel",
    nombre: "Yoga Aéreo multinivel",
    corto: "La más versátil",
    ref: "WEB-CLASE-MULTINIVEL",
    color: "#B2D4E0",
    colorVar: "var(--c-multinivel)",
    foto: multinivel,
    alt: "Alumna colgada de cabeza en el columpio, frente a la pared verde menta de la sala",
    beneficios: [
      "Explora todos los estilos del Método Aéreo.",
      "Clases adaptadas a todos los niveles.",
      "Combina fuerza, flexibilidad y relajación.",
    ],
  },
  {
    slug: "yoga-aereo",
    nombre: "Yoga Aéreo",
    corto: "Calma",
    ref: "WEB-CLASE-YOGA",
    color: "#B7DFC5",
    colorVar: "var(--c-yoga)",
    foto: yoga,
    alt: "Alumna meditando con los ojos cerrados, sentada entre las telas del columpio",
    beneficios: [
      "Alivia el estrés y la ansiedad con respiración y posturas invertidas.",
      "Desarrolla concentración y atención plena en movimiento.",
      "Descubre progresiones de las posturas clásicas del yoga en piso.",
    ],
  },
  {
    slug: "stretch-aereo",
    nombre: "Stretch Aéreo",
    corto: "Movilidad",
    ref: "WEB-CLASE-STRETCH",
    color: "#8AD4D6",
    colorVar: "var(--c-stretch)",
    foto: stretch,
    alt: "Alumna estirando la espalda en el tapete, con una pierna apoyada en el columpio",
    beneficios: [
      "Alivia la rigidez y la tensión muscular.",
      "Mejora tus rangos de movilidad y tu salud articular.",
      "Prepara tu cuerpo para mantenerlo sano, autónomo y funcional.",
    ],
  },
  {
    slug: "pilates-aereo",
    nombre: "Pilates Aéreo",
    corto: "Fuerza",
    ref: "WEB-CLASE-PILATES",
    color: "#D2F3A2",
    colorVar: "var(--c-pilates)",
    foto: pilates,
    alt: "Alumna sentada en el tapete con las manos detrás de la cabeza, en medio de la clase",
    beneficios: [
      "Corrige malos hábitos posturales y gana conciencia corporal.",
      "Desarrolla fuerza y resistencia muscular.",
      "Entrena el cuerpo de forma equilibrada y sin impacto.",
    ],
  },
];

/** Class of a Sheet name ("Pilates Aéreo", "pilates aereo"…), or undefined (Acro, Therapy…). */
export function claseDeNombre(nombre: string) {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (n.includes("multinivel")) return CLASES[0];
  if (n.includes("stretch")) return CLASES[2];
  if (n.includes("pilates")) return CLASES[3];
  if (n.includes("yoga") && n.includes("aereo")) return CLASES[1];
  return undefined;
}

/* ── weekly grid: the static fallback when the API does not answer ──────────
   Current grid (Wed 18:00 + 19:00, Sat 08:00 + 09:15). The class per slot is
   not decided yet (data-todo): the API fills it in when the Sheet has it. */
export interface Franja { dia: string; hora: string }
export const HORARIO_SEMANAL: Franja[] = [
  { dia: "Miércoles", hora: "18:00" },
  { dia: "Miércoles", hora: "19:00" },
  { dia: "Sábado", hora: "08:00" },
  { dia: "Sábado", hora: "09:15" },
];
export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const ABREV: Record<string, string> = { Lunes: "LUN", Martes: "MAR", Miércoles: "MIE", Jueves: "JUE", Viernes: "VIE", Sábado: "SAB", Domingo: "DOM" };
/** "WEB-HORARIO-SAB-0800" (v1 scheme). */
export const refHorario = (dia: string, hora: string) => `WEB-HORARIO-${ABREV[dia] ?? "DIA"}-${hora.replace(":", "")}`;
/** "8:00" + "a. m." */
export function hora12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return { hora: `${h % 12 || 12}:${String(m).padStart(2, "0")}`, sufijo: h < 12 ? "a. m." : "p. m." };
}

/* ── videos (public/assets/video). Durations from ffprobe; filmed in the studio. ── */

export interface Video {
  clave: string;
  nombre: string;
  descripcion: string;
  archivo: string;           // /assets/video/…mp4
  poster: string;            // /assets/video/…webp
  subtitulos?: string;
  duracion: string;          // ISO 8601
  duracionTexto?: string;
  fecha: string;             // uploadDate
  ancho: number;
  alto: number;
  cita?: string;
  ref?: string;
}
export const VIDEOS: Record<string, Video> = {
  primeraClase: {
    clave: "primera-clase",
    nombre: "Su primera clase de Pilates Aéreo en Casa Lotus",
    descripcion: "Una alumna que nunca había hecho pilates cuenta cómo le fue en su primera clase de Pilates Aéreo en Casa Lotus, Bogotá.",
    archivo: "/assets/video/primera-clase.mp4",
    poster: "/assets/video/primera-clase.webp",
    duracion: "PT38S",
    duracionTexto: "0:38",
    fecha: "2026-09-29",
    ancho: 720,
    alto: 1280,
    cita: "Nunca he hecho pilates. Hoy es mi primera clase.",
    ref: "WEB-VIDEO-PRIMERA",
  },
  testimonio1: {
    clave: "testimonio-1",
    nombre: "Testimonio: por qué practica yoga aéreo en Casa Lotus",
    descripcion: "Una alumna de Casa Lotus cuenta por qué practica yoga aéreo.",
    archivo: "/assets/video/testimonio-1.mp4",
    poster: "/assets/video/testimonio-1.webp",
    subtitulos: "/assets/video/testimonio-1.vtt",
    duracion: "PT22S",
    duracionTexto: "0:22",
    fecha: "2026-09-29",
    ancho: 720,
    alto: 1280,
    cita: "Uno se da cuenta de que tiene muchas capacidades y que puede hacer más de lo que cree.",
    ref: "WEB-VIDEO-TESTIMONIO-1",
  },
  testimonio2: {
    clave: "testimonio-2",
    nombre: "Testimonio: un lugar de puertas abiertas",
    descripcion: "Una alumna de Casa Lotus habla de entrenar en el aire y de la comunidad del estudio.",
    archivo: "/assets/video/testimonio-2.mp4",
    poster: "/assets/video/testimonio-2.webp",
    subtitulos: "/assets/video/testimonio-2.vtt",
    duracion: "PT13S",
    duracionTexto: "0:13",
    fecha: "2026-09-29",
    ancho: 720,
    alto: 1280,
    cita: "Este es un lugar de puertas abiertas. ¡Me encanta Casa Lotus!",
    ref: "WEB-VIDEO-TESTIMONIO-2",
  },
  testimonio3: {
    clave: "testimonio-3",
    nombre: "Testimonio: sentir todo el cuerpo",
    descripcion: "Una alumna de Casa Lotus explica qué le aporta el yoga aéreo a su práctica.",
    archivo: "/assets/video/testimonio-3.mp4",
    poster: "/assets/video/testimonio-3.webp",
    subtitulos: "/assets/video/testimonio-3.vtt",
    duracion: "PT6S",
    duracionTexto: "0:06",
    fecha: "2026-09-29",
    ancho: 720,
    alto: 1280,
    cita: "Me permite hacer mejor las posturas de yoga y sentir todo mi cuerpo.",
    ref: "WEB-VIDEO-TESTIMONIO-3",
  },
  metodo: {
    clave: "metodo",
    nombre: "Una práctica del Método Aéreo en Casa Lotus",
    descripcion: "Una alumna pasa por varias posturas invertidas en el columpio, en la sala de Casa Lotus en Bogotá.",
    archivo: "/assets/video/metodo.mp4",
    poster: "/assets/video/metodo.webp",
    duracion: "PT13S",
    fecha: "2026-09-29",
    ancho: 720,
    alto: 960,
  },
};
export const TESTIMONIOS = [VIDEOS.testimonio1, VIDEOS.testimonio2, VIDEOS.testimonio3];

/* ── Ana's rules (verbatim meaning, tidied). Shown on /clase-de-prueba/ and /terminos/. ── */

/** «Antes de volar… prepárate para tu clase de prueba» (Ana's piece, 9 cards). */
export const REGLAS_PRUEBA: { titulo: string; texto: string; todo?: string }[] = [
  { titulo: "Llega con tiempo", texto: "Sé puntual. Por seguridad, no se permite el ingreso después de 15 minutos de iniciada la clase." },
  { titulo: "Cancelaciones", texto: "Puedes cancelar tu clase de prueba con mínimo 6 horas de anticipación; si no, no se puede reprogramar." },
  {
    titulo: "Reprogramaciones",
    texto: "Puedes reprogramar tu clase de prueba una sola vez. Si vuelves a cancelar, debes pagarla de nuevo.",
    todo: "Ana's pieces disagree on the second payment ($25.000 vs $20.000): amount left out until she confirms",
  },
  { titulo: "Ropa adecuada", texto: "Usa ropa deportiva ajustada que cubra piernas y axilas. Evita shorts o prendas sueltas para que la tela no te roce." },
  { titulo: "Alimentación", texto: "No comas en las 2 horas previas para evitar malestar durante la práctica. Si lo necesitas, que sea algo ligero." },
  { titulo: "Condiciones médicas", texto: "Cuéntale a tu profe si tienes alguna condición médica, lesión o embarazo, para adaptar la práctica a ti." },
  { titulo: "Cuida tu salud", texto: "Evita venir si tienes síntomas respiratorios o infecciosos. Tómate un descanso si lo necesitas." },
  { titulo: "Cupo mínimo", texto: "La clase se puede cancelar hasta 2 horas antes si no se completa el mínimo de asistentes. Te avisamos por WhatsApp." },
  { titulo: "Registro audiovisual", texto: "Durante la clase pueden tomarse fotos o videos para redes sociales. Si no quieres aparecer, avísanos con anticipación." },
];

/** «Condiciones y recomendaciones» (Ana's piece, 14 rules), grouped. */
export const CONDICIONES: { grupo: string; reglas: string[] }[] = [
  {
    grupo: "Reservas y cancelaciones",
    reglas: [
      "Puedes reservar tus clases hasta 3 horas antes de que empiecen.",
      "Para cancelar una clase, hazlo con mínimo 6 horas de anticipación: la clase vuelve a tu plan. Pasado ese tiempo, se descuenta de tu plan.",
      "Si tienes que cancelar por una urgencia, avísanos al WhatsApp 312 872 0888.",
      "La escuela puede cancelar una clase hasta 2 horas antes si no hay un mínimo de dos asistentes.",
      "Los días festivos no hay clase.",
    ],
  },
  {
    grupo: "Planes y pagos",
    reglas: [
      "Los planes son personales e intransferibles.",
      "Los planes no se congelan: su vigencia corre sin interrupción desde la fecha de inicio.",
      "No hacemos reembolsos de dinero bajo ninguna causa.",
    ],
  },
  {
    grupo: "Tu práctica",
    reglas: [
      "Al inscribirte aceptas el descargo de responsabilidad. Practica con cuidado, respetando tus límites.",
      "Cuéntale a tu profe si tienes alguna condición médica particular.",
      "Evita comer en las 2 horas previas a la clase. Si lo necesitas, que sea algo ligero.",
      "Usa ropa deportiva ajustada. Evita los shorts para que la tela no te lastime.",
      "Evita venir si tienes síntomas respiratorios o infecciosos. Si es necesario, usa tapabocas.",
    ],
  },
  {
    grupo: "En la sala",
    reglas: [
      "En la sala tienes los implementos para la práctica, tapete incluido. Traer el tuyo es opcional.",
      "Trae tu botella de agua: aquí la recargas. Queremos usar la menor cantidad posible de vasos plásticos.",
      "Puede que tomemos fotos durante la clase para nuestras redes. Si no estás de acuerdo, avísanos con anticipación.",
      "Mantén tu celular en silencio. Permítete un espacio para ti.",
    ],
  },
];
