#!/usr/bin/env node
// Casa Lotus · writes the WhatsApp Cloud API settings into server/.env, asking one by one.
//   node scripts/whatsapp-configurar.mjs
//
// Secrets (token, app secret) are typed without echo and never printed back. Each key replaces its
// old line instead of piling up duplicates; Enter keeps the current value. The verify token for the
// webhook is ours, not Meta's, so it is generated here. At the end it asks Meta who the number is,
// which proves the token and the phone number id belong together.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

const ARCHIVO = ".env";
const GRAPH = process.env.WHATSAPP_GRAPH_VERSION || "v26.0";

function leerEnv() {
  if (!existsSync(ARCHIVO)) return { lineas: [], valores: {} };
  const lineas = readFileSync(ARCHIVO, "utf8").split("\n");
  const valores = {};
  for (const l of lineas) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return { lineas, valores };
}

function guardarEnv(lineas, cambios) {
  const pendientes = new Map(Object.entries(cambios));
  const vistos = new Set();
  const salida = [];
  for (const l of lineas) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && pendientes.has(m[1])) {
      if (vistos.has(m[1])) continue; // drop duplicates of a key we manage
      vistos.add(m[1]);
      salida.push(`${m[1]}=${pendientes.get(m[1])}`);
      continue;
    }
    salida.push(l);
  }
  for (const [k, v] of pendientes) if (!vistos.has(k)) salida.push(`${k}=${v}`);
  writeFileSync(ARCHIVO, salida.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n"));
  chmodSync(ARCHIVO, 0o600);
}

// Secret input: readline echoes every keystroke to its output, so it writes to a stream we can mute
// while a secret is typed. The prompt itself goes straight to stdout.
let mudo = false;
const salida = new Writable({ write(chunk, enc, cb) { if (!mudo) process.stdout.write(chunk, enc); cb(); } });
const rl = createInterface({ input: process.stdin, output: salida, terminal: true });

async function preguntar(texto, { secreto = false, actual = "", valido = () => true, ayuda = "", opcional = false } = {}) {
  for (;;) {
    const sufijo = actual ? (secreto ? " [Enter = dejar el actual]" : ` [${actual}]`) : "";
    const prompt = `${texto}${sufijo} › `;
    let r;
    if (secreto) {
      process.stdout.write(prompt);
      mudo = true;
      r = (await rl.question("")).trim();
      mudo = false;
      process.stdout.write("\n");
    } else r = (await rl.question(prompt)).trim();
    const valor = r || actual;
    if (!valor && opcional) return "";
    if (valor && valido(valor)) return valor;
    console.log(`  ✗ ${ayuda || "Valor no válido."}`);
  }
}

const { lineas, valores } = leerEnv();
const v = (k) => (valores[k] && !/^PEGA_|^TU|^57TU/.test(valores[k]) ? valores[k] : "");
console.log("Casa Lotus · configuración de WhatsApp (Meta → tu app → WhatsApp → Configuración de la API)\n");

const token = await preguntar("Token de acceso (no se ve al pegarlo)", {
  secreto: true, actual: v("WHATSAPP_TOKEN"), valido: (x) => /^EA[A-Za-z0-9]{60,}$/.test(x),
  ayuda: "El token empieza por «EA» y es muy largo. Cópialo de nuevo con el botón de copiar de Meta.",
});
const telefono = await preguntar("Identificador del número de teléfono (Phone number ID)", {
  actual: v("WHATSAPP_PHONE_NUMBER_ID"), valido: (x) => /^\d{10,20}$/.test(x), ayuda: "Son solo dígitos (entre 10 y 20).",
});
const waba = await preguntar("Identificador de la cuenta de WhatsApp Business (WABA ID)", {
  actual: v("WHATSAPP_WABA_ID"), valido: (x) => /^\d{10,20}$/.test(x), ayuda: "Son solo dígitos (entre 10 y 20).",
});
const secreto = await preguntar("Clave secreta de la app (Configuración de la app → Básica → Mostrar; Enter = después)", {
  secreto: true, actual: v("WHATSAPP_APP_SECRET"), valido: (x) => /^[a-f0-9]{32}$/i.test(x), opcional: true,
  ayuda: "La clave secreta tiene 32 caracteres (letras a–f y números).",
});
rl.close();

const verify = v("WHATSAPP_VERIFY_TOKEN") || randomBytes(24).toString("hex");
guardarEnv(lineas, {
  WHATSAPP_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: telefono, WHATSAPP_WABA_ID: waba,
  ...(secreto ? { WHATSAPP_APP_SECRET: secreto } : {}), WHATSAPP_VERIFY_TOKEN: verify, WHATSAPP_MODO: v("WHATSAPP_MODO") || "prueba",
});
console.log(`\n✓ Guardado en server/${ARCHIVO} (solo tu usuario puede leerlo; git lo ignora).`);

try {
  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${telefono}?fields=display_phone_number,verified_name,quality_rating`, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `HTTP ${r.status}`);
  console.log(`✓ Meta reconoce el número: ${d.display_phone_number} · ${d.verified_name}${d.quality_rating ? ` · calidad ${d.quality_rating}` : ""}`);
  console.log("\nSiguiente: node scripts/whatsapp-plantillas.mjs hola <tu celular>   (tu celular debe estar en la lista «Para» de Meta)");
} catch (e) {
  console.log(`✗ Meta no aceptó el token con ese número: ${e.message}`);
  console.log("  Revisa que el token no haya vencido (dura 24 h) y que el Phone number ID sea el del número de prueba.");
  process.exitCode = 1;
}
