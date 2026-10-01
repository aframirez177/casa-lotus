// Links that leave a page: the booking hand-off to the app and WhatsApp.
// Every booking CTA carries a ref (shared/CONTRATO.md §9) so each booking can be traced to the
// button that started it. The visitor's UTM / click ids travel separately, in localStorage
// «cl_atribucion» for 90 days (see scripts/atribucion.js), which the app reads.
import { ESTUDIO } from "../data/estudio";

export interface Reserva { clase?: string; plan?: string; espera?: boolean }

/** /app/reservar?ref=WEB-HERO&plan=Clase+de+prueba */
export function reservar(ref: string, { clase, plan, espera }: Reserva = {}) {
  const q = new URLSearchParams({ ref });
  if (clase) q.set("clase", clase);
  if (plan) q.set("plan", plan);
  if (espera) q.set("espera", "1");
  return `/app/reservar?${q}`;
}

/** wa.me link to the bookings WhatsApp; the ref rides inside the message, as in v1. */
export function whatsapp(ref: string, texto = "Hola Casa Lotus, tengo una pregunta") {
  return `https://wa.me/${ESTUDIO.whatsapp}?text=${encodeURIComponent(`${texto} (ref:${ref})`)}`;
}

/** WEB-<page>-<place>, or the v1 ref on the home page. */
export const refDe = (pagina: string, lugar: string) => (pagina ? `WEB-${pagina}-${lugar}` : `WEB-${lugar}`);
