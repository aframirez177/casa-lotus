// The fetch wrapper: same-origin cookies, CSRF header, JSON, and errors in Ana's words.
import { describe, test, expect, beforeEach, vi } from "vitest";
import { pedir, api, usarTransporte, alPerderSesion, ErrorApi, MOTIVOS } from "../src/api/cliente.js";

let llamadas;
const responder = (status, cuerpo) => {
  usarTransporte(async (url, init) => {
    llamadas.push({ url, init });
    return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
  });
};

beforeEach(() => { llamadas = []; });

describe("pedir", () => {
  test("sends cookies, the CSRF header and a JSON body", async () => {
    responder(200, { ok: true });
    await api.post("/api/yo/reservas", { clase: "2026-10-03 08:00" });
    const { url, init } = llamadas[0];
    expect(url).toBe("/api/yo/reservas");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers["X-Casa-Lotus"]).toBe("1");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ clase: "2026-10-03 08:00" });
  });

  test("GET sends the header too, builds the query and skips empty values", async () => {
    responder(200, []);
    await api.get("/api/admin/clientas", { segmento: "poquitas", q: "", orden: undefined });
    expect(llamadas[0].url).toBe("/api/admin/clientas?segmento=poquitas");
    expect(llamadas[0].init.headers["X-Casa-Lotus"]).toBe("1");
    expect(llamadas[0].init.body).toBeUndefined();
  });

  test("204 resolves to null", async () => {
    responder(204);
    await expect(api.post("/api/auth/salir")).resolves.toBeNull();
  });

  test("422 keeps the field messages", async () => {
    responder(422, { ok: false, error: "validacion", mensaje: "Revisa los datos marcados.", campos: { whatsapp: "Escribe un celular de 10 dígitos." } });
    const e = await pedir("/api/publico/reservas", { metodo: "POST", cuerpo: {} }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e.status).toBe(422);
    expect(e.error).toBe("validacion");
    expect(e.campos.whatsapp).toMatch(/10 dígitos/);
  });

  test("409 without a message falls back to the words for its motivo", async () => {
    responder(409, { ok: false, error: "conflicto", motivo: "llena" });
    const e = await api.post("/api/yo/reservas", {}).catch((x) => x);
    expect(e.motivo).toBe("llena");
    expect(e.mensaje).toBe(MOTIVOS.llena);
  });

  test("an unknown status still gives a readable error", async () => {
    responder(500, "<html>");
    const e = await api.get("/api/admin/tablero").catch((x) => x);
    expect(e.error).toBe("servidor");
    expect(e.mensaje).toMatch(/falló/);
  });

  test("a network failure becomes «Sin conexión»", async () => {
    usarTransporte(async () => { throw new TypeError("Failed to fetch"); });
    const e = await api.get("/api/yo").catch((x) => x);
    expect(e.status).toBe(0);
    expect(e.error).toBe("red");
    expect(e.mensaje).toMatch(/Sin conexión/);
  });

  test("401 tells the app the session ended, unless asked to stay quiet", async () => {
    const oyente = vi.fn();
    const quitar = alPerderSesion(oyente);
    responder(401, { ok: false, error: "no-autenticado", mensaje: "Entra de nuevo." });
    await api.get("/api/yo").catch(() => {});
    expect(oyente).toHaveBeenCalledTimes(1);
    await api.get("/api/auth/yo", undefined, { silencioso401: true }).catch(() => {});
    expect(oyente).toHaveBeenCalledTimes(1);
    quitar();
  });
});
