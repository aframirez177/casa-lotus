// The template catalogue follows Meta's rules and produces the right create payloads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANTILLAS, revisarCatalogo, aPayloadCreacion, validarVariables, renderizar, buscarPlantilla, aPlantillaContrato } from "../../src/whatsapp/plantillas.js";

test("catalogue has the ten agreed templates and passes every rule we check", () => {
  assert.deepEqual(PLANTILLAS.map((p) => p.nombre), [
    "reserva_recibida", "reserva_confirmada", "recordatorio_clase", "cupo_liberado", "clase_cancelada",
    "cambio_de_clase", "saldo_bajo", "plan_por_vencer", "bienvenida_prueba", "codigo_acceso",
  ]);
  assert.deepEqual(revisarCatalogo(), []);
});

test("the checker catches the classic rejection causes", () => {
  const mala = { nombre: "Mala-Plantilla", categoria: "UTILITY", cuerpo: "{{a}}{{b}} texto {{c}}", variables: [{ nombre: "a" }, { nombre: "b" }], botones: [{ tipo: "QUICK_REPLY", texto: "x".repeat(26) }] };
  const p = revisarCatalogo([mala]).join("\n");
  assert.match(p, /minúsculas/);
  assert.match(p, /\{\{c\}\} sin declarar/);
  assert.match(p, /empezar ni terminar/);
  assert.match(p, /dos variables seguidas/);
  assert.match(p, /25 caracteres/);
});

test("every UTILITY/MARKETING body is warm, short and never genders the teachers", () => {
  for (const p of PLANTILLAS.filter((x) => x.categoria !== "AUTHENTICATION")) {
    assert.ok(p.cuerpo.length <= 550, `${p.nombre} is ${p.cuerpo.length} chars`);
    assert.doesNotMatch(p.cuerpo, /profesor/i);
    assert.match(p.cuerpo, /Hola|¡Listo/);
    for (const v of p.variables) assert.ok(v.ejemplo, `${p.nombre}.${v.nombre} needs an example`);
  }
  assert.doesNotMatch(PLANTILLAS.map((p) => p.cuerpo).join(" "), /se descuenta|abona|a cuenta del plan/i, "the trial credit is never published");
});

test("utility create payload: NAMED parameters with examples, footer and quick replies", () => {
  const p = aPayloadCreacion(buscarPlantilla("recordatorio_clase"));
  assert.equal(p.name, "recordatorio_clase");
  assert.equal(p.language, "es");
  assert.equal(p.category, "UTILITY");
  assert.equal(p.parameter_format, "NAMED");
  assert.deepEqual(p.components[0].example.body_text_named_params.map((x) => x.param_name), ["nombre", "cuando", "clase"]);
  assert.deepEqual(p.components[1], { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Ahí estaré" }, { type: "QUICK_REPLY", text: "Necesito cancelar" }] });
  const m = aPayloadCreacion(buscarPlantilla("bienvenida_prueba"));
  assert.equal(m.category, "MARKETING");
  assert.deepEqual(m.components.map((c) => c.type), ["BODY", "FOOTER", "BUTTONS"]);
});

test("authentication create payload: Meta's preset body, expiry footer, copy-code button", () => {
  assert.deepEqual(aPayloadCreacion(buscarPlantilla("codigo_acceso")), {
    name: "codigo_acceso", language: "es", category: "AUTHENTICATION",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar código" }] },
    ],
  });
});

test("validation and rendering", () => {
  const p = buscarPlantilla("saldo_bajo");
  const v = validarVariables(p, { nombre: " Laura ", saldo: "2 clases", vence: "viernes 30 de octubre" });
  assert.equal(v.ok, true);
  assert.equal(renderizar(p, v.valores).split("\n")[0], "Hola Laura, te contamos que te quedan 2 clases en tu plan de Casa Lotus, vigente hasta el viernes 30 de octubre.");
  assert.equal(validarVariables(p, { nombre: "x".repeat(201), saldo: "1", vence: "y" }).ok, false);
  assert.equal(validarVariables(buscarPlantilla("codigo_acceso"), { codigo: "12-34" }).ok, false);
});

test("contract shape for the app", () => {
  const c = aPlantillaContrato(buscarPlantilla("cupo_liberado"));
  assert.deepEqual(Object.keys(c).sort(), ["botones", "categoria", "cuerpo", "ejemplo", "estadoMeta", "idioma", "nombre", "uso", "variables"].sort());
  assert.equal(c.estadoMeta, "NO_ENVIADA");
  assert.deepEqual(c.variables, ["nombre", "clase", "cuando"]);
});

test("reserva_recibida: 6 variables, payment key and bookings WhatsApp written in the text", () => {
  const p = buscarPlantilla("reserva_recibida");
  assert.deepEqual(p.variables.map((x) => x.nombre), ["nombre", "clase", "cuando", "vence", "monto", "codigo"]);
  assert.match(p.cuerpo, /a la llave 319 328 8469 y envía el comprobante al WhatsApp 312 872 0888 \(o por este chat\)/);
  const v = validarVariables(p, { nombre: "Laura", clase: "Pilates Aéreo", cuando: "sábado 3 de octubre a las 8:00 a. m.", vence: "viernes 2 de octubre a las 8:00 p. m.", monto: "$25.000", codigo: "R-0042" });
  assert.equal(v.ok, true);
  assert.equal(aPayloadCreacion(p).components[0].example.body_text_named_params.length, 6);
});
