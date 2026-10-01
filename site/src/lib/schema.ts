// JSON-LD for every page, following docs/seo/plan.md §3 (phase A: no street address published yet).
// One @graph per page whose nodes point at each other by @id, so search and AI answer engines read one
// entity (the studio) with its pages, services, offers, videos and people.
// Not marked up (plan §3.8): reviews or ratings, Event for weekly classes, Course, Product, HowTo,
// SearchAction, anything not visible on the page, the payments key, teachers without consent.
import { SITIO, ESTUDIO, PLANES, PRUEBA, VIDEOS, CLASES, porClase, dinero } from "../data/estudio";
import type { Pagina } from "../data/paginas";

export const IDS = {
  organizacion: `${SITIO}/#organization`,
  sitio: `${SITIO}/#website`,
  logo: `${SITIO}/#logo`,
  clases: `${SITIO}/clases/#clases-aereas`,
  catalogo: `${SITIO}/planes/#catalogo`,
  oferta: `${SITIO}/clase-de-prueba/#oferta`,
  ana: `${SITIO}/nosotros/#ana-caona`,
  servicio: (slug: string) => `${SITIO}/clases/${slug}/#service`,
};

const abs = (ruta: string) => (ruta.startsWith("http") ? ruta : SITIO + ruta);
const ref = (id: string) => ({ "@id": id });
const TELEFONO = "+57 " + ESTUDIO.whatsappTexto;
const BOGOTA = { "@type": "City", name: "Bogotá", sameAs: "https://www.wikidata.org/wiki/Q2841" };

/** Full on the home page; every other page points at it by @id (plan §3.1). */
function organizacion() {
  return {
    "@type": "Organization",
    "@id": IDS.organizacion,
    name: ESTUDIO.nombre,
    alternateName: ["Casa Lotus Bogotá", "Casa Lotus · Yoga aéreo"],
    url: SITIO + "/",
    logo: { "@type": "ImageObject", "@id": IDS.logo, url: abs("/assets/brand/casa-lotus-logo-512.png"), width: 512, height: 512 },
    image: [abs("/og/inicio.png")],
    description: "Estudio de yoga, pilates y stretch aéreo en una casa de Bogotá. Centro autorizado del Método Aéreo (AÉREO®). Clases semipersonalizadas con cupos limitados.",
    slogan: "Alimentar el cuerpo, la mente y el alma",
    telephone: TELEFONO,
    email: ESTUDIO.correo,
    contactPoint: { "@type": "ContactPoint", telephone: TELEFONO, contactType: "reservas", availableLanguage: "es", areaServed: "CO" },
    // locality only: the street address waits for Ana's OK (phase B → HealthClub with address and geo)
    address: { "@type": "PostalAddress", addressLocality: ESTUDIO.ciudad, addressRegion: ESTUDIO.region, addressCountry: ESTUDIO.pais },
    areaServed: BOGOTA,
    founder: ref(IDS.ana),
    knowsAbout: [
      "Yoga aéreo",
      "Pilates aéreo",
      "Stretch aéreo",
      "Método Aéreo",
      { "@type": "Thing", name: "Aerial yoga", sameAs: "https://www.wikidata.org/wiki/Q18109708" },
    ],
    hasOfferCatalog: ref(IDS.catalogo),
    sameAs: [ESTUDIO.redes.instagram, ESTUDIO.redes.tiktok],
  };
}

function sitio() {
  return {
    "@type": "WebSite",
    "@id": IDS.sitio,
    url: SITIO + "/",
    name: ESTUDIO.nombre,
    alternateName: ["Casa Lotus Bogotá", "casalotus.studio"],
    inLanguage: "es-CO",
    publisher: ref(IDS.organizacion),
  };
}

/** The «all classes» service the offers point to. */
const servicioClases = () => ({
  "@type": "Service",
  "@id": IDS.clases,
  name: "Clases aéreas del Método Aéreo",
  serviceType: "Clases semipersonalizadas de yoga, pilates y stretch aéreo",
  provider: ref(IDS.organizacion),
  areaServed: BOGOTA,
  hasOfferCatalog: ref(IDS.catalogo),
});

const ofertaPrueba = () => ({
  "@type": "Offer",
  "@id": IDS.oferta,
  name: PRUEBA.nombre,
  price: PRUEBA.precio,
  priceCurrency: "COP",
  url: abs("/clase-de-prueba/"),
  availability: "https://schema.org/InStock",
  itemOffered: ref(IDS.clases),
  seller: ref(IDS.organizacion),
});

/** Nine offers, the same numbers as the visible table on /planes/ (plan §3.5). */
function catalogo() {
  const oferta = (id: string, nombre: string, precio: number, clases: number, unidad: string, categoria: string, descripcion: string) => ({
    "@type": "Offer",
    "@id": `${SITIO}/planes/#${id}`,
    name: nombre,
    description: descripcion,
    price: precio,
    priceCurrency: "COP",
    url: abs("/planes/"),
    availability: "https://schema.org/InStock",
    eligibleQuantity: { "@type": "QuantitativeValue", value: clases, unitText: unidad },
    itemOffered: ref(IDS.clases),
    seller: ref(IDS.organizacion),
    category: categoria,
  });
  return {
    "@type": "OfferCatalog",
    "@id": IDS.catalogo,
    name: "Planes 2026",
    itemListElement: [
      ofertaPrueba(),
      ...PLANES.map((p) => oferta(`mensual-${p.clases}`, `Plan mensual · ${p.clases} clases`, p.mes, p.clases, "clases al mes", "Mensual", `${dinero(porClase(p))} por clase`)),
      ...PLANES.map((p) => oferta(`trimestral-${p.clases}`, `Plan trimestral · ${p.clases} clases al mes`, p.trimestre, p.clases * 3, "clases en 3 meses", "Trimestral", `${dinero(porClase(p, "trimestre"))} por clase · ahorras ${dinero(p.mes * 3 - p.trimestre)}`)),
    ],
  };
}

function video(clave: string, url: string, transcripciones: Record<string, string>) {
  const v = VIDEOS[clave];
  return {
    "@type": "VideoObject",
    "@id": `${url}#video-${v.clave}`,
    name: v.nombre,
    description: v.descripcion,
    thumbnailUrl: [abs(v.poster)],
    uploadDate: `${v.fecha}T00:00:00-05:00`,
    duration: v.duracion,
    contentUrl: abs(v.archivo),
    encodingFormat: "video/mp4",
    width: v.ancho,
    height: v.alto,
    inLanguage: "es",
    publisher: ref(IDS.organizacion),
    ...(transcripciones[v.clave] ? { transcript: transcripciones[v.clave] } : {}),
  };
}

function persona() {
  return {
    "@type": "Person",
    "@id": IDS.ana,
    name: ESTUDIO.ana.nombre,
    jobTitle: "Fundadora de Casa Lotus",
    url: abs("/nosotros/"),
    worksFor: ref(IDS.organizacion),
    knowsAbout: ["Yoga aéreo", "Método Aéreo"],
  };
}

const pregunta = (f: { pregunta: string; respuesta: string }) => ({
  "@type": "Question",
  name: f.pregunta,
  acceptedAnswer: { "@type": "Answer", text: f.respuesta },
});

export interface OpcionesGrafo {
  /** absolute URL of the page's class photo, for its Service */
  imagenServicio?: string;
  /** video transcripts by clave (from the .vtt files), shown on the page too */
  transcripciones?: Record<string, string>;
}

/** The page's whole graph. */
export function grafo(p: Pagina, { imagenServicio, transcripciones = {} }: OpcionesGrafo = {}) {
  const url = abs(p.ruta);
  const esInicio = p.ruta === "/";
  const nodos: Record<string, unknown>[] = [];

  if (esInicio) nodos.push(organizacion());
  if (p.schema.sitio) nodos.push(sitio());

  const pagina: Record<string, unknown> = {
    "@type": p.schema.tipo,
    "@id": `${url}#webpage`,
    url,
    name: p.titulo,
    description: p.descripcion,
    inLanguage: "es-CO",
    isPartOf: ref(IDS.sitio),
    about: ref(IDS.organizacion),
    primaryImageOfPage: { "@type": "ImageObject", url: abs(`/og/${p.clave}.png`), width: 1200, height: 630 },
  };
  nodos.push(pagina);

  if (p.migas.length) {
    pagina.breadcrumb = ref(`${url}#breadcrumb`);
    nodos.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [{ nombre: "Inicio", ruta: "/" }, ...p.migas].map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: m.nombre,
        item: abs(m.ruta),
      })),
    });
  }

  const videos = (p.schema.videos ?? []).map((v) => video(v, url, transcripciones));

  if (p.schema.servicio) {
    const s = p.schema.servicio;
    const id = `${url}#service`;
    pagina.about = ref(id);
    nodos.push({
      "@type": "Service",
      "@id": id,
      name: s.nombre,
      serviceType: s.tipo,
      url,
      description: s.descripcion,
      provider: ref(IDS.organizacion),
      areaServed: BOGOTA,
      ...(imagenServicio ? { image: imagenServicio } : {}),
      offers: [ref(IDS.oferta)],
      ...(videos.length ? { subjectOf: videos.map((v) => ref(v["@id"] as string)) } : {}),
    });
    nodos.push(ofertaPrueba());
  }

  if (p.schema.clases) {
    nodos.push(servicioClases());
    if (p.schema.tipo === "CollectionPage") {
      pagina.mainEntity = {
        "@type": "ItemList",
        itemListElement: CLASES.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/clases/${c.slug}/`), item: ref(IDS.servicio(c.slug)) })),
      };
    }
  }
  if (p.schema.oferta) {
    nodos.push(ofertaPrueba());
    pagina.mainEntity = ref(IDS.oferta);
  }
  if (p.schema.planes) {
    nodos.push(catalogo());
    if (!esInicio) pagina.mainEntity = ref(IDS.catalogo);
  }
  nodos.push(...videos);
  if (p.schema.persona) {
    nodos.push(persona());
    pagina.mainEntity = ref(IDS.organizacion);
  }

  // FAQPage only where the page IS the FAQ (plan §3.8: Google no longer shows FAQ rich results)
  if (p.schema.tipo === "FAQPage" && p.faq?.length) pagina.mainEntity = p.faq.map(pregunta);

  // one node per @id (the trial offer can be reached twice)
  const vistos = new Set<string>();
  const unicos = nodos.filter((n) => {
    const id = n["@id"] as string | undefined;
    if (!id) return true;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
  return { "@context": "https://schema.org", "@graph": unicos };
}

/** JSON safe inside <script>: no «</script>» can close the tag early. */
export const jsonSeguro = (dato: unknown) => JSON.stringify(dato).replace(/</g, "\\u003c");
