// (e) The profe (Laura, dev account): her home shows the next class; in a class that already started she marks
// «Vino» / «No vino», adds someone who came without booking (with and without a plan) and closes the list;
// in a future class attendance waits for the class day, and «No puedo dictar esta clase» reaches Ana as an alert.
import { test, expect, visible } from "../lib/prueba.js";
import { R, esperar, entrarApi, json } from "../lib/api.js";
import { APP, CUENTAS } from "../lib/entorno.js";

const GENERO = /\b(?:la|el|las|los|una|un|otra|otro|nuestras|nuestros|nueva|nuevo)\s+profes?\b|\bprofesor(?:a|as|es)?\b/i;

test("profe: inicio, asistencia, agregar a quien vino, cerrar lista y pedir reemplazo", async ({ comoStaff, apiAdmin }) => {
  const ahora = Date.now();
  const hoy = R.hoyClave();
  const desde = R.partesBogota(ahora - 180 * 60000), hasta = R.partesBogota(ahora - 70 * 60000);
  test.skip(desde.fecha !== hoy || hasta.fecha !== hoy, "needs a class that started 1–3 h ago today (run after 03:00 Bogotá)");

  // a class of hers that started a while ago, with three people on their plans
  const P = await apiAdmin.crearClase({ fecha: hoy, hora: await apiAdmin.horaLibre(hoy, { desde: desde.hora, hasta: hasta.hora }), clase: "Pilates Aéreo", profe: "Laura" });
  const [vino, noVino, sinMarcar] = [await apiAdmin.clientaConPlan("4 clases al mes", "Mariela"), await apiAdmin.clientaConPlan("4 clases al mes", "Elisa"), await apiAdmin.clientaConPlan("4 clases al mes", "Jimena")];
  for (const p of [vino, noVino, sinMarcar]) expect((await apiAdmin.reservar(p.id, P.id)).reserva.estado).toBe("Confirmada");
  const sinReserva = await apiAdmin.clientaConPlan("4 clases al mes", "Zuleima");
  const sinPlan = await apiAdmin.clientaConPlan(null, "Amparo");
  // a future class of hers with one person
  const fFecha = R.sumarDias(hoy, 2);
  const Fu = await apiAdmin.crearClase({ fecha: fFecha, hora: await apiAdmin.horaLibre(fFecha, { desde: "05:00", hasta: "06:55" }), clase: "Yoga Aéreo", profe: "Laura" });
  await apiAdmin.reservar((await apiAdmin.clientaConPlan("4 clases al mes", "Salomé")).id, Fu.id);

  const apiProfe = await entrarApi(CUENTAS.laura);
  const verClase = async (id) => json(await apiProfe.get(`/api/profe/clases/${encodeURIComponent(id)}`), 200);
  const estadoDe = async (id, clienta) => (await verClase(id)).gente.find((g) => g.clienta === clienta)?.estado;

  // 1 · home: the next class up front
  const { page } = await comoStaff(CUENTAS.laura);
  await page.goto(APP + "/app/profe");
  await expect(page.getByRole("heading", { level: 1, name: "Hola, Laura." })).toBeVisible();
  const mias = json(await apiProfe.get("/api/profe/clases"), 200);
  const siguiente = (await mias).filter((c) => c.estado !== "Cancelada" && R.inicioClase(c) > Date.now() - 60 * 60000).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  const tarjeta = page.getByRole("link").filter({ hasText: /Tu próxima clase|En curso/ });
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta).toContainText(R.horaLegible(siguiente.hora));
  await expect(tarjeta).toContainText("Ver quién viene");

  // 2 · the class that started: Vino / No vino
  await page.goto(APP + `/app/profe/clase/${encodeURIComponent(P.id)}`);
  await expect(page.getByText(R.horaLegible(P.hora).split(" ")[0], { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Pasaron 48 horas/)).toHaveCount(0);
  await page.getByRole("radiogroup", { name: `Asistencia de ${vino.nombre}` }).getByRole("radio", { name: "Vino", exact: true }).click();
  await esperar(async () => (await estadoDe(P.id, vino.id)) === "Asistió", "Vino → Asistió");
  await page.getByRole("radiogroup", { name: `Asistencia de ${noVino.nombre}` }).getByRole("radio", { name: "No vino", exact: true }).click();
  await esperar(async () => (await estadoDe(P.id, noVino.id)) === "No vino", "No vino → No vino");
  await expect(page.getByRole("radiogroup", { name: `Asistencia de ${vino.nombre}` }).getByRole("radio", { name: "Vino", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Marcaste 2 de 3.")).toBeVisible();

  // 3 · someone who came without booking: with a plan, then without one
  for (const [quien, conPlan] of [[sinReserva, true], [sinPlan, false]]) {
    await page.getByRole("button", { name: "Agregar a alguien que vino" }).click();
    const hoja = page.getByRole("dialog", { name: "¿Quién vino?" });
    await hoja.getByRole("searchbox", { name: "Buscar alumna" }).fill(quien.nombre.split(" ").slice(-1)[0]);
    await hoja.getByRole("button", { name: new RegExp(quien.nombre) }).click();
    if (conPlan) {
      await expect(page.getByText(`${R.primerNombre(quien.nombre)} quedó en la lista.`)).toBeVisible();
      await esperar(async () => (await estadoDe(P.id, quien.id)) === "Asistió", "walk-in with a plan → Asistió");
    } else {
      const listo = page.getByRole("dialog", { name: "Listo, quedó en la lista" });
      await expect(listo).toContainText(`${R.primerNombre(quien.nombre)} no tiene clases en su plan. Le avisamos a Ana para cobrarle.`);
      await listo.getByRole("button", { name: "Entendido" }).click();
      await esperar(async () => (await estadoDe(P.id, quien.id)) === "Pendiente de pago", "walk-in without a plan → Pendiente de pago");
      const alerta = (await apiAdmin.tablero()).alertas.find((a) => a.tipo === "vino-sin-plan" && a.clienta?.id === quien.id);
      expect(alerta, "Ana gets «vino sin plan»").toBeTruthy();
    }
  }
  const fila = (await verClase(P.id)).gente.find((g) => g.clienta === sinReserva.id);
  expect(fila.origen).toMatch(/^Profe · Laura\b/);

  // 4 · close the list: whoever is left did not come
  await page.getByRole("button", { name: "Cerrar lista" }).click();
  const cerrar = page.getByRole("dialog", { name: "¿Cerrar la lista?" });
  await expect(cerrar.getByRole("listitem")).toHaveCount(1);
  await expect(cerrar).toContainText(sinMarcar.nombre);
  await cerrar.getByRole("button", { name: "Cerrar lista" }).click();
  await expect(page.getByText("Lista cerrada. ¡Gracias!")).toBeVisible();
  await esperar(async () => (await estadoDe(P.id, sinMarcar.id)) === "No vino", "cerrar lista → No vino");
  await expect(page.getByText("Asistencia completa. ¡Gracias!")).toBeVisible();
  await expect(page.getByRole("button", { name: "No puedo dictar esta clase" }), "a class that started cannot be handed over").toHaveCount(0);

  // 5 · a future class: attendance opens on the class day; «No puedo dictar esta clase»
  await page.goto(APP + `/app/profe/clase/${encodeURIComponent(Fu.id)}`);
  await expect(page.getByText("Podrás marcar la asistencia desde el día de la clase.")).toBeVisible();
  await expect(page.getByText(/Pasaron 48 horas/)).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Vino", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "No puedo dictar esta clase" }).click();
  const reemplazo = page.getByRole("dialog", { name: "No puedo dictar esta clase" });
  await reemplazo.getByRole("textbox").fill("Cita médica QA");
  await reemplazo.getByRole("button", { name: "Avisarle a Ana" }).click();
  await expect(page.getByText("Ana ya sabe. Gracias por avisar con tiempo.")).toBeVisible();
  await expect(visible(page.getByText(/Reemplazo pedido/))).toBeVisible();
  expect((await verClase(Fu.id)).reemplazoPedido).toMatchObject({ motivo: "Cita médica QA" });

  // Ana sees it
  const alerta = (await apiAdmin.tablero()).alertas.find((a) => a.tipo === "necesita-reemplazo" && a.clase?.id === Fu.id);
  expect(alerta, "alert «necesita-reemplazo»").toMatchObject({ prioridad: 1 });
  expect(alerta.accion?.ruta).toBe(`/app/admin/agenda/${encodeURIComponent(Fu.id)}?profe=1`);
  expect.soft(`${alerta.titulo} ${alerta.detalle}`, "the alert never genders the teacher").not.toMatch(GENERO);
  const { page: ana } = await comoStaff(CUENTAS.admin);
  await ana.goto(APP + "/app/admin");
  await expect(ana.getByRole("link", { name: new RegExp(alerta.titulo) }).first()).toBeVisible();
  await ana.goto(APP + alerta.accion.ruta);
  await expect(ana.getByRole("dialog", { name: "Editar la clase" }), "the alert opens the class with «Editar» ready").toBeVisible();
  await ana.getByRole("dialog", { name: "Editar la clase" }).getByRole("button", { name: "Cerrar" }).click();
  const banner = ana.getByText(/no puede dictarla/);
  await expect(banner).toBeVisible();
  const textoBanner = await banner.locator("..").innerText();
  expect.soft(textoBanner, "the substitute banner never genders the teacher").not.toMatch(GENERO);
  await apiProfe.dispose();
});

test("profe: no ve las clases ni la ficha de otra profe", async ({ apiAdmin }) => {
  const fecha = R.sumarDias(R.hoyClave(), 3);
  const c = await apiAdmin.crearClase({ fecha, hora: await apiAdmin.horaLibre(fecha, { desde: "05:00", hasta: "06:55" }), profe: "Geral" });
  const apiProfe = await entrarApi(CUENTAS.laura);
  const r = await apiProfe.get(`/api/profe/clases/${encodeURIComponent(c.id)}`);
  expect([403, 404]).toContain(r.status());
  const lista = await json(await apiProfe.get("/api/profe/clases"), 200);
  expect(lista.every((x) => x.profe === "Laura"), "only her classes").toBe(true);
  await apiProfe.dispose();
});

test("cada pantalla de la profe carga sin caerse", async ({ comoStaff }) => {
  const { page } = await comoStaff(CUENTAS.laura);
  const errores = [];
  page.on("pageerror", (e) => errores.push(page.url() + " → " + e.message));
  for (const ruta of ["/app/profe", "/app/profe/cuenta"]) {
    await page.goto(APP + ruta);
    await expect(page.getByRole("heading", { level: 1 }).first(), ruta).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Algo se enredó" })).toHaveCount(0);
  }
  // a profe who types an admin URL lands on her own home
  await page.goto(APP + "/app/admin/clientas");
  await expect(page).toHaveURL(/\/app\/profe$/);
  expect(errores).toEqual([]);
});
