// The site's CTA refs in Ana's words.
/** Ana's words for the site's buttons (the refs keep the v1 scheme: WEB-HERO, WEB-CLASE-PILATES, WEB-HORARIO-SAB-0800, WEB-PLAN-8…). */
const NOMBRES = {
  "WEB-HERO": "Portada", "WEB-HEADER": "Botón de arriba", "WEB-MENU": "Menú", "WEB-PRUEBA": "Clase de prueba", "WEB-CIERRE": "Final de la página",
  "WEB-FOOTER": "Pie de página", "WEB-BARRA-MOVIL": "Barra del celular", "APP-RESERVAR": "Directo a la app", "APP-ENTRAR": "Desde «Entrar»", "(sin ref)": "Sin botón identificado",
};
const DIAS = { LUN: "lunes", MAR: "martes", MIE: "miércoles", JUE: "jueves", VIE: "viernes", SAB: "sábado", DOM: "domingo" };
export function nombreRef(ref = "") {
  if (NOMBRES[ref]) return NOMBRES[ref];
  let m;
  if ((m = ref.match(/^WEB-CLASE-(.+)$/))) return "Clase " + m[1].toLowerCase().replace(/-/g, " ");
  if ((m = ref.match(/^WEB-HORARIO-([A-Z]{3})-(\d{2})(\d{2})$/))) return `Horario del ${DIAS[m[1]] || m[1].toLowerCase()} ${Number(m[2])}:${m[3]}`;
  if ((m = ref.match(/^WEB-PLAN-(.+)$/))) return `Plan de ${m[1].toLowerCase().replace(/-/g, " ")} clases`;
  if ((m = ref.match(/^WEB-VIDEO-(.+)$/))) return "Video " + m[1].toLowerCase().replace(/-/g, " ");
  return ref;
}
