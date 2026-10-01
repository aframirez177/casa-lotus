// Casa Lotus e2e · the API as a test fixture: sign in as staff, build isolated scenarios (a fresh clienta
// with a plan, an extra class, bookings) and read back the state the UI should have produced.
// Everything goes through the public HTTP contract (shared/CONTRATO.md); nothing touches the server's internals.
import { request, expect } from "@playwright/test";
import * as R from "../../shared/reglas.js";
import { API, CUENTAS, ipUnica, celular, sufijo } from "./entorno.js";

export { R };

/** A bare API client (no session) with the CSRF header and its own client IP. */
export async function clienteApi({ ip = ipUnica(), csrf = true, cabeceras = {} } = {}) {
  return request.newContext({
    baseURL: API,
    extraHTTPHeaders: { ...(csrf ? { "X-Casa-Lotus": "1" } : {}), "X-Forwarded-For": ip, ...cabeceras },
  });
}

/** Signs a staff member in (e-mail + password) and returns the API client holding the session cookie. */
export async function entrarApi(cuenta, opciones = {}) {
  const api = await clienteApi(opciones);
  const r = await api.post("/api/auth/entrar", { data: { correo: cuenta.correo, password: cuenta.password } });
  expect(r.status(), `login ${cuenta.correo}: ${await r.text()}`).toBe(200);
  return api;
}

/** JSON or a readable failure (status + body), so a broken precondition says what broke. */
export async function json(respuesta, esperado = [200, 201]) {
  const lista = Array.isArray(esperado) ? esperado : [esperado];
  const texto = await respuesta.text();
  expect(lista, `${respuesta.url()} → ${respuesta.status()} ${texto.slice(0, 400)}`).toContain(respuesta.status());
  return texto ? JSON.parse(texto) : null;
}

const NOMBRES = ["Renata", "Lina", "Mariela", "Zuleima", "Antonia", "Elisa", "Jimena", "Salomé", "Amparo", "Clara", "Violeta", "Olga"];
const APELLIDOS = ["Quintana", "Bermúdez", "Arango", "Céspedes", "Montoya", "Salcedo", "Ospina", "Cifuentes"];
export function nombreNuevo(nombre) {
  const n = nombre || NOMBRES[Math.floor(Math.random() * NOMBRES.length)];
  return `${n} ${APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)]} QA${sufijo()}`;
}

/** A complete ficha (every field of Ana's form) for a new person. */
export function perfilCompleto(nombre = nombreNuevo()) {
  return {
    nombre, whatsapp: celular(), correo: `qa.${sufijo().toLowerCase()}@example.com`, nacimiento: "1993-05-17", barrio: "Chapinero",
    intereses: ["Desarrollar fuerza, flexibilidad y conciencia corporal", "Reducir niveles de estrés / ansiedad"],
    salud: "Ninguna", eps: "Sura", contactoEmergencia: { nombre: "Mamá", whatsapp: celular() }, experiencia: "Algo de experiencia", llego: "Instagram",
  };
}
export const ACUERDOS = { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: true } };

/** Admin-side builders. `api` is a signed-in admin client. */
export function admin(api) {
  const get = async (ruta) => json(await api.get(ruta), 200);
  const post = async (ruta, data, esperado) => json(await api.post(ruta, { data }), esperado);
  const patch = async (ruta, data) => json(await api.patch(ruta, { data }), 200);
  const del = async (ruta) => json(await api.delete(ruta), [200, 204]);
  const id = encodeURIComponent;
  const a = {
    get, post, patch, del,
    tablero: () => get("/api/admin/tablero"),
    agenda: (desde, hasta) => get(`/api/admin/agenda?desde=${desde}&hasta=${hasta || desde}`),
    clase: (idClase) => get(`/api/admin/clases/${id(idClase)}`),
    clienta: (idClienta) => get(`/api/admin/clientas/${idClienta}`),
    clientas: (q = {}) => get("/api/admin/clientas?" + new URLSearchParams(q)),
    segmentos: () => get("/api/admin/segmentos"),
    registro: (limite = 200) => get(`/api/admin/registro?limite=${limite}`),
    horario: () => get("/api/admin/horario"),
    salud: () => get("/api/admin/salud"),
    atribucion: () => get("/api/admin/atribucion"),

    async crearClienta(perfil = perfilCompleto(), extra = {}) {
      return post("/api/admin/clientas", { ...perfil, consentimientos: ACUERDOS, ...extra }, 201);
    },
    async pagar(clienta, plan = "8 clases al mes", medio = "Nequi") {
      return post("/api/admin/pagos", { clienta, plan, medio, inicio: R.hoyClave() }, 201);
    },
    /** A fresh clienta with a full ficha and, optionally, a plan. */
    async clientaConPlan(plan = "8 clases al mes", nombre) {
      const c = await a.crearClienta(perfilCompleto(nombreNuevo(nombre)));
      if (plan) await a.pagar(c.id, plan);
      return c;
    },
    async crearClase({ fecha, hora, clase = "Pilates Aéreo", profe = "", cupos = 8, notas = "QA e2e", forzar = false }) {
      return post("/api/admin/clases", { fecha, hora, clase, profe, cupos, notas, forzar }, 201);
    },
    async reservar(clienta, clase) {
      return post("/api/admin/reservas", { clienta, clase }, 201);
    },
    async enlaceAcceso(clienta) {
      return post(`/api/admin/clientas/${clienta}/acceso`, {}, 200);
    },
    /** A free «HH:mm» on `fecha` (no class there yet), between two times, on a 5-minute grid. */
    async horaLibre(fecha, { desde = "05:00", hasta = "21:55", evitar = [] } = {}) {
      const ocupadas = new Set((await a.agenda(fecha)).map((c) => c.hora).concat(evitar));
      const [h0, m0] = desde.split(":").map(Number), [h1, m1] = hasta.split(":").map(Number);
      const opciones = [];
      for (let t = h0 * 60 + Math.ceil(m0 / 5) * 5; t <= h1 * 60 + m1; t += 5) {
        const hhmm = String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
        if (!ocupadas.has(hhmm)) opciones.push(hhmm);
      }
      if (!opciones.length) throw new Error(`No free time on ${fecha} between ${desde} and ${hasta}`);
      return opciones[Math.floor(Math.random() * opciones.length)];
    },
    /** An extra class between `minutos` and `minutos + ventana` from now (same Bogotá day), at a free 5-minute slot. */
    async claseEn(minutos, datos = {}, ventana = 120) {
      const t = Math.ceil((Date.now() + minutos * 60000) / 300000) * 300000;
      const { fecha, hora } = R.partesBogota(t);
      const hasta = R.partesBogota(t + ventana * 60000);
      const libre = await a.horaLibre(fecha, { desde: hora, hasta: hasta.fecha === fecha ? hasta.hora : "23:55" });
      return a.crearClase({ fecha, hora: libre, ...datos });
    },
  };
  return a;
}

/** Waits until `fn()` returns something truthy (API state settles after a deferred write with «Deshacer»). */
export async function esperar(fn, mensaje, { timeout = 15000 } = {}) {
  let ultimo;
  await expect.poll(async () => { ultimo = await fn(); return Boolean(ultimo); }, { message: mensaje, timeout, intervals: [250, 500, 1000] }).toBe(true);
  return ultimo;
}
