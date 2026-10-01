// (c) Ana's panel: sign in, extra classes (and the holiday guard), a weekly slot that fills the agenda,
// assigning the profe, cancelling a class with the people to notify, and the CRM (segments, detail, access link).
import { test, expect, visible, abrirEnlace } from "../lib/prueba.js";
import { R, esperar, clienteApi, ACUERDOS } from "../lib/api.js";
import { celular } from "../lib/entorno.js";
import { APP, CUENTAS } from "../lib/entorno.js";

const enlaceClase = (id) => `/app/admin/agenda/${encodeURIComponent(id)}`;
const lunesDe = (f) => { const d = R.fechaUTC(f).getUTCDay(); return R.sumarDias(f, d === 0 ? -6 : 1 - d); };

test("el equipo entra con correo y contraseña, y al salir ya no hay panel", async ({ page }) => {
  await page.goto(APP + "/app/admin");
  await expect(page).toHaveURL(/\/app\/entrar\?volver=%2Fadmin/);
  await page.getByRole("button", { name: /^Equipo/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Equipo Casa Lotus" })).toBeVisible();
  await page.getByLabel("Correo").fill(CUENTAS.admin.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill("una-clave-equivocada");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Contraseña", { exact: true }).fill(CUENTAS.admin.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/admin$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana.");

  await page.goto(APP + "/app/admin/cuenta");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/app\/entrar/);
  const yo = await page.request.get(APP + "/api/auth/yo");
  expect(yo.status(), "the session is gone on the server too").toBe(401);
  await page.goto(APP + "/app/admin/clientas");
  await expect(page).toHaveURL(/\/app\/entrar\?volver=/);
});

test("clase extra: normal, y en festivo pide confirmación («Sí, crearla igual»)", async ({ comoStaff, apiAdmin }) => {
  const { page } = await comoStaff(CUENTAS.admin);
  const abrirFormulario = async () => {
    await visible(page.getByRole("button", { name: /^Agregar( una clase)?$/ })).click();
    await page.getByRole("button", { name: /^Clase extra/ }).click();
    await expect(page.getByRole("dialog", { name: "Clase extra" })).toBeVisible();
  };
  const llenar = async (fecha, hora, profe) => {
    const d = page.getByRole("dialog", { name: "Clase extra" });
    await d.getByLabel("Día", { exact: true }).fill(fecha);
    await d.getByLabel("Hora", { exact: true }).fill(hora);
    await d.getByLabel("Clase", { exact: true }).selectOption("Stretch Aéreo");
    await d.getByLabel("Profe", { exact: true }).selectOption(profe);
    await d.getByLabel("Cupos").fill("6");
    await d.getByLabel(/^Notas/).fill("Taller QA");
    return d;
  };

  // a normal day
  const fecha = R.sumarDias(R.hoyClave(), 9);
  const hora = await apiAdmin.horaLibre(fecha, { desde: "05:00", hasta: "06:55" });
  await page.goto(APP + "/app/admin/agenda");
  await abrirFormulario();
  const d = await llenar(fecha, hora, "Geral");
  await d.getByRole("button", { name: "Crear la clase" }).click();
  await expect(page.getByText(/^Clase extra creada: /)).toBeVisible();
  const creada = await apiAdmin.clase(R.claseId(fecha, hora));
  expect(creada).toMatchObject({ tipo: "Extra", clase: "Stretch Aéreo", profe: "Geral", cupos: 6, estado: "Programada" });
  await page.goto(APP + `/app/admin/agenda?semana=${lunesDe(fecha)}`);
  await expect(page.locator(`a[href="${enlaceClase(creada.id)}"]`)).toBeVisible();

  // a holiday: 12 October 2026, Día de la Raza
  const festivo = "2026-10-12";
  const horaF = await apiAdmin.horaLibre(festivo, { desde: "05:00", hasta: "06:55" });
  await page.goto(APP + "/app/admin/agenda");
  await abrirFormulario();
  const f = await llenar(festivo, horaF, "Laura");
  await f.getByRole("button", { name: "Crear la clase" }).click();
  await expect(f.getByRole("alert")).toContainText("es festivo (Día de la Raza)");
  expect((await apiAdmin.agenda(festivo)).some((c) => c.hora === horaF), "nothing created before confirming").toBe(false);
  await f.getByRole("button", { name: "Sí, crearla igual" }).click();
  await expect(page.getByText(/^Clase extra creada: /)).toBeVisible();
  expect(await apiAdmin.clase(R.claseId(festivo, horaF))).toMatchObject({ tipo: "Extra", profe: "Laura", estado: "Programada" });
  await page.goto(APP + `/app/admin/agenda?semana=${festivo}`);
  await expect(page.locator(`a[href="${enlaceClase(R.claseId(festivo, horaF))}"]`)).toBeVisible();
});

test("franja semanal nueva: crea sus clases y aparecen en la agenda", async ({ comoStaff, apiAdmin }) => {
  const { page } = await comoStaff(CUENTAS.admin);
  const usadas = new Set((await apiAdmin.horario()).map((s) => s.id));
  let hora;
  for (let i = 0; i < 50 && (!hora || usadas.has("Domingo " + hora)); i++) hora = `0${5 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 12) * 5).padStart(2, "0")}`;

  await page.goto(APP + "/app/admin/horario");
  await page.getByRole("button", { name: "Nueva franja" }).click();
  const d = page.getByRole("dialog", { name: "Nueva franja semanal" });
  await d.getByLabel("Día", { exact: true }).selectOption("Domingo");
  await d.getByLabel("Hora", { exact: true }).fill(hora);
  await d.getByLabel("Clase", { exact: true }).selectOption("Yoga Aéreo multinivel");
  await d.getByLabel("Profe", { exact: true }).selectOption("Ximena");
  await d.getByLabel("Cupos").fill("7");
  await d.getByRole("button", { name: "Crear la franja" }).click();
  await expect(page.getByText(/^Franja creada: \d+ clases? nuevas? en la agenda\.$/)).toBeVisible();

  const slot = (await apiAdmin.horario()).find((s) => s.id === "Domingo " + hora);
  expect(slot, "the slot is in Horario").toMatchObject({ dia: "Domingo", hora, clase: "Yoga Aéreo multinivel", profe: "Ximena", cupos: 7, activa: true });
  expect(slot.proximas, "its classes were generated right away").toBeGreaterThanOrEqual(3);
  let domingo = R.hoyClave();
  while (R.diaDeSemana(domingo) !== "Domingo") domingo = R.sumarDias(domingo, 1);
  if (R.festivosEntre(domingo, domingo)[domingo]) domingo = R.sumarDias(domingo, 7);
  const id = R.claseId(domingo, hora);
  expect(await apiAdmin.clase(id)).toMatchObject({ clase: "Yoga Aéreo multinivel", profe: "Ximena", cupos: 7 });
  await page.goto(APP + `/app/admin/agenda?semana=${lunesDe(domingo)}`);
  await expect(page.locator(`a[href="${enlaceClase(id)}"]`)).toBeVisible();
  // the slot card shows on the template
  await page.goto(APP + "/app/admin/horario");
  await expect(page.getByRole("button", { name: new RegExp(R.horaLegible(hora).replace(/\./g, "\\.")) }).filter({ hasText: "Ximena" })).toBeVisible();

  // leave the template as it was (its future classes without bookings are removed)
  const fuera = await apiAdmin.del(`/api/admin/horario/${encodeURIComponent(slot.id)}`);
  expect(fuera.canceladas).toBeGreaterThanOrEqual(3);
});

test("asignar y cambiar la profe de una clase", async ({ comoStaff, apiAdmin }) => {
  const fecha = R.sumarDias(R.hoyClave(), 8);
  const c = await apiAdmin.crearClase({ fecha, hora: await apiAdmin.horaLibre(fecha, { desde: "05:00", hasta: "06:55" }), profe: "" });
  expect(c.profe).toBe("");
  const { page } = await comoStaff(CUENTAS.admin);
  await page.goto(APP + enlaceClase(c.id));
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();

  for (const profe of ["Geral", "Laura"]) {
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const d = page.getByRole("dialog", { name: "Editar la clase" });
    await d.getByLabel("Profe", { exact: true }).selectOption(profe);
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Clase actualizada.")).toBeVisible();
    await expect(d).toBeHidden();
    await expect(page.getByText(`con ${profe}`, { exact: true })).toBeVisible();
    expect((await apiAdmin.clase(c.id)).profe).toBe(profe);
  }
});

test("cancelar una clase con motivo: quedan las personas para avisarles por WhatsApp", async ({ comoStaff, apiAdmin }) => {
  const fecha = R.sumarDias(R.hoyClave(), 10);
  const c = await apiAdmin.crearClase({ fecha, hora: await apiAdmin.horaLibre(fecha, { desde: "05:00", hasta: "06:55" }), profe: "Geral" });
  const personas = [await apiAdmin.clientaConPlan("4 clases al mes", "Lina"), await apiAdmin.clientaConPlan("4 clases al mes", "Olga")];
  for (const p of personas) expect((await apiAdmin.reservar(p.id, c.id)).reserva.estado).toBe("Confirmada");

  const { page } = await comoStaff(CUENTAS.admin);
  await page.goto(APP + enlaceClase(c.id));
  await page.getByRole("button", { name: "Cancelar clase" }).click();
  const d = page.getByRole("dialog", { name: "¿Cancelar esta clase?" });
  await expect(d).toContainText("Hay 2 personas");
  const motivo = "imprevisto de salud QA";
  await d.getByLabel(/^Motivo/).fill(motivo);
  await d.getByRole("button", { name: "Sí, cancelar la clase" }).click();

  const avisa = page.getByRole("dialog", { name: "Avísales" });
  await expect(avisa).toBeVisible();
  for (const p of personas) {
    const fila = avisa.getByRole("listitem").filter({ hasText: p.nombre });
    const enlace = fila.getByRole("link", { name: "Avisar" });
    await expect(enlace).toHaveAttribute("href", new RegExp(`^https://wa\\.me/${p.whatsapp}\\?text=`));
    const texto = decodeURIComponent((await enlace.getAttribute("href")).split("text=")[1]);
    expect.soft(texto, "the message names the class day").toContain(R.fechaLegible(fecha));
    expect.soft(texto, "the message carries the reason Ana typed («Va en el mensaje que les envías»)").toContain(motivo);
  }

  const despues = await apiAdmin.clase(c.id);
  expect(despues.estado).toBe("Cancelada");
  for (const p of personas) {
    const ficha = await apiAdmin.clienta(p.id);
    expect(ficha.reservas.find((r) => r.clase.id === c.id)?.estado, "her booking is cancelled").toBe("Cancelada");
    expect(ficha.saldo.clases, "the class went back to her plan").toBe(4);
  }
  // the roster no longer lists them as coming
  expect(despues.gente.filter((g) => ["Confirmada", "Pendiente de pago"].includes(g.estado))).toEqual([]);
});

test("CRM: cada segmento filtra y su número coincide con la lista", async ({ comoStaff, apiAdmin }) => {
  // the usual day: someone booked her trial from the web and has not come yet (stage «prueba»)
  const fecha = R.sumarDias(R.hoyClave(), 6);
  const c = await apiAdmin.crearClase({ fecha, hora: await apiAdmin.horaLibre(fecha, { desde: "05:00", hasta: "06:55" }), profe: "Geral" });
  const web = await clienteApi();
  expect((await web.post("/api/publico/reservas", { data: { clase: c.id, perfil: { nombre: "Prueba Web QA", whatsapp: celular() }, consentimientos: ACUERDOS, plan: "Clase de prueba", ref: "QA", website: "" } })).status()).toBe(201);
  await web.dispose();
  const { page } = await comoStaff(CUENTAS.admin);
  await page.goto(APP + "/app/admin/clientas");
  const grupo = page.getByRole("group", { name: "Segmentos" });
  const segmentos = await apiAdmin.segmentos();
  expect(segmentos.map((s) => s.id)).toEqual(expect.arrayContaining(["agendadas", "con-clases", "poquitas", "vence-pronto", "sin-clases", "pendiente-pago", "prueba", "nuevas", "inactivas", "cumple", "ficha-incompleta", "leads"]));
  const filas = page.getByRole("main").getByRole("listitem");
  const cuenta = page.getByText(/^\d+ personas?$/);

  for (const s of segmentos) {
    const chip = grupo.getByRole("button", { name: new RegExp(`^${s.nombre}\\s*\\d+$`) });
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`segmento=${s.id}`));
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const api = await apiAdmin.clientas({ segmento: s.id });
    const numeroChip = Number((await chip.textContent()).match(/(\d+)$/)[1]);
    expect(numeroChip, `chip «${s.nombre}» = API total`).toBe(api.length);
    await expect(cuenta, `«${s.nombre}»: count line`).toHaveText(`${api.length} ${api.length === 1 ? "persona" : "personas"}`);
    if (api.length) await expect(filas, `«${s.nombre}»: rows`).toHaveCount(api.length);
    else await expect(page.getByText("Nadie por aquí")).toBeVisible();
    for (const c of api.slice(0, 3)) await expect(filas.filter({ hasText: c.nombre }).first()).toBeVisible();
  }
  await grupo.getByRole("button", { name: "Todas" }).click();
  const todas = await apiAdmin.clientas();
  await expect(cuenta).toHaveText(`${todas.length} personas`);
});

test("CRM: «Ordenar · Próxima clase» ordena por la próxima clase", async ({ comoStaff }) => {
  const { page } = await comoStaff(CUENTAS.admin);
  await page.goto(APP + "/app/admin/clientas");
  await expect(page.getByText(/^\d+ personas?$/)).toBeVisible();
  const opciones = await page.getByLabel("Ordenar").locator("option").allTextContents();
  const valores = await page.getByLabel("Ordenar").locator("option").evaluateAll((os) => os.map((o) => o.value));
  for (const [i, opcion] of opciones.entries()) {
    if (valores[i] === "nombre") continue; // the default: no request
    const respuesta = page.waitForResponse((r) => r.url().includes("/api/admin/clientas?") && r.url().includes("orden=" + valores[i]));
    await page.getByLabel("Ordenar").selectOption({ label: opcion });
    expect.soft((await respuesta).status(), `«Ordenar · ${opcion}» (orden=${valores[i]}) is accepted by the API`).toBe(200);
  }
  await expect(page.getByText(/^\d+ personas?$/)).toBeVisible();
});

test("CRM: ficha de una clienta y su enlace de acceso, que abre su cuenta", async ({ comoStaff, apiAdmin, browser }) => {
  const c = await apiAdmin.clientaConPlan("8 clases al mes", "Violeta");
  const { page } = await comoStaff(CUENTAS.admin);
  await page.goto(APP + "/app/admin/clientas");
  await page.getByRole("searchbox", { name: "Buscar clienta" }).fill(c.nombre);
  await page.getByRole("link", { name: new RegExp(c.nombre) }).click();
  await expect(page).toHaveURL(new RegExp(`/app/admin/clientas/${c.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: c.nombre })).toBeVisible();
  await expect(page.getByText("8 clases disponibles")).toBeVisible();

  await page.getByRole("button", { name: "Enlace de acceso" }).click();
  const d = page.getByRole("dialog", { name: "Enlace de acceso" });
  await expect(d).toBeVisible();
  const enlace = (await d.getByText(/\/app\/acceso\//).textContent()).trim();
  expect(enlace).toMatch(/^https?:\/\/[^/]+\/app\/acceso\/[\w-]{20,}$/);
  const wa = d.getByRole("link", { name: "Enviar por WhatsApp" });
  await expect(wa).toHaveAttribute("href", new RegExp(`^https://wa\\.me/${c.whatsapp}\\?text=`));
  expect(decodeURIComponent((await wa.getAttribute("href")).split("text=")[1])).toContain(enlace);

  // the link works once, on her phone
  const suyo = await browser.newContext();
  const p2 = await suyo.newPage();
  await abrirEnlace(p2, enlace);
  await expect(p2.getByRole("heading", { level: 1 })).toContainText(`Hola, ${R.primerNombre(c.nombre)}.`);
  await suyo.close();
  await esperar(async () => (await apiAdmin.registro()).some((e) => e.accion === "clienta.acceso" && e.objeto === c.id), "access link audited");
});

const RUTAS_ADMIN = ["/app/admin", "/app/admin/agenda", "/app/admin/horario", "/app/admin/clientas", "/app/admin/clientas/C-0001", "/app/admin/mensajes",
  "/app/admin/pagos", "/app/admin/equipo", "/app/admin/ajustes", "/app/admin/cuenta", "/app/admin/registro", "/app/admin/atribucion"];
test("cada pantalla del panel carga sin caerse", async ({ comoStaff }) => {
  const { page } = await comoStaff(CUENTAS.admin);
  const errores = [];
  page.on("pageerror", (e) => errores.push(page.url() + " → " + e.message));
  for (const ruta of RUTAS_ADMIN) {
    await page.goto(APP + ruta);
    await expect(page.getByRole("heading", { level: 1 }).first(), ruta).toBeVisible();
    await expect.soft(page.getByRole("heading", { level: 1, name: "Algo se enredó" }), `${ruta} hits the error boundary`).toHaveCount(0);
  }
  expect.soft(errores, "uncaught errors").toEqual([]);
});
