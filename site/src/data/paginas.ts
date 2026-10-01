// Casa Lotus · per-page metadata, in ONE module so the SEO / SEM / AEO / GEO plan can be
// reconciled here without touching components: <title>, meta description, H1, intro, target
// keywords, Open Graph text, breadcrumb, schema.org inputs, FAQ items and the page's main CTA.
//
// Copy rules: Colombian neutral Spanish in Ana's voice (tú). Never gender the teachers («profe»,
// «tu profe»). Never state a swing or class-size number («cupos limitados, clases
// semipersonalizadas»). Prices in COP written $25.000. Unknown facts are flagged with `todo`
// (rendered as data-todo) instead of invented.

export interface Faq {
  pregunta: string;
  respuesta: string;
  /** content pending confirmation with Ana: rendered with data-todo */
  todo?: string;
}

export type TipoPagina = "WebPage" | "CollectionPage" | "AboutPage" | "FAQPage" | "ContactPage";

export interface Pagina {
  /** id: also the Open Graph image name (/og/<clave>.png) */
  clave: string;
  ruta: string;
  /** <title> */
  titulo: string;
  /** meta description, ~150–160 characters */
  descripcion: string;
  h1: string;
  /** home only: the display line shown above the H1 («Suelta el peso.») */
  lema?: string;
  eyebrow?: string;
  /** the lead under the H1 */
  intro?: string;
  /** search intents this page answers (for the SEO plan; not emitted as a meta tag) */
  palabrasClave: string[];
  og: {
    titulo: string;
    descripcion: string;
    alt: string;
    /** class-colour field on the OG image */
    color?: string;
    etiqueta?: string;
  };
  /** breadcrumb trail after «Inicio» (the last item is this page) */
  migas: { nombre: string; ruta: string }[];
  /** schema.org inputs (docs/seo/plan.md §3): which nodes this page's @graph carries */
  schema: {
    tipo: TipoPagina;
    /** WebSite node (home only: Google reads it there) */
    sitio?: boolean;
    /** a Service for this page (one per class, and the method) */
    servicio?: { nombre: string; tipo: string; descripcion: string };
    /** the «all classes» Service (/clases/#clases-aereas) and, on /clases/, the ItemList of class services */
    clases?: boolean;
    /** the trial Offer (/clase-de-prueba/#oferta) */
    oferta?: boolean;
    /** the plans OfferCatalog (/planes/#catalogo) */
    planes?: boolean;
    /** VideoObject keys from VIDEOS (only videos shown on the page) */
    videos?: string[];
    /** Person node for Ana */
    persona?: boolean;
  };
  faq?: Faq[];
  /** page-scoped attribution prefix: hero → WEB-<ref>-HERO, closing → WEB-<ref>-CIERRE */
  ref: string;
  cta: { texto: string; plan?: string };
  indexar?: boolean;
  /** og:type (default website) */
  ogTipo?: "website" | "article";
}

/* ── FAQ bank ─────────────────────────────────────────────────────────────────
   Reconciled with the SEO/AEO plan (docs/seo/paginas.json, 2026-10-01). Only items the plan marks as
   publishable, plus a few from Ana's own published pieces. Items the plan marks `confirmar: true`
   (address/barrio, duration, max weight, pregnancy, age, men, vertigo, inversions, private classes,
   jewellery, photos wording) stay out until Ana confirms them. */

export const FAQ = {
  queEs: {
    pregunta: "¿Qué es el yoga aéreo?",
    respuesta:
      "El yoga aéreo es una práctica de yoga en la que usas un columpio de tela suspendido como apoyo. La tela sostiene parte de tu peso, así que puedes hacer posturas, estiramientos e inversiones con menos carga en la espalda y las articulaciones. En Casa Lotus lo enseñamos con el Método Aéreo.",
  },
  experiencia: {
    pregunta: "¿Necesito experiencia o ser flexible para hacer yoga aéreo?",
    respuesta:
      "No. Todas las clases del Método Aéreo en Casa Lotus son aptas para principiantes: puedes empezar por la que más te llame, sin experiencia ni flexibilidad previa. Cada postura tiene una versión más sencilla y tu profe la adapta a tu cuerpo. La fuerza y la flexibilidad llegan con la práctica.",
  },
  cuanto: {
    pregunta: "¿Cuánto cuesta una clase de yoga aéreo en Bogotá?",
    respuesta:
      "En Casa Lotus la clase de prueba cuesta $25.000. Los planes mensuales de 2026 son: 4 clases por $158.000, 8 por $263.000, 12 por $330.000 y 16 por $390.000. Entre más clases tomas, menos pagas por cada una: de $39.500 a $24.375. También hay planes trimestrales.",
  },
  primera: {
    pregunta: "¿Cómo es la primera clase de yoga aéreo?",
    respuesta:
      "Llegas diez minutos antes, diligencias el formulario de exención de responsabilidad y tu profe te explica cómo usar el columpio. Cada postura tiene una versión más sencilla, así que vas a tu ritmo. Si nunca has practicado, no pasa nada: así empezamos todos. Trae tu botella de agua.",
    todo: "first-class walkthrough to confirm with Ana (the waiver is now accepted online when booking)",
  },
  diferencia: {
    pregunta: "¿Cuál es la diferencia entre yoga aéreo y pilates aéreo?",
    respuesta:
      "Las dos usan el mismo columpio del Método Aéreo. El yoga aéreo trabaja la respiración, la atención plena y las posturas invertidas para soltar el estrés. El pilates aéreo se enfoca en la postura, el control del centro del cuerpo y la fuerza y resistencia muscular, sin impacto. Ambas son aptas para principiantes.",
  },
  stretch: {
    pregunta: "¿Qué es el stretch aéreo?",
    respuesta:
      "El stretch aéreo es una clase de estiramiento y movilidad en el columpio. La tela te sostiene para que alargues los músculos y ganes rango de movimiento sin forzar las articulaciones. Ayuda a aliviar la rigidez y la tensión muscular, y a mantener el cuerpo sano, autónomo y funcional. Es apta para principiantes.",
  },
  multinivel: {
    pregunta: "¿Qué es el yoga aéreo multinivel?",
    respuesta:
      "Es nuestra clase más versátil: explora todos los estilos del Método Aéreo y combina fuerza, flexibilidad y relajación en una misma sesión. Se adapta a cada nivel dentro del grupo, así que en la misma clase practican quienes empiezan y quienes ya tienen experiencia. Tu profe ajusta cada postura a tu cuerpo.",
  },
  metodo: {
    pregunta: "¿Qué es el Método Aéreo y qué significa centro autorizado?",
    respuesta:
      "El Método Aéreo (AÉREO®) es un sistema de entrenamiento en suspensión, creado en Bogotá, que integra yoga, pilates y estiramiento en un columpio. Un centro autorizado tiene licencia para usar la marca y el método. En Casa Lotus todo el equipo de profes está certificado en el Método Aéreo.",
  },
  lesion: {
    pregunta: "¿Puedo hacer yoga aéreo si tengo una lesión o una patología?",
    respuesta:
      "Sí, puedes venir con distintas patologías. Lo importante es que no llegues en un pico de dolor: si hoy te duele fuerte, reprograma tu clase y vienes cuando baje. Antes de empezar, cuéntale a tu profe sobre lesiones, cirugías recientes o condiciones médicas para que adapte la práctica.",
  },
  reservar: {
    pregunta: "¿Cómo reservo mi clase de prueba?",
    respuesta:
      "Elige tu horario en casalotus.studio o escríbenos por WhatsApp al 312 872 0888. Paga $25.000 por Nequi, DaviPlata o Bre-B a la llave 319 328 8469 y envía la captura del comprobante por el mismo chat. Cuando la recibimos, tu cupo queda reservado. Reserva mínimo tres horas antes.",
  },
  ropa: {
    pregunta: "¿Qué ropa me pongo para la clase?",
    respuesta: "Ropa deportiva ajustada que cubra piernas y axilas. Evita los shorts y las prendas sueltas para que la tela no te roce.",
  },
  comer: {
    pregunta: "¿Puedo comer antes de la clase?",
    respuesta:
      "Mejor no comer en las dos horas previas: en la clase hay inversiones y giros, y con el estómago lleno se sienten incómodos. Si lo necesitas, come algo ligero, como una fruta. Hidrátate durante el día y trae tu botella de agua; en la sala la puedes recargar.",
  },
  tapete: {
    pregunta: "¿Tengo que llevar tapete o algo especial?",
    respuesta:
      "No. En la sala tienes todo lo necesario, tapete incluido. Trae tu botella de agua: aquí la recargas y así usamos menos plástico. Ven con ropa deportiva ajustada que cubra piernas y axilas y llega diez minutos antes, sobre todo si es tu primera clase.",
  },
  tarde: {
    pregunta: "¿Qué pasa si llego tarde?",
    respuesta:
      "Por seguridad, no se permite el ingreso después de 15 minutos de iniciada la clase. Llega diez minutos antes para acomodarte con calma.",
  },
  cancelar: {
    pregunta: "¿Cómo cancelo o reprogramo una clase?",
    respuesta:
      "Avísanos por WhatsApp al 312 872 0888 con mínimo seis horas de anticipación y la clase vuelve a tu plan. Si avisas después, la clase se descuenta. La clase de prueba se puede reprogramar una sola vez. Los planes no se congelan y no hacemos reembolsos.",
  },
  pruebaCambios: {
    pregunta: "¿Puedo cambiar la fecha de mi clase de prueba?",
    respuesta:
      "Sí, una vez, avisando con mínimo 6 horas de anticipación. Si cancelas con menos tiempo, la clase no se puede reprogramar; y si vuelves a cancelar después de reprogramarla, debes pagarla de nuevo.",
  },
  quorum: {
    pregunta: "¿Pueden cancelar una clase si somos pocos?",
    respuesta: "Sí: la escuela puede cancelar una clase hasta 2 horas antes si no hay un mínimo de dos asistentes. Te avisamos por WhatsApp.",
    todo: "minimum quorum: published in Ana's pieces, still to reconfirm",
  },
  pagos: {
    pregunta: "¿Qué medios de pago aceptan?",
    respuesta:
      "Nequi, DaviPlata y Bre-B a la llave 319 328 8469. Si prefieres transferencia bancaria, te enviamos los datos por WhatsApp. Pagas antes de la clase y envías la captura del comprobante al 312 872 0888 para confirmar tu cupo. Por ahora no recibimos tarjeta de crédito en línea.",
  },
  congelar: {
    pregunta: "¿Los planes se pueden congelar o compartir?",
    respuesta:
      "No. Los planes son personales, no se congelan y su vigencia corre desde la fecha de inicio. Tampoco hacemos reembolsos. Si no puedes asistir a una clase, avísanos por WhatsApp con mínimo seis horas de anticipación para que no se descuente de tu plan.",
  },
  trimestral: {
    pregunta: "¿Qué ventaja tiene el plan trimestral?",
    respuesta:
      "Pagas tres meses de una vez y cada clase te sale más barata. Por ejemplo, con 8 clases al mes ahorras $39.000 frente a pagar mes a mes, y con 16 clases ahorras $59.000.",
  },
  horarios: {
    pregunta: "¿Qué horarios tienen y hay clases los festivos?",
    respuesta:
      "Hoy hay clases los miércoles a las 6:00 p. m. y a las 7:00 p. m., y los sábados a las 8:00 a. m. y a las 9:15 a. m. No hay clases los días festivos. Estamos abriendo horarios nuevos: si el tuyo no aparece, escríbenos por WhatsApp y te avisamos.",
  },
  cupos: {
    pregunta: "¿Cuántas personas hay en cada clase?",
    respuesta:
      "Pocas, a propósito: los cupos son limitados para que las clases sean semipersonalizadas y tu profe esté pendiente de ti.",
  },
  donde: {
    pregunta: "¿Dónde queda Casa Lotus?",
    respuesta: "En Bogotá. Te enviamos la dirección exacta por WhatsApp cuando reservas tu clase.",
    todo: "address or neighbourhood to publish, pending with Ana",
  },
} satisfies Record<string, Faq>;

/** /preguntas/ groups (every FAQ once). */
export const GRUPOS_FAQ: { titulo: string; id: string; items: Faq[] }[] = [
  { titulo: "Antes de tu primera clase", id: "primera-clase", items: [FAQ.queEs, FAQ.experiencia, FAQ.primera, FAQ.cuanto, FAQ.reservar, FAQ.ropa, FAQ.comer, FAQ.tapete, FAQ.tarde] },
  { titulo: "Pagos, cambios y cancelaciones", id: "reservas", items: [FAQ.pagos, FAQ.cancelar, FAQ.pruebaCambios, FAQ.quorum, FAQ.horarios] },
  { titulo: "Planes", id: "planes", items: [FAQ.congelar, FAQ.trimestral] },
  { titulo: "Salud y cuidado", id: "salud", items: [FAQ.lesion] },
  { titulo: "Las clases y el método", id: "metodo", items: [FAQ.diferencia, FAQ.stretch, FAQ.multinivel, FAQ.metodo, FAQ.cupos, FAQ.donde] },
];

/* ── pages ─────────────────────────────────────────────────────────────────────
   title / description / H1 / keywords / schema types: docs/seo/paginas.json (2026-10-01).
   intro, eyebrow and OG text are the site's own copy. */

const PRUEBA_CTA = { texto: "Reserva tu clase de prueba", plan: "Clase de prueba" };

export const PAGINAS = {
  inicio: {
    clave: "inicio",
    ruta: "/",
    titulo: "Casa Lotus · Yoga, pilates y stretch aéreo en Bogotá",
    descripcion:
      "Yoga, pilates y stretch aéreo en una casa de Bogotá. Clases semipersonalizadas, cupos limitados y centro autorizado AÉREO®. Clase de prueba: $25.000.",
    h1: "Yoga, pilates y stretch aéreo en Bogotá",
    lema: "Suelta el peso.",
    palabrasClave: ["yoga aéreo bogotá", "casa lotus", "casa lotus bogotá", "estudio de yoga aéreo bogotá", "pilates aéreo bogotá", "clases de yoga aéreo", "yoga aéreo cerca de mí"],
    og: {
      titulo: "Suelta el peso.",
      descripcion: "Yoga, pilates y stretch aéreo en Bogotá. Tu primera clase: $25.000.",
      alt: "Casa Lotus: yoga, pilates y stretch aéreo en Bogotá. Clase de prueba $25.000.",
      etiqueta: "Yoga aéreo en Bogotá",
    },
    migas: [],
    schema: { tipo: "WebPage", sitio: true, videos: ["testimonio1", "testimonio2", "testimonio3"] },
    faq: [FAQ.experiencia, FAQ.cuanto, FAQ.primera, FAQ.diferencia, FAQ.cupos],
    ref: "",
    cta: PRUEBA_CTA,
  },

  clases: {
    clave: "clases",
    ruta: "/clases/",
    titulo: "Clases de yoga, pilates y stretch aéreo · Casa Lotus",
    descripcion:
      "Cuatro clases del Método Aéreo, todas aptas para principiantes: yoga aéreo, yoga aéreo multinivel, pilates aéreo y stretch aéreo. Mira cuál va contigo.",
    h1: "Clases de yoga, pilates y stretch aéreo",
    eyebrow: "Clases en Bogotá",
    intro:
      "El Método Aéreo se abre en muchos tipos de clase. Estas son las que damos hoy en Casa Lotus, y todas son aptas para principiantes: empieza por la que más te llame.",
    palabrasClave: ["clases aéreas bogotá", "tipos de yoga aéreo", "yoga en columpio", "yoga en hamaca", "yoga antigravedad bogotá", "aerial yoga bogotá", "fitness aéreo"],
    og: {
      titulo: "Cuatro formas de estar en el aire.",
      descripcion: "Yoga, pilates, stretch y multinivel. Todas aptas para principiantes.",
      alt: "Clases de yoga, pilates y stretch aéreo en Casa Lotus, Bogotá.",
      etiqueta: "Clases",
    },
    migas: [{ nombre: "Clases", ruta: "/clases/" }],
    schema: { tipo: "CollectionPage", clases: true },
    faq: [FAQ.diferencia, FAQ.stretch, FAQ.multinivel, FAQ.experiencia, FAQ.cupos],
    ref: "CLASES",
    cta: PRUEBA_CTA,
  },

  "yoga-aereo": {
    clave: "yoga-aereo",
    ruta: "/clases/yoga-aereo/",
    titulo: "Clases de yoga aéreo en Bogotá · Casa Lotus",
    descripcion:
      "Yoga aéreo en columpio para soltar el estrés: respiración, inversiones y atención plena. Apto para principiantes, cupos limitados. Prueba por $25.000.",
    h1: "Yoga aéreo en Bogotá",
    eyebrow: "Yoga Aéreo",
    intro:
      "Respiración, posturas invertidas y atención plena, con la tela sosteniendo tu peso. Si vienes del yoga en piso, descubres progresiones de las posturas que ya conoces; si nunca has practicado, empiezas con tu profe al lado.",
    palabrasClave: ["clases de yoga aéreo bogotá", "yoga aéreo", "qué es el yoga aéreo", "yoga aéreo para principiantes", "beneficios del yoga aéreo", "aeroyoga bogotá", "yoga antigravedad"],
    og: {
      titulo: "Yoga aéreo en Bogotá.",
      descripcion: "Respira, inviértete, suelta. Tu primera clase: $25.000.",
      alt: "Clase de yoga aéreo en Casa Lotus, Bogotá. Clase de prueba $25.000.",
      color: "#B7DFC5",
      etiqueta: "Yoga Aéreo",
    },
    migas: [
      { nombre: "Clases", ruta: "/clases/" },
      { nombre: "Yoga aéreo", ruta: "/clases/yoga-aereo/" },
    ],
    schema: {
      tipo: "WebPage",
      servicio: {
        nombre: "Yoga Aéreo",
        tipo: "Clase de yoga aéreo",
        descripcion:
          "Clase de yoga en columpio del Método Aéreo: alivia el estrés y la ansiedad con respiración y posturas invertidas, desarrolla concentración y atención plena, y descubre progresiones de las posturas clásicas del yoga en piso. Apta para principiantes.",
      },
      videos: ["testimonio1"],
    },
    faq: [FAQ.queEs, FAQ.experiencia, FAQ.comer, FAQ.cupos],
    ref: "YOGA",
    cta: PRUEBA_CTA,
  },

  "pilates-aereo": {
    clave: "pilates-aereo",
    ruta: "/clases/pilates-aereo/",
    titulo: "Pilates aéreo en Bogotá: fuerza sin impacto · Casa Lotus",
    descripcion:
      "Pilates aéreo en columpio: postura, fuerza del centro y resistencia sin impacto. Clases semipersonalizadas en Bogotá. Tu clase de prueba: $25.000.",
    h1: "Pilates aéreo en Bogotá",
    eyebrow: "Pilates Aéreo",
    intro:
      "Trabajas fuerza y resistencia con el columpio como apoyo, corriges hábitos posturales y entrenas el cuerpo de forma equilibrada. Sin saltos ni golpes, a tu ritmo.",
    palabrasClave: ["pilates aéreo bogotá", "clases de pilates aéreo", "pilates en columpio", "aerial pilates", "pilates aéreo para principiantes", "pilates aéreo beneficios"],
    og: {
      titulo: "Pilates aéreo en Bogotá.",
      descripcion: "Fuerza y postura, sin impacto. Tu primera clase: $25.000.",
      alt: "Clase de pilates aéreo en Casa Lotus, Bogotá. Clase de prueba $25.000.",
      color: "#D2F3A2",
      etiqueta: "Pilates Aéreo",
    },
    migas: [
      { nombre: "Clases", ruta: "/clases/" },
      { nombre: "Pilates aéreo", ruta: "/clases/pilates-aereo/" },
    ],
    schema: {
      tipo: "WebPage",
      servicio: {
        nombre: "Pilates Aéreo",
        tipo: "Clase de pilates aéreo",
        descripcion:
          "Clase de pilates en columpio del Método Aéreo: corrige malos hábitos posturales, desarrolla fuerza y resistencia muscular y entrena el cuerpo de forma equilibrada y sin impacto. Apta para principiantes.",
      },
      videos: ["primeraClase"],
    },
    faq: [FAQ.diferencia, FAQ.experiencia, FAQ.lesion, FAQ.cupos],
    ref: "PILATES",
    cta: PRUEBA_CTA,
  },

  "stretch-aereo": {
    clave: "stretch-aereo",
    ruta: "/clases/stretch-aereo/",
    titulo: "Stretch aéreo en Bogotá: movilidad sin forzar · Casa Lotus",
    descripcion:
      "Estiramiento en columpio para aliviar la rigidez y ganar movilidad sin forzar las articulaciones. Apto para principiantes. Clase de prueba: $25.000.",
    h1: "Stretch aéreo en Bogotá",
    eyebrow: "Stretch Aéreo",
    intro:
      "Estiramiento con el columpio como apoyo: alivia la rigidez y la tensión muscular, mejora tus rangos de movilidad y prepara tu cuerpo para mantenerlo sano, autónomo y funcional.",
    palabrasClave: ["stretch aéreo bogotá", "estiramiento aéreo", "aerial stretching", "clases de estiramiento bogotá", "movilidad articular", "stretching en columpio"],
    og: {
      titulo: "Stretch aéreo en Bogotá.",
      descripcion: "Movilidad y flexibilidad, a tu ritmo. Tu primera clase: $25.000.",
      alt: "Clase de stretch aéreo en Casa Lotus, Bogotá. Clase de prueba $25.000.",
      color: "#8AD4D6",
      etiqueta: "Stretch Aéreo",
    },
    migas: [
      { nombre: "Clases", ruta: "/clases/" },
      { nombre: "Stretch aéreo", ruta: "/clases/stretch-aereo/" },
    ],
    schema: {
      tipo: "WebPage",
      servicio: {
        nombre: "Stretch Aéreo",
        tipo: "Clase de stretch aéreo",
        descripcion:
          "Clase de estiramiento en columpio del Método Aéreo: alivia la rigidez y la tensión muscular, mejora los rangos de movilidad y la salud articular, y prepara el cuerpo para mantenerlo sano, autónomo y funcional. Apta para principiantes.",
      },
      videos: ["testimonio3"],
    },
    faq: [FAQ.stretch, FAQ.experiencia, FAQ.lesion, FAQ.cupos],
    ref: "STRETCH",
    cta: PRUEBA_CTA,
  },

  "yoga-aereo-multinivel": {
    clave: "yoga-aereo-multinivel",
    ruta: "/clases/yoga-aereo-multinivel/",
    titulo: "Yoga aéreo multinivel en Bogotá · Casa Lotus",
    descripcion:
      "La clase más versátil del Método Aéreo: fuerza, flexibilidad y relajación en el columpio, adaptada a cada nivel en el mismo grupo. Prueba por $25.000.",
    h1: "Yoga aéreo multinivel",
    eyebrow: "Yoga Aéreo multinivel",
    intro:
      "La más versátil: recorre todos los estilos del Método Aéreo y combina fuerza, flexibilidad y relajación. Tu profe adapta cada postura, así que en la misma clase cada quien avanza a su ritmo.",
    palabrasClave: ["yoga aéreo multinivel", "yoga aéreo todos los niveles", "clase de yoga aéreo completa", "yoga aéreo fuerza y flexibilidad"],
    og: {
      titulo: "Yoga aéreo multinivel.",
      descripcion: "Una clase, todos los niveles. Tu primera clase: $25.000.",
      alt: "Clase de yoga aéreo multinivel en Casa Lotus, Bogotá. Clase de prueba $25.000.",
      color: "#B2D4E0",
      etiqueta: "Yoga Aéreo multinivel",
    },
    migas: [
      { nombre: "Clases", ruta: "/clases/" },
      { nombre: "Yoga aéreo multinivel", ruta: "/clases/yoga-aereo-multinivel/" },
    ],
    schema: {
      tipo: "WebPage",
      servicio: {
        nombre: "Yoga Aéreo multinivel",
        tipo: "Clase de yoga aéreo",
        descripcion:
          "La clase más versátil del Método Aéreo: explora todos sus estilos y combina fuerza, flexibilidad y relajación, adaptada a todos los niveles en el mismo grupo. Apta para principiantes.",
      },
      videos: ["testimonio2"],
    },
    faq: [FAQ.multinivel, FAQ.experiencia, FAQ.cupos, FAQ.primera],
    ref: "MULTINIVEL",
    cta: PRUEBA_CTA,
  },

  "clase-de-prueba": {
    clave: "clase-de-prueba",
    ruta: "/clase-de-prueba/",
    titulo: "Clase de prueba de yoga aéreo en Bogotá · Casa Lotus",
    descripcion:
      "Tu primera clase de yoga, pilates o stretch aéreo cuesta $25.000. Elige horario, paga por Nequi, DaviPlata o Bre-B y llega diez minutos antes.",
    h1: "Tu clase de prueba: $25.000",
    eyebrow: "Tu primera clase en el aire",
    intro:
      "Una clase completa de yoga, pilates o stretch aéreo, con tu profe pendiente de ti. Sin experiencia y sin compromiso: así sabes si es para ti.",
    palabrasClave: ["clase de prueba yoga aéreo", "clase de prueba yoga aéreo bogotá", "primera clase de yoga aéreo", "clase de yoga aéreo precio", "probar yoga aéreo", "clase suelta yoga aéreo"],
    og: {
      titulo: "Tu primera clase en el aire: $25.000.",
      descripcion: "Yoga, pilates o stretch aéreo en Bogotá. Cupos limitados.",
      alt: "Clase de prueba de yoga aéreo en Casa Lotus, Bogotá, por $25.000.",
      color: "#D2F3A2",
      etiqueta: "Clase de prueba · $25.000",
    },
    migas: [{ nombre: "Clase de prueba", ruta: "/clase-de-prueba/" }],
    schema: { tipo: "WebPage", oferta: true, clases: true, videos: ["primeraClase"] },
    faq: [FAQ.reservar, FAQ.primera, FAQ.ropa, FAQ.comer, FAQ.cancelar, FAQ.pruebaCambios, FAQ.pagos],
    ref: "PRUEBA",
    cta: { texto: "Reservar mi clase de prueba", plan: "Clase de prueba" },
  },

  planes: {
    clave: "planes",
    ruta: "/planes/",
    titulo: "Precios de yoga aéreo en Bogotá: planes 2026 · Casa Lotus",
    descripcion:
      "Planes 2026: 4 clases $158.000, 8 $263.000, 12 $330.000 y 16 $390.000 al mes. También trimestrales. Entre más vienes, menos pagas por clase.",
    h1: "Planes y precios 2026",
    eyebrow: "Mensual o trimestral",
    intro:
      "Elige cuántas clases quieres al mes. Con el plan trimestral pagas tres meses de una vez y cada clase te sale más barata. ¿Primera vez? Empieza con la clase de prueba.",
    palabrasClave: ["precio yoga aéreo bogotá", "cuánto cuesta el yoga aéreo", "planes yoga aéreo", "mensualidad yoga aéreo", "precio pilates aéreo", "yoga aéreo precio clase"],
    og: {
      titulo: "Entre más vienes, menos pagas por clase.",
      descripcion: "Planes de 4, 8, 12 y 16 clases. Mensual o trimestral.",
      alt: "Planes y precios 2026 de Casa Lotus, Bogotá: de 4 a 16 clases al mes.",
      etiqueta: "Planes 2026",
    },
    migas: [{ nombre: "Planes y precios", ruta: "/planes/" }],
    schema: { tipo: "WebPage", planes: true, clases: true },
    faq: [FAQ.cuanto, FAQ.congelar, FAQ.pagos, FAQ.trimestral],
    ref: "PLANES",
    cta: PRUEBA_CTA,
  },

  horarios: {
    clave: "horarios",
    ruta: "/horarios/",
    titulo: "Horarios de yoga aéreo en Bogotá · Casa Lotus",
    descripcion:
      "Clases de yoga, pilates y stretch aéreo los miércoles en la noche y los sábados en la mañana. Mira los cupos libres y aparta tu columpio en línea.",
    h1: "Horarios y cupos",
    eyebrow: "Cupos limitados, a propósito",
    intro:
      "Las clases son semipersonalizadas: cupos limitados para que tu profe esté pendiente de ti. Elige tu horario y aparta tu columpio en línea.",
    palabrasClave: ["horarios yoga aéreo bogotá", "yoga aéreo sábados bogotá", "yoga aéreo en la noche", "clases de yoga aéreo fin de semana"],
    og: {
      titulo: "Cupos limitados, a propósito.",
      descripcion: "Mira los horarios y aparta tu columpio en línea.",
      alt: "Horarios de clases de yoga aéreo en Casa Lotus, Bogotá.",
      etiqueta: "Horarios",
    },
    migas: [{ nombre: "Horarios", ruta: "/horarios/" }],
    schema: { tipo: "WebPage" },
    faq: [FAQ.horarios, FAQ.cancelar, FAQ.tarde, FAQ.quorum, FAQ.donde],
    ref: "HORARIOS",
    cta: PRUEBA_CTA,
  },

  "metodo-aereo": {
    clave: "metodo-aereo",
    ruta: "/metodo-aereo/",
    titulo: "Método Aéreo en Bogotá: centro autorizado · Casa Lotus",
    descripcion:
      "Qué es el Método Aéreo (AÉREO®), qué significa ser centro autorizado y cómo se vive en Casa Lotus, con todo el equipo de profes certificado.",
    h1: "Centro autorizado del Método Aéreo",
    eyebrow: "El método",
    intro:
      "El Método Aéreo es un sistema de entrenamiento en suspensión que integra yoga, pilates y estiramiento. En Casa Lotus todo el equipo de profes está certificado en el método, y cada clase se adapta a tu cuerpo.",
    palabrasClave: ["método aéreo bogotá", "método aéreo", "aéreo centro autorizado", "qué es el método aéreo", "yoga aéreo certificado"],
    og: {
      titulo: "Centro autorizado AÉREO®.",
      descripcion: "Yoga, pilates y estiramiento en suspensión, con profes certificados en el método.",
      alt: "Casa Lotus, centro autorizado del Método Aéreo en Bogotá.",
      etiqueta: "El método",
    },
    migas: [{ nombre: "Método Aéreo", ruta: "/metodo-aereo/" }],
    schema: {
      tipo: "WebPage",
      servicio: {
        nombre: "Método Aéreo",
        tipo: "Entrenamiento en suspensión",
        descripcion: "Sistema de entrenamiento en suspensión que integra yoga, pilates y estiramiento en un columpio. Casa Lotus es centro autorizado AÉREO®.",
      },
      videos: ["metodo"],
    },
    faq: [FAQ.metodo, FAQ.experiencia, FAQ.queEs],
    ref: "METODO",
    cta: PRUEBA_CTA,
  },

  preguntas: {
    clave: "preguntas",
    ruta: "/preguntas/",
    titulo: "Preguntas sobre yoga aéreo y tu primera clase · Casa Lotus",
    descripcion:
      "Respuestas claras antes de tu primera clase de yoga aéreo en Bogotá: experiencia, ropa, comida, lesiones, embarazo, pagos, cancelaciones y más.",
    h1: "Preguntas frecuentes",
    eyebrow: "Antes de subirte",
    intro: "Lo que más nos preguntan antes de la primera clase. Si no encuentras tu respuesta, escríbenos por WhatsApp y te respondemos rápido.",
    palabrasClave: ["preguntas yoga aéreo", "yoga aéreo contraindicaciones", "yoga aéreo embarazo", "qué ropa usar para yoga aéreo", "yoga aéreo peso máximo", "yoga aéreo vértigo"],
    og: {
      titulo: "Antes de subirte.",
      descripcion: "Experiencia, ropa, salud, reservas, pagos y cancelaciones.",
      alt: "Preguntas frecuentes sobre las clases de Casa Lotus, Bogotá.",
      etiqueta: "Preguntas",
    },
    migas: [{ nombre: "Preguntas frecuentes", ruta: "/preguntas/" }],
    schema: { tipo: "FAQPage" },
    faq: GRUPOS_FAQ.flatMap((g) => g.items),
    ref: "PREGUNTAS",
    cta: PRUEBA_CTA,
  },

  nosotros: {
    clave: "nosotros",
    ruta: "/nosotros/",
    titulo: "Quiénes somos · Casa Lotus, yoga aéreo en Bogotá",
    descripcion:
      "Casa Lotus es la casa de Ana Caona en Bogotá convertida en estudio aéreo: alimentar el cuerpo, la mente y el alma, con un equipo de profes certificado.",
    h1: "Una casa para soltar el peso",
    eyebrow: "Quiénes somos",
    intro:
      "Casa Lotus es un estudio boutique de Método Aéreo en Bogotá. Pocas personas por clase, una sala llena de luz y un equipo de profes certificado que te acompaña desde tu primera vez en el aire.",
    palabrasClave: ["casa lotus bogotá", "ana caona", "estudio de yoga aéreo en casa", "profes de yoga aéreo bogotá"],
    og: {
      titulo: "Cuerpo, mente y alma.",
      descripcion: "Un estudio boutique de Método Aéreo en una casa de Bogotá.",
      alt: "La sala de Casa Lotus en Bogotá, con los columpios colgados.",
      etiqueta: "Quiénes somos",
    },
    migas: [{ nombre: "Quiénes somos", ruta: "/nosotros/" }],
    schema: { tipo: "AboutPage", persona: true },
    faq: [FAQ.metodo, FAQ.cupos, FAQ.donde],
    ref: "NOSOTROS",
    cta: PRUEBA_CTA,
  },

  terminos: {
    clave: "terminos",
    ruta: "/terminos/",
    titulo: "Condiciones de clases y planes · Casa Lotus",
    descripcion:
      "Reservas, cancelaciones, reprogramación, vigencia de los planes, pagos y normas de la sala de Casa Lotus, explicadas en lenguaje claro.",
    h1: "Condiciones y recomendaciones",
    eyebrow: "Términos y condiciones",
    intro: "Las reglas que cuidan tu práctica y este espacio. Al reservar una clase aceptas estas condiciones y el descargo de responsabilidad.",
    palabrasClave: ["casa lotus condiciones", "política de cancelación yoga aéreo"],
    og: {
      titulo: "Condiciones y recomendaciones.",
      descripcion: "Reservas, cancelaciones, planes, pagos y descargo de responsabilidad.",
      alt: "Condiciones de clases y planes de Casa Lotus.",
      etiqueta: "Condiciones",
    },
    migas: [{ nombre: "Condiciones", ruta: "/terminos/" }],
    schema: { tipo: "WebPage" },
    faq: [FAQ.cancelar, FAQ.congelar],
    ref: "TERMINOS",
    cta: PRUEBA_CTA,
    ogTipo: "article",
  },

  privacidad: {
    clave: "privacidad",
    ruta: "/privacidad/",
    titulo: "Política de tratamiento de datos personales · Casa Lotus",
    descripcion:
      "Cómo Casa Lotus recoge, usa y protege tus datos personales según la Ley 1581 de 2012, y cómo consultar, actualizar o suprimir tu información.",
    h1: "Política de tratamiento de datos personales",
    eyebrow: "Privacidad",
    intro:
      "Te pedimos pocos datos y solo para lo que hace falta: apartar tu columpio, confirmar tu pago y cuidarte en clase. Esta política cumple la Ley 1581 de 2012 y el Decreto 1377 de 2013 (hoy en el Decreto 1074 de 2015).",
    palabrasClave: ["casa lotus política de datos"],
    og: {
      titulo: "Tus datos, cuidados.",
      descripcion: "Política de tratamiento de datos personales (Ley 1581 de 2012).",
      alt: "Política de tratamiento de datos de Casa Lotus.",
      etiqueta: "Privacidad",
    },
    migas: [{ nombre: "Tratamiento de datos", ruta: "/privacidad/" }],
    schema: { tipo: "WebPage" },
    ref: "PRIVACIDAD",
    cta: PRUEBA_CTA,
    ogTipo: "article",
  },

  "404": {
    clave: "404",
    ruta: "/404/",
    titulo: "Página no encontrada · Casa Lotus",
    descripcion: "Esta página no existe o cambió de lugar. Mira las clases, los horarios o reserva tu clase de prueba en Casa Lotus, Bogotá.",
    h1: "Esta página se soltó del columpio",
    eyebrow: "Error 404",
    intro: "No existe o cambió de lugar. Desde aquí puedes volver a lo importante:",
    palabrasClave: [],
    og: {
      titulo: "Suelta el peso.",
      descripcion: "Yoga, pilates y stretch aéreo en Bogotá.",
      alt: "Casa Lotus: yoga, pilates y stretch aéreo en Bogotá.",
    },
    migas: [],
    schema: { tipo: "WebPage" },
    ref: "404",
    cta: PRUEBA_CTA,
    indexar: false,
  },
} satisfies Record<string, Pagina>;

export type ClavePagina = keyof typeof PAGINAS;
export const LISTA_PAGINAS: Pagina[] = Object.values(PAGINAS);

/* ── navigation (header, menu, footer sitemap) ───────────────────────────── */

export const NAV = [
  { nombre: "Clases", ruta: "/clases/" },
  { nombre: "Tu primera clase", ruta: "/clase-de-prueba/" },
  { nombre: "Horarios", ruta: "/horarios/" },
  { nombre: "Planes", ruta: "/planes/" },
  { nombre: "Método", ruta: "/metodo-aereo/" },
  { nombre: "Preguntas", ruta: "/preguntas/" },
];

export const MENU = [...NAV, { nombre: "Nosotros", ruta: "/nosotros/" }];

export const PIE = [
  {
    titulo: "Clases",
    enlaces: [
      { nombre: "Todas las clases", ruta: "/clases/" },
      { nombre: "Yoga Aéreo", ruta: "/clases/yoga-aereo/" },
      { nombre: "Yoga Aéreo multinivel", ruta: "/clases/yoga-aereo-multinivel/" },
      { nombre: "Pilates Aéreo", ruta: "/clases/pilates-aereo/" },
      { nombre: "Stretch Aéreo", ruta: "/clases/stretch-aereo/" },
    ],
  },
  {
    titulo: "Estudio",
    enlaces: [
      { nombre: "Clase de prueba", ruta: "/clase-de-prueba/" },
      { nombre: "Horarios", ruta: "/horarios/" },
      { nombre: "Planes y precios", ruta: "/planes/" },
      { nombre: "Método AÉREO®", ruta: "/metodo-aereo/" },
      { nombre: "Nosotros", ruta: "/nosotros/" },
    ],
  },
  {
    titulo: "Ayuda",
    enlaces: [
      { nombre: "Preguntas frecuentes", ruta: "/preguntas/" },
      { nombre: "Términos y condiciones", ruta: "/terminos/" },
      { nombre: "Tratamiento de datos", ruta: "/privacidad/" },
      { nombre: "Mi cuenta", ruta: "/app/" },
    ],
  },
];
