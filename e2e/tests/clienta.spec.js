// (d) The clienta: Ana's private link opens her account; she sees her next class and balance, cancels on time
// (the class goes back), reschedules (atomic: old «Cancelada», new «Confirmada»), cancels late (the policy says
// so and the class is spent) and joins the waiting list of a full class. Every scenario is built for her alone.
import { test, expect, abrirEnlace } from "../lib/prueba.js";
import { R, esperar } from "../lib/api.js";
import { APP } from "../lib/entorno.js";

const hora = (h) => R.horaLegible(h).replace(/\./g, "\\.");
const diaRelativo = (f, hoy = R.hoyClave()) => (f === hoy ? "hoy" : f === R.sumarDias(hoy, 1) ? "mañana" : R.fechaLegible(f));
/** Her booking card for a class: «sábado 3 de octubre · 8:00 a. m.» (day AND time, so two days never clash). */
const fila = (page, c) => page.getByRole("article").filter({ hasText: `${diaRelativo(c.fecha)} · ${R.horaLegible(c.hora)}` });

test("clienta: enlace de acceso, saldo, cancelar a tiempo, reagendar, cancelar tarde y lista de espera", async ({ page, apiAdmin }) => {
  const hoy = R.hoyClave();
  const usadas = [];
  const claseDia = async (dias, datos = {}) => {
    const fecha = R.sumarDias(hoy, dias);
    const h = await apiAdmin.horaLibre(fecha, { desde: "05:00", hasta: "06:55", evitar: usadas });
    usadas.push(h);
    return apiAdmin.crearClase({ fecha, hora: h, clase: "Pilates Aéreo", profe: "Geral", ...datos });
  };
  const yo = await apiAdmin.clientaConPlan("8 clases al mes", "Antonia");
  const A = await claseDia(3), B = await claseDia(4), T = await claseDia(5), F = await claseDia(6, { cupos: 1, clase: "Yoga Aéreo" });
  const N = await apiAdmin.claseEn(120, { clase: "Stretch Aéreo", profe: "Geral" });
  for (const c of [A, B, N]) expect((await apiAdmin.reservar(yo.id, c.id)).reserva.estado).toBe("Confirmada");
  const otra = await apiAdmin.clientaConPlan("4 clases al mes", "Clara");
  await apiAdmin.reservar(otra.id, F.id);
  const reservaDe = async (idClase) => (await apiAdmin.clienta(yo.id)).reservas.filter((r) => r.clase.id === idClase);
  const saldo = async () => (await apiAdmin.clienta(yo.id)).saldo.clases;
  expect(await saldo()).toBe(5);

  // 1 · the private link Ana sends
  const { enlace } = await apiAdmin.enlaceAcceso(yo.id);
  await abrirEnlace(page, enlace);
  await expect(page.getByRole("heading", { level: 1, name: `Hola, ${R.primerNombre(yo.nombre)}.` })).toBeVisible();
  const proxima = page.getByRole("article", { name: "Tu próxima clase" });
  await expect(proxima).toContainText(R.horaLegible(N.hora));
  await expect(proxima).toContainText(/Empieza en/);
  const plan = page.getByRole("region", { name: "Tu plan" });
  await expect(plan).toContainText("Te quedan 5 de 8.");

  // 2 · cancel more than 6 h ahead: the class goes back
  await page.getByRole("link", { name: /Mis clases|Clases/ }).first().click();
  await expect(page).toHaveURL(/\/app\/mi\/clases$/);
  const filaA = fila(page, A);
  await expect(filaA, "one card per booking (after the page transition)").toHaveCount(1);
  await filaA.getByRole("button", { name: "Cancelar" }).click();
  const hojaA = page.getByRole("dialog", { name: "¿Cancelar tu clase?" });
  await expect(hojaA.getByRole("status")).toContainText("si cancelas, la clase vuelve a tu plan.");
  await expect(hojaA.getByRole("status")).toContainText(/Puedes cancelar sin costo hasta el .+ a las .+\./);
  await hojaA.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText("Cancelaste tu clase. Vuelve a tu plan.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Deshacer" })).toBeVisible();
  await expect(filaA).toHaveCount(0);
  await esperar(async () => (await reservaDe(A.id))[0]?.estado === "Cancelada", "A → Cancelada");
  expect(await saldo(), "saldo +1").toBe(6);

  // 3 · reschedule B → T: atomic
  const filaB = fila(page, B);
  await expect(filaB).toHaveCount(1);
  await filaB.getByRole("button", { name: "Reagendar" }).click();
  const hojaB = page.getByRole("dialog", { name: "Cambia tu clase" });
  await expect(hojaB).toContainText(/Puedes cambiarla hasta .+\./);
  await hojaB.locator(`[data-fecha="${T.fecha}"]`).click();
  await hojaB.getByRole("button", { name: new RegExp("^" + hora(T.hora)) }).click();
  await hojaB.getByRole("button", { name: "Cambiar" }).click();
  await expect(hojaB).toBeHidden();
  await esperar(async () => (await reservaDe(T.id)).some((r) => r.estado === "Confirmada"), "T → Confirmada");
  const vieja = (await reservaDe(B.id))[0], nueva = (await reservaDe(T.id))[0];
  expect(vieja.estado).toBe("Cancelada");
  expect(nueva).toMatchObject({ estado: "Confirmada", reagendadaDe: vieja.id });
  expect(await saldo(), "a reschedule does not touch the balance").toBe(6);
  await expect(fila(page, T)).toBeVisible();

  // 4 · cancel less than 6 h before: the policy says the class is spent, and it is
  await page.goto(APP + "/app/mi");
  await proxima.getByRole("button", { name: "Cancelar" }).click();
  const hojaN = page.getByRole("dialog", { name: "¿Cancelar tu clase?" });
  await expect(hojaN.getByRole("status")).toContainText("si cancelas, se descuenta de tu plan y tu columpio queda libre para alguien en lista de espera.");
  await hojaN.getByRole("button", { name: "Cancelar igual" }).click();
  await expect(page.getByText("Cancelaste tu clase.", { exact: true })).toBeVisible();
  await esperar(async () => (await reservaDe(N.id))[0]?.estado === "Cancelada tarde", "N → Cancelada tarde");
  expect(await saldo(), "a late cancel spends the class").toBe(6);

  // 5 · a full class: the waiting list
  await page.goto(APP + "/app/mi/reservar");
  await page.locator(`[data-fecha="${F.fecha}"]`).click();
  const llena = page.getByRole("button", { name: new RegExp("^" + hora(F.hora)) });
  await expect(llena).toContainText(/llena|Lista de espera/i);
  await llena.click();
  const hojaF = page.getByRole("dialog", { name: "Esta clase está llena" });
  await hojaF.getByRole("button", { name: "Avisarme" }).click();
  await expect(page.getByText("Estás en la lista de espera. Te avisamos por WhatsApp.")).toBeVisible();
  const f = await apiAdmin.clase(F.id);
  expect(f.espera.map((e) => e.clienta)).toContain(yo.id);
  expect(f.gente.map((g) => g.clienta)).not.toContain(yo.id);

  // her history tells the truth
  await page.goto(APP + "/app/mi/clases");
  await page.getByRole("radio", { name: /Historial/ }).or(page.getByRole("tab", { name: /Historial/ })).or(page.getByRole("button", { name: /Historial/ })).first().click();
  await expect.soft(page.getByText("Cancelada tarde"), "the late cancel shows in her history").toBeVisible();
});

test("el enlace de acceso hace una sola petición (es de un solo uso)", async ({ page, apiAdmin }) => {
  const yo = await apiAdmin.clientaConPlan("4 clases al mes", "Lina");
  const { enlace } = await apiAdmin.enlaceAcceso(yo.id);
  const pedidas = [];
  page.on("request", (r) => { if (r.url().includes("/api/auth/enlace/")) pedidas.push(r.url()); });
  await page.goto(APP + new URL(enlace).pathname);
  await expect(page).toHaveURL(/\/app\/(mi|entrar)/, { timeout: 20000 });
  await page.waitForLoadState("load");
  expect.soft(pedidas.length, "requests to /api/auth/enlace (dev: React StrictMode runs the redirect effect twice)").toBe(1);
  await expect(page, "lands in her account, not on «Ese enlace ya no sirve»").toHaveURL(/\/app\/mi$/);
});
