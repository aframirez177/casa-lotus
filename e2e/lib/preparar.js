// Casa Lotus e2e · global setup: refuse to run against anything but the fake studio with WhatsApp off.
import { request } from "@playwright/test";
import { API, CUENTAS, ipUnica } from "./entorno.js";

export default async function preparar() {
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { "X-Casa-Lotus": "1", "X-Forwarded-For": ipUnica() } });
  const r = await api.post("/api/auth/entrar", { data: { correo: CUENTAS.admin.correo, password: CUENTAS.admin.password } });
  if (r.status() !== 200) throw new Error(`The dev admin cannot sign in (${r.status()}): is the API running with the memory driver?`);
  const salud = await (await api.get("/api/admin/salud")).json();
  await api.dispose();
  if (salud.datos !== "memoria") throw new Error(`The API is on «${salud.datos}», not the fake studio. Refusing to write to a real Sheet.`);
  if (salud.whatsapp?.conectado || (salud.whatsapp?.modo && salud.whatsapp.modo !== "desconectado")) {
    throw new Error("WhatsApp is configured on this API. Restart it with `WHATSAPP_TOKEN= npm run dev` (server/) before running the suite.");
  }
}
