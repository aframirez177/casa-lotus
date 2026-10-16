// Cupos fijos: Ana loads a regular from «Horario» (her next classes in that slot get booked with her plan and show
// «Fija» on the roster), then pauses it from the clienta detail with «Cancelar sus clases ya reservadas» (on by
// default): the bookings are cancelled without cost and the classes go back to her plan.
// Everything is built here through the admin API (a slot of its own on Sunday at dawn, a fresh person with a plan).
import { test, expect } from "../lib/prueba.js";
import { R, esperar } from "../lib/api.js";
import { APP, CUENTAS } from "../lib/entorno.js";

const PLURAL = "domingos";

test("cupo fijo: se agrega desde Horario, reserva sus próximas clases y al pausarlo vuelven a su plan", async ({ comoStaff, apiAdmin }) => {
  // a weekly slot nobody else uses
  const usadas = new Set((await apiAdmin.horario()).map((s) => s.id));
  let hora;
  for (let i = 0; i < 60 && (!hora || usadas.has("Domingo " + hora)); i++) hora = `05:${String(Math.floor(Math.random() * 12) * 5).padStart(2, "0")}`;
  const { slot } = await apiAdmin.post("/api/admin/horario", { dia: "Domingo", hora, clase: "Yoga Aéreo", profe: "Ximena", cupos: 6, activa: true }, 201);
  const persona = await apiAdmin.clientaConPlan("8 clases al mes", "Clara");
  const nombre = R.primerNombre(persona.nombre);
  const texto = `${PLURAL} ${R.horaLegible(hora)}`;
  let idFijo = "";

  try {
    const { page } = await comoStaff(CUENTAS.admin);
    await page.goto(APP + "/app/admin/horario");

    // the slot card: no regulars yet → its sheet opens with the search ready
    await page.getByRole("button", { name: `Alumnas fijas de los ${texto}: Sin fijas` }).click();
    const hoja = page.getByRole("dialog", { name: `Alumnas fijas · ${texto}` });
    await expect(hoja).toBeVisible();
    await hoja.getByLabel("Buscar alumna para agregar").fill(persona.nombre.split(" ").pop()); // the unique QA suffix
    await hoja.getByRole("button", { name: new RegExp(persona.nombre) }).click();
    const resultado = hoja.getByRole("status");
    await expect(resultado).toContainText(`${nombre} queda fija los ${texto}`);
    await expect.soft(resultado).toContainText("Reservamos");
    // ready for the next person without closing anything
    await expect.soft(hoja.getByLabel("Buscar alumna para agregar")).toHaveValue("");
    await expect.soft(hoja.getByRole("link", { name: persona.nombre })).toBeVisible();

    // the API: her classes in that slot (the next days) are booked from this fijo, confirmed with her plan
    const ficha = await apiAdmin.clienta(persona.id);
    const fijo = (ficha.fijos || []).find((f) => f.slot === slot.id);
    expect(fijo, "her detail lists the fijo").toMatchObject({ estado: "Activo", dia: "Domingo", hora, slotTexto: texto, clienta: { id: persona.id } });
    idFijo = fijo.id;
    const suyas = ficha.reservas.filter((r) => r.fijo === fijo.id);
    expect(suyas.length, "at least one class in the window was booked").toBeGreaterThan(0);
    for (const r of suyas) expect(r).toMatchObject({ estado: "Confirmada", clase: { dia: "Domingo", hora } });
    expect(fijo.proximas.map((p) => p.clase.id).sort()).toEqual(suyas.map((r) => r.clase.id).sort());
    expect(ficha.saldo.clases, "each booked class spends one of her plan").toBe(8 - suyas.length);
    const slotAhora = (await apiAdmin.horario()).find((s) => s.id === slot.id);
    expect(slotAhora).toMatchObject({ cuposFijos: 1, fijos: [{ id: fijo.id, clienta: { id: persona.id }, estado: "Activo" }] });

    // the class roster says «Fija»
    await page.goto(APP + `/app/admin/agenda/${encodeURIComponent(suyas[0].clase.id)}`);
    const tarjeta = page.getByRole("listitem").filter({ hasText: persona.nombre });
    await expect(tarjeta.getByText("Fija", { exact: true })).toBeVisible();

    // her detail: «Horario fijo» → Pausar (from today) with «Cancelar sus clases ya reservadas» on
    await page.goto(APP + `/app/admin/clientas/${persona.id}`);
    await expect(page.getByRole("heading", { name: "Horario fijo" })).toBeVisible();
    await page.getByRole("button", { name: `Pausar el horario fijo de ${nombre}` }).click();
    const cancelar = page.getByRole("switch", { name: "Cancelar sus clases ya reservadas" });
    await expect(cancelar).toHaveAttribute("aria-checked", "true");
    await expect.soft(page.getByText("La clase vuelve a su plan.")).toBeVisible();
    await page.getByLabel("Pausar desde").fill(R.hoyClave());
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect.soft(page.getByText(/volvi(ó|eron) a su plan\./)).toBeVisible();

    const despues = await esperar(async () => {
      const f = await apiAdmin.clienta(persona.id);
      return f.fijos.find((x) => x.id === fijo.id)?.estado === "Pausado" ? f : null;
    }, "the fijo is paused");
    for (const r of despues.reservas.filter((x) => suyas.some((y) => y.id === x.id))) expect(r.estado, `${r.clase.id} was cancelled`).toBe("Cancelada");
    expect(despues.saldo.clases, "the classes went back to her plan").toBe(8);
    expect(despues.fijos.find((x) => x.id === fijo.id).proximas).toEqual([]);
    await expect(page.getByText("Pausado", { exact: true })).toBeVisible();
    expect((await apiAdmin.horario()).find((s) => s.id === slot.id).cuposFijos, "a paused regular holds no swing").toBe(0);
  } finally {
    // leave the studio as it was
    if (idFijo) await apiAdmin.del(`/api/admin/fijos/${idFijo}`);
    await apiAdmin.del(`/api/admin/horario/${encodeURIComponent(slot.id)}`);
  }
});
