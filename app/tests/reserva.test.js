// The shorter booking: class names in her words, the time range, the calendar links, the ticket sentence,
// and the ficha / agreements rules the flow decides with.
import { describe, test, expect } from "vitest";
import { nombreClase, sinTipo, estadoTicket, estadoPalabras } from "../src/lib/clases.js";
import { finClase, rangoHora, enlaceGoogleCalendar, icsDeClase } from "../src/lib/ics.js";
import { validarAcuerdos, validarFicha, faltaFicha, faltanAcuerdos, perfilPorCompletar, escribioSalud } from "../src/pantallas/reservar/reglasFicha.js";
import { llegoDesdeAtribucion } from "../src/lib/atribucion.js";

const clase = (x = {}) => ({ id: "2026-10-21 18:00", fecha: "2026-10-21", hora: "18:00", clase: "Pilates Aéreo", ...x });

describe("a class without a type reads «Clase aérea», never «por confirmar»", () => {
  test.each([["", true], ["Por confirmar", true], [undefined, true], ["Yoga Aéreo", false]])("%j", (tipo, vacia) => {
    expect(sinTipo(clase({ clase: tipo }))).toBe(vacia);
    expect(nombreClase(clase({ clase: tipo }))).toBe(vacia ? "Clase aérea" : "Yoga Aéreo");
  });
  test("plain strings too (the weekly slot)", () => {
    expect(nombreClase("")).toBe("Clase aérea");
    expect(nombreClase("Stretch Aéreo")).toBe("Stretch Aéreo");
  });
});

describe("time range", () => {
  test("fin from the API wins; otherwise start + duración", () => {
    expect(rangoHora(clase({ fin: "19:15" }))).toBe("6:00 – 7:15 p. m.");
    expect(rangoHora(clase(), 60)).toBe("6:00 – 7:00 p. m.");
    expect(rangoHora(clase({ hora: "09:15" }), 75)).toBe("9:15 – 10:30 a. m.");
  });
  test("crossing noon keeps both suffixes", () => {
    expect(rangoHora(clase({ hora: "11:30", fin: "12:30" }))).toBe("11:30 a. m. – 12:30 p. m.");
  });
  test("a nonsense fin falls back to the duration", () => {
    expect(finClase(clase({ fin: "17:00" }), 60)).toBe(finClase(clase(), 60));
  });
});

describe("calendar", () => {
  test("Google Calendar link: UTC dates from Bogotá time, title and code", () => {
    const u = new URL(enlaceGoogleCalendar(clase({ clase: "", fin: "19:00" }), { codigo: "R-0042" }));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20261021T230000Z/20261022T000000Z");
    expect(u.searchParams.get("text")).toBe("Clase aérea · Casa Lotus");
    expect(u.searchParams.get("details")).toContain("R-0042");
  });
  test(".ics: same instants", () => {
    const ics = icsDeClase(clase({ fin: "19:00" }), { codigo: "R-0042" });
    expect(ics).toContain("DTSTART:20261021T230000Z");
    expect(ics).toContain("DTEND:20261022T000000Z");
    expect(ics).toContain("SUMMARY:Pilates Aéreo · Casa Lotus");
  });
});

describe("the ticket says the state in one sentence", () => {
  test.each([
    [{ estado: "Pendiente de pago", pago: {} }, "Apartada: falta tu pago"],
    [{ estado: "Confirmada", conPlan: true, saldo: { clases: 3 } }, "Reservada con tu plan · te quedan 3 clases"],
    [{ estado: "Confirmada", conPlan: true, saldo: { clases: 1 } }, "Reservada con tu plan · te queda 1 clase"],
    [{ estado: "Confirmada", conPlan: true, saldo: { clases: 0 } }, "Reservada con tu plan · era la última clase de tu plan"],
    [{ estado: "Confirmada", conPlan: true, saldo: null }, "Reservada con tu plan"],
  ])("%j", (r, texto) => expect(estadoTicket(r)).toBe(texto));
  test("her booking states in plain words", () => {
    expect(estadoPalabras("Pendiente de pago")).toBe("Falta tu pago");
    expect(estadoPalabras("Confirmada")).toBe("Confirmada");
    expect(estadoPalabras("Cancelada")).toBe("Cancelada");
  });
});

describe("ficha and agreements", () => {
  const completa = { salud: "Ninguna", contactoEmergencia: { nombre: "Ana", whatsapp: "3001234567" }, experiencia: "Primera vez" };
  test("the ficha asks only what a profe needs", () => {
    expect(validarFicha(completa)).toEqual({});
    expect(Object.keys(validarFicha({}))).toEqual(["salud", "contactoNombre", "contactoWhatsapp", "experiencia"]);
    expect(faltaFicha(completa)).toBe(false);
    expect(faltaFicha({ ...completa, contactoEmergencia: { nombre: "Ana", whatsapp: "" } })).toBe(true);
  });
  test("datos + descargo in one box, the image choice, health only when she wrote about it", () => {
    expect(Object.keys(validarAcuerdos({}))).toEqual(["acuerdos", "imagen"]);
    const ok = { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: false } };
    expect(validarAcuerdos(ok)).toEqual({});
    expect(Object.keys(validarAcuerdos(ok, { conSensibles: true }))).toEqual(["sensibles"]);
    expect(validarAcuerdos({ ...ok, sensibles: { acepta: false } }, { conSensibles: true })).toEqual({});
    expect(validarAcuerdos({}, { completos: false })).toEqual({});
    expect(faltanAcuerdos(ok)).toBe(false);
    expect(faltanAcuerdos({ datos: { acepta: true }, descargo: { acepta: true } })).toBe(true);
  });
  test("«Sí, quiero contarla» before typing is not a health answer yet", () => {
    expect(escribioSalud("__contar")).toBe(false);
    expect(escribioSalud("Ninguna")).toBe(false);
    expect(escribioSalud("Rodilla operada")).toBe(true);
  });
  test("«Completa tu perfil» while any optional field is empty", () => {
    expect(perfilPorCompletar({ nacimiento: "1990-01-01", barrio: "Chapinero", intereses: ["x"], eps: "Sura", llego: "Google" })).toBe(false);
    expect(perfilPorCompletar({ nacimiento: "1990-01-01", barrio: "Chapinero", intereses: [], eps: "Sura", llego: "Google" })).toBe(true);
  });
  test("«¿Cómo llegaste?» from the visit's source", () => {
    expect(llegoDesdeAtribucion({ utm: { source: "IG" } })).toBe("Instagram");
    expect(llegoDesdeAtribucion({ utm: { source: "google" } })).toBe("Google");
    expect(llegoDesdeAtribucion({ utm: { source: "newsletter" } })).toBe("");
    expect(llegoDesdeAtribucion({})).toBe("");
  });
});
