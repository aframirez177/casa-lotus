// /llms.txt and /llms-full.txt (llmstxt.org): the studio's public facts in plain Markdown, built from
// the same data as the pages, so an answer engine quoting Casa Lotus quotes what the site says.
import { SITIO, ESTUDIO, CLASES, PLANES, PRUEBA, POLITICAS, HORARIO_SEMANAL, REGLAS_PRUEBA, CONDICIONES, VIDEOS, dinero, porClase, hora12 } from "../data/estudio";
import { PAGINAS, GRUPOS_FAQ, type Pagina } from "../data/paginas";

const url = (p: Pagina) => SITIO + p.ruta;

const horario = HORARIO_SEMANAL.reduce<Record<string, string[]>>((m, f) => {
  const h = hora12(f.hora);
  (m[f.dia] ??= []).push(`${h.hora} ${h.sufijo}`);
  return m;
}, {});
const plural = (d: string) => (d.endsWith("s") ? d : d + "s").toLowerCase();
const horarioTexto = Object.entries(horario).map(([d, hs]) => `${plural(d)} ${hs.join(" y ")}`).join("; ");

const resumen = [
  `> Estudio de yoga, pilates y stretch aéreo en una casa de ${ESTUDIO.ciudad}.`,
  "> Centro autorizado del Método Aéreo (AÉREO®). Clases semipersonalizadas con cupos limitados,",
  `> aptas para principiantes. Clase de prueba: ${dinero(PRUEBA.precio)}. Reservas por WhatsApp: +57 ${ESTUDIO.whatsappTexto}.`,
].join("\n");

const hechos = [
  `Precios 2026 (COP): clase de prueba ${dinero(PRUEBA.precio)}; planes mensuales de ${PLANES.map((p) => `${p.clases} clases ${dinero(p.mes)}`).join(", ")}; planes trimestrales ${PLANES.map((p) => dinero(p.trimestre)).join(", ")}.`,
  `Horario: ${horarioTexto}${horarioTexto.endsWith(".") ? "" : "."} No hay clases en festivos.`,
  `Pagos: ${ESTUDIO.mediosPago.slice(0, -1).join(", ")} o ${ESTUDIO.mediosPago.at(-1)} a la llave ${ESTUDIO.llavePago}; transferencia bancaria por WhatsApp.`,
  `Reservas hasta ${POLITICAS.horasReservar} horas antes; cancelando con ${POLITICAS.horasCancelar} horas o más la clase vuelve al plan.`,
  `Actualizado: ${new Date().toISOString().slice(0, 10)}.`,
].join("\n");

const enlace = (k: keyof typeof PAGINAS, nombre: string, nota: string) => `- [${nombre}](${url(PAGINAS[k] as Pagina)}): ${nota}`;

export function llms() {
  return `# ${ESTUDIO.nombre}

${resumen}

${hechos}

## Clases
${enlace("yoga-aereo", "Yoga aéreo", "respiración, inversiones y atención plena.")}
${enlace("pilates-aereo", "Pilates aéreo", "postura, fuerza y resistencia, sin impacto.")}
${enlace("stretch-aereo", "Stretch aéreo", "movilidad y estiramiento sin forzar.")}
${enlace("yoga-aereo-multinivel", "Yoga aéreo multinivel", "la más versátil.")}

## Reservar
${enlace("clase-de-prueba", "Clase de prueba", "cómo reservar, pagar y prepararte.")}
${enlace("horarios", "Horarios", "cupos en vivo.")}
${enlace("planes", "Planes y precios", "mensuales y trimestrales.")}

## Sobre Casa Lotus
${enlace("metodo-aereo", "Método Aéreo", "qué es y qué significa centro autorizado.")}
${enlace("nosotros", "Quiénes somos", ESTUDIO.ana.nombre + ", el equipo y la sala.")}
${enlace("preguntas", "Preguntas frecuentes", "experiencia, ropa, salud, pagos y cancelaciones.")}
${enlace("terminos", "Condiciones", "reservas, cancelaciones, planes y descargo.")}

## Opcional
- [Todos los datos en un solo archivo](${SITIO}/llms-full.txt)
`;
}

export function llmsCompleto() {
  const clases = CLASES.map((c) => {
    const p = PAGINAS[c.slug] as Pagina;
    return `### ${c.nombre}\n\n${p.intro}\n\n${c.beneficios.map((b) => `- ${b}`).join("\n")}\n\nMás: ${url(p)}`;
  }).join("\n\n");
  const precios = [
    "| Plan | Mensual | Por clase | Trimestral (3 meses) | Por clase | Ahorro trimestral |",
    "|---|---|---|---|---|---|",
    `| ${PRUEBA.nombre} | ${dinero(PRUEBA.precio)} | ${dinero(PRUEBA.precio)} | — | — | — |`,
    ...PLANES.map((p) => `| ${p.clases} clases al mes | ${dinero(p.mes)} | ${dinero(porClase(p))} | ${dinero(p.trimestre)} | ${dinero(porClase(p, "trimestre"))} | ${dinero(p.mes * 3 - p.trimestre)} |`),
  ].join("\n");
  const faq = GRUPOS_FAQ.map((g) => `### ${g.titulo}\n\n${g.items.map((f) => `**${f.pregunta}**\n${f.respuesta}`).join("\n\n")}`).join("\n\n");
  const condiciones = CONDICIONES.map((g) => `### ${g.grupo}\n\n${g.reglas.map((r) => `- ${r}`).join("\n")}`).join("\n\n");
  const videos = Object.values(VIDEOS).map((v) => `- [${v.nombre}](${SITIO}${v.archivo}): ${v.descripcion}${v.cita ? ` «${v.cita}»` : ""}`).join("\n");

  return `# ${ESTUDIO.nombre} · todos los datos públicos

${resumen}

Fuente: ${SITIO}/ · Idioma: español de Colombia · Moneda: pesos colombianos (COP).

## Datos clave

${hechos}

- Clases: ${CLASES.map((c) => c.nombre).join(", ")}. Todas aptas para principiantes.
- Grupos: clases semipersonalizadas con cupos limitados (el estudio no publica un número de cupos).
- Dónde: ${ESTUDIO.ciudad}. La dirección exacta se envía al reservar.
- Contacto: WhatsApp +57 ${ESTUDIO.whatsappTexto} · ${ESTUDIO.correo} · Instagram ${ESTUDIO.redes.instagram} · TikTok ${ESTUDIO.redes.tiktok}.
- El estudio es de ${ESTUDIO.ana.nombre}. Todo el equipo de profes está certificado en el Método Aéreo.

## Clases

${clases}

## Precios 2026

${precios}

Los planes son personales e intransferibles, no se congelan y su vigencia corre desde la fecha de inicio. No hay reembolsos.

## Cómo reservar la clase de prueba

1. Elige un horario en ${SITIO}/horarios/ y aparta tu columpio en línea (o escribe al WhatsApp +57 ${ESTUDIO.whatsappTexto}).
2. Paga ${dinero(PRUEBA.precio)} por ${ESTUDIO.mediosPago.join(", ")} a la llave ${ESTUDIO.llavePago} y envía la captura por WhatsApp.
3. Llega diez minutos antes, con ropa deportiva ajustada que cubra piernas y axilas, sin haber comido en las dos horas previas y con tu botella de agua.

### Antes de tu clase de prueba

${REGLAS_PRUEBA.map((r) => `- **${r.titulo}.** ${r.texto}`).join("\n")}

## Condiciones y recomendaciones

${condiciones}

## Método Aéreo

${(PAGINAS["metodo-aereo"] as Pagina).intro}

## Preguntas frecuentes

${faq}

## Videos

${videos}
`;
}
