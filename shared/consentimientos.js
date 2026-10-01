// Casa Lotus · the agreements a student accepts, with versions. The site renders them on
// /privacidad and /terminos, the app in the booking flow and the profile, and the server stores
// which version was accepted and when. Change a text → bump its version; never edit a version in place.
//
// Legal frame: Ley 1581 de 2012 and Decreto 1377 de 2013 (Colombia). Health data is sensitive
// data (art. 5): its authorization must be explicit and the person is not obliged to give it (art. 6).
// The disclaimer is Ana's own text from her Google Form (2023), kept with light punctuation fixes.

export const RESPONSABLE = {
  nombre: "Casa Lotus (Ana Caona)",
  ciudad: "Bogotá, Colombia",
  correo: "casalotusbogota@gmail.com",
  whatsapp: "573128720888",
};

export const CONSENTIMIENTOS = {
  datos: {
    version: "datos-v1",
    titulo: "Tratamiento de tus datos personales",
    corto: "Autorizo a Casa Lotus a tratar mis datos para gestionar mis clases, pagos y comunicaciones, según su política de privacidad.",
    texto:
      "Autorizo a Casa Lotus, responsable del tratamiento, a recolectar y usar mi nombre, WhatsApp, correo, fecha de nacimiento, barrio, " +
      "EPS y contacto de emergencia para agendar y gestionar mis clases, registrar mis pagos, avisarme de cambios y recordatorios, y " +
      "contactar a mi contacto de emergencia si fuera necesario. Sé que puedo conocer, actualizar, rectificar y pedir que se supriman " +
      "mis datos, o revocar esta autorización, escribiendo a casalotusbogota@gmail.com o al WhatsApp 312 872 0888 (Ley 1581 de 2012).",
    obligatorio: true,
    enlace: "/privacidad/",
  },
  sensibles: {
    version: "sensibles-v1",
    titulo: "Datos de salud",
    corto: "Autorizo a Casa Lotus a conocer la información de salud que comparto, solo para cuidarme en clase.",
    texto:
      "La información sobre tu salud es un dato sensible. Contárnosla es voluntario: no estás obligada a autorizar su tratamiento. " +
      "Si la compartes, solo la verán Ana y la profe de tu clase, y solo para adaptar los ejercicios y cuidarte. No la usamos para " +
      "nada más ni la compartimos con terceros.",
    obligatorio: false, // required only when she writes something about her health
    enlace: "/privacidad/#datos-sensibles",
  },
  descargo: {
    version: "descargo-v1",
    titulo: "Descargo de responsabilidad y posibles riesgos",
    corto: "Leí y acepto los términos y condiciones de Casa Lotus y su descargo de responsabilidad.",
    texto:
      "Casa Lotus no se hará responsable de quienes no sigan las indicaciones de la profe. Cualquier condición médica o física, lesión " +
      "reciente o persistente, así como cualquier información relevante para tu práctica, debe comunicarse a la profe antes de comenzar " +
      "la clase. Es tu responsabilidad avisarle a la profe de cualquier dolor o molestia física durante la clase. Usar las instalaciones " +
      "de Casa Lotus implica aceptar el riesgo asociado a toda forma de ejercicio físico. Si tienes dudas sobre tu capacidad para participar " +
      "por tu condición médica, consulta con tu médico. Casa Lotus y su equipo, propietarios, directores y profes no se harán responsables " +
      "de: cualquier lesión o daño que resulte de la participación o del uso de las instalaciones; cualquier daño o pérdida de objetos " +
      "personales dentro de la sala o el parqueadero.",
    obligatorio: true,
    enlace: "/terminos/",
  },
  imagen: {
    version: "imagen-v1",
    titulo: "Fotos y videos en clase",
    corto: "En algunas clases grabamos fotos y videos para redes sociales y publicidad.",
    opciones: ["Sí, estoy de acuerdo", "No quiero aparecer en fotos o videos"],
    obligatorio: true, // she must choose, either answer is fine
  },
};

/** Ana's form, «Si pudieras escoger 2 de tus intereses…» (labels tidied, meaning unchanged). */
export const INTERESES = [
  "Objetivos estéticos: bajar de peso / tono muscular",
  "Desarrollar fuerza, flexibilidad y conciencia corporal",
  "Reducir niveles de estrés / ansiedad",
  "Progreso físico hacia posturas más avanzadas y acrobáticas",
  "Aprender sobre meditación, mindfulness o técnicas de respiración",
  "Incorporar buenos hábitos, disciplina y constancia",
  "Mejorar la calidad de sueño y relajación",
  "Construir comunidad en torno al bienestar",
];

export const EXPERIENCIA = ["Primera vez", "Algo de experiencia", "Practico seguido"];
export const COMO_LLEGO = ["Instagram", "Facebook", "Referencia de un amigo/a", "Google", "Otro"];
export const SALUD_SIN_DATOS = ["Ninguna", "Prefiero contárselo a la profe"];

/** The ficha is complete when the safety answers a profe needs before the first class are in. */
export function fichaCompleta(perfil = {}, consentimientos = {}) {
  return Boolean(
    perfil.nombre && perfil.whatsapp && perfil.salud && perfil.contactoEmergencia?.nombre && perfil.contactoEmergencia?.whatsapp &&
    consentimientos.datos?.acepta && consentimientos.descargo?.acepta && consentimientos.imagen && typeof consentimientos.imagen.acepta === "boolean",
  );
}
