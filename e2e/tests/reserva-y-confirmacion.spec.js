// (b) Attribution end to end: an ad click lands on /clase-de-prueba/, the main CTA hands off to /app/reservar,
// a NEW person books with her whole ficha, and the booking reaches the Sheet as «Pendiente de pago» with its
// ref and campaign. (c, first part) Ana confirms it from «Hoy» with the payment: «Confirmada», the purchase is
// on her account and the Google Ads conversion is produced (the audit log records it).
import { test, expect, visible } from "../lib/prueba.js";
import { R, perfilCompleto, nombreNuevo, esperar } from "../lib/api.js";
import { APP, CUENTAS, WHATSAPP_RESERVAS, LLAVE_PAGO } from "../lib/entorno.js";

const ANUNCIO = "/clase-de-prueba/?utm_source=google&utm_medium=cpc&utm_campaign=prueba&gclid=TEST123";

test.describe.serial("clase de prueba desde un anuncio de Google", () => {
  /** shared between the two steps: what the first one booked */
  let reserva;

  test("(b) anuncio → CTA → reserva completa → pago pendiente con atribución", async ({ page, apiAdmin }) => {
    const antes = await apiAdmin.atribucion();
    const campanaAntes = antes.porCampana.find((x) => x.campana === "prueba" && x.source === "google" && x.medium === "cpc")?.reservas || 0;

    await page.goto(ANUNCIO);
    const guardada = await page.evaluate(() => JSON.parse(localStorage.getItem("cl_atribucion") || "null"));
    expect(guardada?.clickIds?.gclid, "the site keeps the gclid first-party").toBe("TEST123");
    expect(guardada?.utm).toMatchObject({ source: "google", medium: "cpc", campaign: "prueba" });

    const cta = page.locator(".page-hero a.btn--primary");
    await expect(cta).toHaveAttribute("href", /^\/app\/reservar\?ref=WEB-PRUEBA-HERO&plan=Clase\+de\+prueba$/);
    await cta.click();
    await expect(page).toHaveURL(/\/app\/reservar\?ref=WEB-PRUEBA-HERO/);
    await expect(page.getByRole("heading", { level: 1, name: "Aparta tu columpio." })).toBeVisible();
    await expect(page.getByText(/Clase de prueba\s*·\s*\$25\.000/)).toBeVisible();

    // the first class open for booking
    const tarjeta = page.locator("ul button[aria-pressed]").first();
    await expect(tarjeta).toBeVisible();
    await tarjeta.click();
    await expect(tarjeta).toHaveAttribute("aria-pressed", "true");
    await visible(page.getByRole("button", { name: "Continuar" })).click();

    // «Tú»
    await expect(page.getByRole("heading", { level: 1, name: "¿Quién viene?" })).toBeVisible();
    await expect(page).toHaveURL(/paso=tu/);
    await expect(page).toHaveURL(/ref=WEB-PRUEBA-HERO/);
    const p = perfilCompleto(nombreNuevo("Renata"));
    await page.getByLabel("Nombre y apellido").fill(p.nombre);
    await page.getByLabel("WhatsApp", { exact: true }).fill(p.whatsapp);
    await page.getByLabel(/^Correo/).fill(p.correo);
    await visible(page.getByRole("button", { name: "Continuar" })).click();

    // «Tu ficha»: every field of Ana's form
    await expect(page.getByRole("heading", { level: 1, name: "Cuéntanos de ti" })).toBeVisible();
    await page.getByRole("radio", { name: "Ninguna" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Mamá de Renata");
    await page.getByLabel("Su WhatsApp").fill(p.contactoEmergencia.whatsapp);
    await page.getByLabel(/^EPS/).fill("Sura");
    await page.getByRole("radio", { name: "Primera vez" }).click();
    await page.getByRole("button", { name: "Reducir niveles de estrés / ansiedad" }).click();
    await page.getByRole("button", { name: "Mejorar la calidad de sueño y relajación" }).click();
    await expect(page.getByRole("button", { name: "Reducir niveles de estrés / ansiedad" })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Fecha de nacimiento").fill("1995-04-20");
    await page.getByLabel("Barrio").fill("Teusaquillo");
    // utm_source=google prefills «¿Cómo llegaste?»
    await expect(page.getByRole("radio", { name: "Google" })).toHaveAttribute("aria-checked", "true");
    await visible(page.getByRole("button", { name: "Continuar" })).click();

    // «Acuerdos»: all of them, and the image choice
    await expect(page.getByRole("heading", { level: 1, name: "Últimos acuerdos" })).toBeVisible();
    await page.getByRole("checkbox", { name: /Leí y acepto/ }).click();
    await page.getByRole("checkbox", { name: /Autorizo/ }).click();
    await page.getByRole("radio", { name: "Sí, estoy de acuerdo" }).click();
    await page.getByRole("switch", { name: "Novedades por WhatsApp" }).click();
    await expect(page.getByRole("switch", { name: "Novedades por WhatsApp" })).toHaveAttribute("aria-checked", "true");

    const respuesta = page.waitForResponse((r) => r.url().includes("/api/publico/reservas") && r.request().method() === "POST");
    await visible(page.getByRole("button", { name: /^Apartar/ })).click();
    const r = await respuesta;
    expect(r.status(), await r.text()).toBe(201);
    const cuerpo = await r.json();

    // the result: amount, payment key, WhatsApp receipt link and the hold countdown
    await expect(page.getByRole("heading", { level: 1, name: "Tu columpio está apartado." })).toBeVisible();
    await expect(page.getByText("$25.000", { exact: true })).toBeVisible();
    await expect(page.getByText(LLAVE_PAGO, { exact: true })).toBeVisible();
    const wa = page.getByRole("link", { name: "Enviar comprobante por WhatsApp" });
    await expect(wa).toHaveAttribute("href", new RegExp(`^https://wa\\.me/${WHATSAPP_RESERVAS}\\?text=.+`));
    expect(decodeURIComponent((await wa.getAttribute("href")).split("text=")[1])).toContain(cuerpo.codigo);
    await expect(page.getByText(/Te lo guardamos .+ \(hasta .+\)\. Si no llega el pago, el columpio se libera solo\./)).toBeVisible();
    await expect(page.getByText(`Código ${cuerpo.codigo}`)).toBeVisible();

    // the Sheet: «Pendiente de pago», Origen with the ref, Atribución with the campaign
    const clase = await apiAdmin.clase(cuerpo.clase.id);
    const fila = clase.gente.find((g) => g.reserva === cuerpo.codigo);
    expect(fila, "the booking is on the class roster").toBeTruthy();
    expect(fila.estado).toBe("Pendiente de pago");
    expect(fila.origen).toBe("Web · WEB-PRUEBA-HERO");
    expect(fila.nombre).toBe(p.nombre);
    const despues = await apiAdmin.atribucion();
    const campana = despues.porCampana.find((x) => x.campana === "prueba" && x.source === "google" && x.medium === "cpc");
    expect(campana?.reservas, "Atribución carries utm source/medium/campaign").toBe(campanaAntes + 1);
    const ficha = await apiAdmin.clienta(fila.clienta);
    expect(ficha.perfil).toMatchObject({
      nombre: p.nombre, correo: p.correo, salud: "Ninguna", eps: "Sura", experiencia: "Primera vez", barrio: "Teusaquillo", nacimiento: "1995-04-20", llego: "Google",
      contactoEmergencia: { nombre: "Mamá de Renata" },
    });
    expect(ficha.perfil.intereses).toEqual(["Reducir niveles de estrés / ansiedad", "Mejorar la calidad de sueño y relajación"]);
    expect(ficha.consentimientos.datos?.acepta).toBe(true);
    expect(ficha.consentimientos.descargo?.acepta).toBe(true);
    expect(ficha.consentimientos.imagen?.acepta).toBe(true);
    expect(ficha.consentimientos.novedades?.acepta).toBe(true);
    expect(ficha.fichaCompleta).toBe(true);

    reserva = { codigo: cuerpo.codigo, clase: cuerpo.clase.id, clienta: fila.clienta, nombre: p.nombre };
  });

  test("(c) Ana confirma el pago desde «Hoy»: Confirmada, compra y conversión de Ads", async ({ comoStaff, apiAdmin }) => {
    test.skip(!reserva, "needs the booking from the previous step");
    const { page } = await comoStaff(CUENTAS.admin);
    await page.goto(APP + "/app/admin");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Buen(os|as) (días|tardes|noches), Ana\./);

    const tarjeta = page.getByRole("region", { name: "Por confirmar" }).locator("article").filter({ hasText: reserva.nombre });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta).toContainText("Web · WEB-PRUEBA-HERO");
    await expect(tarjeta).toContainText(/Se libera en/);
    await tarjeta.getByRole("button", { name: "Ya pagó" }).click();

    const hoja = page.getByRole("dialog", { name: `Confirmar a ${R.primerNombre(reserva.nombre)}` });
    await expect(hoja).toBeVisible();
    await expect(hoja.getByLabel("¿Qué pagó?")).toHaveValue("Clase de prueba");
    await hoja.getByLabel("¿Por dónde?").selectOption("Nequi");
    await expect(hoja.getByLabel("Valor")).toHaveValue("$25.000");
    await hoja.getByRole("button", { name: "Ya pagó · Confirmar" }).click();
    // feedback: the sheet closes and a toast says it worked (soft: the state checks below must still run)
    await expect.soft(page.getByText(`Listo: ${R.primerNombre(reserva.nombre)} quedó confirmada.`), "success toast after «Ya pagó · Confirmar»").toBeVisible();
    await expect(hoja).toBeHidden();
    await expect(page.getByRole("region", { name: "Por confirmar" }).locator("article").filter({ hasText: reserva.nombre })).toHaveCount(0);

    // the Sheet: Confirmada, charged to the new purchase
    const clase = await apiAdmin.clase(reserva.clase);
    expect(clase.gente.find((g) => g.reserva === reserva.codigo)?.estado).toBe("Confirmada");
    const ficha = await apiAdmin.clienta(reserva.clienta);
    const compra = ficha.compras.find((c) => c.plan === "Clase de prueba");
    expect(compra, "the trial purchase is on her account").toMatchObject({ valor: 25000, medio: "Nequi", clases: 1, usadas: 1, disponibles: 0 });
    expect(ficha.saldo.clases, "the trial class is spent by this booking").toBe(0);
    expect(ficha.reservas.find((x) => x.id === reserva.codigo)?.compra).toBe(compra.id);

    // the Google Ads conversion (gclid TEST123 came with the booking): audited as ads.conversion for that purchase
    const conversion = await esperar(async () => (await apiAdmin.registro()).find((e) => e.accion === "ads.conversion" && e.objeto === compra.id), "ads.conversion audited");
    expect(conversion.detalle).toMatchObject({ nombre: "Clase de prueba pagada", valor: "25000" });
    const atrib = await apiAdmin.atribucion();
    const fila = atrib.porRef.find((x) => x.ref === "WEB-PRUEBA-HERO");
    expect(fila?.confirmadas).toBeGreaterThanOrEqual(1);
    expect(fila?.ingresos).toBeGreaterThanOrEqual(25000);
  });
});
