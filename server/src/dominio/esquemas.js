// Casa Lotus · input schemas (zod), shared by the REST routes and the tool catalog.
// Messages are Colombian neutral Spanish: they are shown next to the field.
import { z } from "zod";
import { normalizaWhatsApp, MEDIOS } from "../../../shared/reglas.js";
import { INTERESES, EXPERIENCIA, COMO_LLEGO } from "../../../shared/consentimientos.js";
import { DIAS_HORARIO, ESTADOS_ESPERA, TIPOS_PLAN } from "../datos/esquema.js";

/** One line of clean text: control characters out, spaces collapsed, length capped. */
export const texto = (max, { min = 0, mensaje } = {}) =>
  z.string({ error: mensaje || "Escribe un texto." })
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(min, { error: mensaje || (min > 1 ? "Escribe al menos " + min + " letras." : "Este dato es obligatorio.") })
      .max(max, { error: "Máximo " + max + " caracteres." }));

export const MSJ_WHATSAPP = "Escribe un celular de 10 dígitos que empiece por 3, como 312 872 0888.";
export const whatsapp = z.string({ error: MSJ_WHATSAPP }).max(30, { error: MSJ_WHATSAPP })
  .transform((s) => normalizaWhatsApp(s)).refine(Boolean, { error: MSJ_WHATSAPP });

export const correo = z.string().trim().toLowerCase().max(120, { error: "Máximo 120 caracteres." }).pipe(z.email({ error: "Escribe un correo válido." }));
const correoOVacio = z.union([z.literal(""), correo]);

export const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Usa el formato aaaa-mm-dd." })
  .refine((s) => !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().startsWith(s), { error: "Esa fecha no existe." });
export const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Usa el formato HH:mm, como 18:00." });
export const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Usa el formato aaaa-mm." });
export const claseId = z.string().regex(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/, { error: "Esa clase no existe." });
export const idClienta = z.string().regex(/^C-\d{1,6}$/, { error: "Esa clienta no existe." });
export const idReserva = z.string().regex(/^R-\d{1,6}$/, { error: "Esa reserva no existe." });
export const idEspera = z.string().regex(/^E-\d{1,6}$/, { error: "Ese registro no existe." });

const nacimiento = z.union([z.literal(""), fecha.refine((s) => s >= "1920-01-01" && s <= "2022-12-31", { error: "Revisa la fecha de nacimiento." })]);

export const perfilParcial = z.object({
  nombre: texto(80, { min: 2, mensaje: "Escribe tu nombre." }),
  whatsapp,
  correo: correoOVacio,
  nacimiento,
  barrio: texto(80),
  intereses: z.array(z.enum(INTERESES, { error: "Elige de la lista." })).max(2, { error: "Elige máximo 2." }),
  salud: texto(600),
  eps: texto(80),
  contactoEmergencia: z.object({
    nombre: texto(80).optional().default(""),
    whatsapp: z.union([z.literal(""), whatsapp]).optional().default(""),
  }),
  experiencia: z.enum(["", ...EXPERIENCIA], { error: "Elige de la lista." }),
  llego: z.enum(["", ...COMO_LLEGO], { error: "Elige de la lista." }),
}).partial();

export const perfilNuevo = perfilParcial.required({ nombre: true, whatsapp: true });

const acuerdo = z.object({ acepta: z.boolean({ error: "Responde sí o no." }), version: z.string().max(40).optional(), fecha: z.string().max(40).optional() });
export const consentimientos = z.object({
  datos: acuerdo,
  sensibles: acuerdo,
  descargo: acuerdo,
  imagen: z.object({ acepta: z.boolean({ error: "Elige una opción." }), fecha: z.string().max(40).optional() }),
  novedades: acuerdo,
}).partial();

const textoCorto = (max) => z.string().max(max).transform((s) => s.replace(/[^\w\-.~:/ ]/g, "").trim());
export const utm = z.object({
  source: textoCorto(100), medium: textoCorto(100), campaign: textoCorto(150), term: textoCorto(150), content: textoCorto(150),
}).partial();
export const clickIds = z.object({
  gclid: textoCorto(200), gbraid: textoCorto(200), wbraid: textoCorto(200), fbclid: textoCorto(300),
}).partial();
export const ref = z.string().max(60).transform((s) => s.replace(/[^\w·\- ]/g, "").trim().toUpperCase().slice(0, 60));

export const reservaPublica = z.object({
  clase: claseId,
  perfil: perfilParcial.required({ nombre: true, whatsapp: true }),
  consentimientos: consentimientos.required({ datos: true, descargo: true, imagen: true }),
  plan: texto(60).optional(),
  ref: ref.optional().default("WEB"),
  utm: utm.optional(),
  clickIds: clickIds.optional(),
  website: z.string().max(200).optional(),
});

export const esperaPublica = z.object({
  clase: claseId,
  nombre: texto(80, { min: 2, mensaje: "Escribe tu nombre." }),
  whatsapp,
  consentimientos: consentimientos.required({ datos: true }),
  website: z.string().max(200).optional(),
});

export const eventoPublico = z.object({
  tipo: z.string().regex(/^[a-z][a-z-]{1,29}$/),
  ref: ref.optional().default(""),
  pagina: z.string().max(200).optional().default(""),
  utm: utm.optional(),
  clickIds: clickIds.optional(),
});

export const pago = z.object({
  plan: texto(60, { min: 1, mensaje: "Elige el plan." }),
  medio: z.enum(MEDIOS, { error: "Elige el medio de pago." }),
  valor: z.coerce.number().int().min(0).max(20000000).optional(),
  clases: z.coerce.number().int().min(1).max(200).optional(),
  inicio: fecha.optional(),
});

export const claseExtra = z.object({
  fecha, hora, clase: texto(60, { min: 1, mensaje: "Escribe el nombre de la clase." }), profe: texto(60),
  cupos: z.coerce.number().int().min(1).max(30).optional(), notas: texto(500).optional(), forzar: z.boolean().optional(),
});

export const claseEditar = z.object({
  clase: texto(60).optional(), profe: texto(60).optional(), cupos: z.coerce.number().int().min(1).max(30).optional(), notas: texto(500).optional(),
});

export const slot = z.object({
  dia: z.enum(DIAS_HORARIO, { error: "Elige el día." }), hora, clase: texto(60, { min: 1, mensaje: "Escribe el nombre de la clase." }),
  profe: texto(60), cupos: z.coerce.number().int().min(1).max(30), activa: z.boolean().optional().default(true), desde: fecha.optional(),
});
export const slotEditar = z.object({
  clase: texto(60).optional(), profe: texto(60).optional(), cupos: z.coerce.number().int().min(1).max(30).optional(), activa: z.boolean().optional(),
  aplicarAFuturas: z.boolean().optional(),
});

export const estadoEspera = z.enum(ESTADOS_ESPERA, { error: "Elige un estado de la lista." });
export const planEditar = z.object({
  nombre: texto(60, { min: 2 }), precio: z.coerce.number().int().min(0).max(20000000).optional(), clases: z.coerce.number().int().min(0).max(200).optional(),
  vigencia: z.coerce.number().int().min(1).max(400).optional(), activo: z.boolean().optional(), tipo: z.enum(TIPOS_PLAN).optional(),
});

export { z };
