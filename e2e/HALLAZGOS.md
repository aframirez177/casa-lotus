# Casa Lotus · QA findings (platform v2, 2026-10-01)

> **Status 2026-10-01 (after fixes):** every P1, P2 and P3 below is fixed in server/ and app/.
> Re-run: **89 passed · 0 failed · 9 skipped** (the API security tests run once, on desktop).
> One extra bug found on the re-run and fixed: a substitute request kept in SQLite could attach to a new class with
> the same id; cancelling a class now drops it, and the dev studio clears them when it reseeds.

Run against the dev servers (API memory driver, WhatsApp off), Chrome 375×812 (touch) and 1280×800.
Suite: `npm test` in `e2e/` → **75 passed · 14 failed · 9 skipped · 0 flaky** (two consecutive full runs, same result).
The 14 failures are 7 product bugs × 2 viewports; each test is listed with its finding. Skipped = the API
security tests, which run once (desktop project). Screenshots: `e2e/capturas/<rol>/<vista>/…` (`npm run capturas`).

| Area | Result |
|---|---|
| (a) Site, 14 pages + 404 + /app noindex + robots/llms | 40/40 pass: one H1, SEO tags, og:image served, JSON-LD valid, no class-size number, no gendered teachers, every CTA carries `ref` |
| (b) Ad → CTA → booking with full ficha | pass (both viewports): ref kept, «Pendiente de pago», Origen `Web · WEB-PRUEBA-HERO`, campaign counted, ficha and consents stored |
| (c) Admin | confirm payment works (state, purchase, `ads.conversion` audited) but no feedback (P2-1); extra class + holiday guard, weekly slot, assign profe, cancel class with WhatsApp list, access link: pass. Fails: Registro crashes (P1-1), sort option (P1-2), segment «Vinieron a prueba» (P2-2) |
| (d) Clienta | full flow passes (link, balance, on-time cancel +1, atomic reschedule, late cancel spends the class, waiting list). Fails: single-use link burnt twice in dev (P2-3) |
| (e) Profe | whole flow works (Vino/No vino, walk-in with/without plan, «Cerrar lista», «No puedo dictar» → `necesita-reemplazo` alert, future-class state). Fails only on gendered copy (P2-4) |
| (f) Security | 9/9 pass: profe → `/api/admin/*` 403; clienta cannot touch another's booking (404); no `X-Casa-Lotus` / foreign Origin / cross-site → 403; public availability leaks no names or phones; `/api/auth/codigo` identical for real and fake numbers and e-mails; a public booking with a known number opens a limited session that reveals nothing; logout kills the session server-side; login limit 5/15 min; API security headers |
| (g) PWA | manifest valid (name, 192/512/maskable with real sizes, start_url `/app/?fuente=pwa`, standalone); production build registers `/app/sw.js` with scope `/app/` and the shell loads offline. Fails: dev-only manifest link (P3-1) |

Owner = the folder that holds the fix.

## P1 · broken

**P1-1 · «Registro» (audit log) crashes: «Algo se enredó».** `/app/admin/registro`, both viewports.
`GET /api/admin/registro` returns `detalle` as an object (contract §6: `detalle` is an object, often `{}`);
`app/src/pantallas/admin/Registro.jsx:45` renders `{x.detalle}` directly → React «Objects are not valid as a React child
(found: object with keys {})» → the route error boundary. Expected: the log lists the actions (render `detalle` as
key: value text, or skip it when empty). Screenshot `capturas/admin/movil/13-registro.png`. Test: admin.spec «cada pantalla
del panel carga sin caerse». **Owner: app.**

**P1-2 · CRM «Ordenar · Próxima clase» empties the list.** `/app/admin/clientas`, both viewports. The select offers
`nombre | reciente | saldo | proxima`; the API accepts `nombre | reciente | saldo | visita` (`server/src/rutas/admin.js:82`)
→ `422 «Elige una opción de la lista.»` and the list and its count disappear. The server also has no `proxima` order in
`ORDENES` (`server/src/dominio/clientas.js:87`), and the app never offers `visita`. Expected: every option the app shows sorts
the list (add `proxima` to the server, ordered by next class with no-class last; or drop the option). Test: admin.spec
«CRM: «Ordenar · Próxima clase»…». **Owner: server (+ app to agree on the list; note it in CONTRATO.md).**

## P2 · wrong

**P2-1 · Confirming a payment from «Hoy» gives no feedback, and hides errors.** `/app/admin` → «Ya pagó» → «Ya pagó ·
Confirmar», both viewports. The write succeeds (Confirmada, purchase P-…, Ads conversion), but the sheet vanishes the
instant you tap and the toast «Listo: X quedó confirmada.» never appears. Cause: `useConfirmar` `onMutate: sinPendiente`
removes the pending card from the cache optimistically; the card owns `HojaConfirmar`, so it unmounts and the per-call
`onSuccess`/`onError` passed to `mutate()` never run. On a failure (e.g. 422 «No tiene clases disponibles…») the card
silently reappears and the error is never shown. Expected: toast on success, the error inside the sheet on failure
(move the callbacks to the hook, or render the sheet outside the card, or delay the optimistic removal until the sheet
closes). Files: `app/src/pantallas/admin/comun.jsx` (TarjetaPendiente/HojaConfirmar), `app/src/api/hooks/admin.js:48`.
Test: reserva-y-confirmacion.spec (c), soft assertion. **Owner: app.**

**P2-2 · Segment «Vinieron a prueba»: the chip says 1, the list shows everyone at stage «prueba».** `/app/admin/clientas?segmento=prueba`,
both viewports. `listarClientas` filters `f.segmentos.includes(segmento) || f.etapa === segmento`; the segment id
`prueba` collides with the stage `prueba`, so people who booked a trial and have not come yet (stage «prueba», segments
`agendadas`, `nuevas`) are listed under «Vinieron a prueba». Repro: any pending web trial booking. Expected: list length =
chip count = `/api/admin/segmentos` total (filter by segment only, or give stages a separate query param).
File: `server/src/dominio/clientas.js:97`. Test: admin.spec «CRM: cada segmento filtra…». **Owner: server.**

**P2-3 · Ana's private access link is burnt by a double request.** `/app/acceso/:token` on the dev app (both viewports):
`Acceso.jsx` does `location.replace('/api/auth/enlace/…')` inside a `useEffect`; React StrictMode (dev) runs it twice, the first
request spends the single-use token, the second gets «vencido» and lands on «Ese enlace ya no sirve». Production runs the
effect once (verified on the production build), so this only bites when testing locally, but the effect has no guard and any
remount would do the same. Expected: one request (a ref guard, or make the server accept the same token again for a few
seconds from the same IP). File: `app/src/pantallas/entrar/Acceso.jsx:17`. Test: clienta.spec «el enlace de acceso hace una
sola petición». **Owner: app.**

**P2-4 · Teachers are gendered in the app and in server texts** (rule: «profe», «tu profe», never «la/el profe»).
Seen on screen: «Laura no puede dictarla… **Asignar otra profe**» (class detail banner, `app/src/pantallas/admin/ClaseDetalle.jsx:53-54`,
fallback «La profe»), placeholder «Poca gente, festivo, **la profe** está enferma…» (`ClaseDetalle.jsx:165`, `capturas/admin/movil/19-hoja-cancelar-clase.png`),
«Cambia la clase, **la profe** o los cupos.» (`app/src/pantallas/admin/Horario.jsx:82`), alert «Pilates Aéreo: asígnale **una profe**.»
(`server/src/dominio/tablero.js:113`, `capturas/admin/movil/01-hoy-t3.png`), Ajustes help «Lo que se le paga a **la profe**…»
(`server/src/datos/esquema.js:88`, `capturas/admin/movil/11-ajustes-t2.png`). Also in fallbacks/errors not seen in this run:
`tablero.js:107` and `asignacion.js:79` «La profe», `asistencia.js:66` «la profe», `auth/usuarios.js:200` «Ese correo ya es de
una profe.», the AI tool descriptions in `server/src/herramientas/index.js:109-115`, and the demo `app/src/api/mock/servidor.js`.
Suggested: «Asignar profe», «la clase, quién la dicta o los cupos», «asígnale profe», «Lo que se paga por cada clase dictada».
Test: profe.spec (soft assertion on the banner). **Owner: app + server.**

**P2-5 · The main CTA after booking is clipped on phones.** `/app/reservar` result («Tu columpio está apartado.»), 375 px:
«Enviar comprobante por WhatsApp» is `nowrap` and 10 px wider than the button (content 295 px in 285 px): it reads
«…por WhatsAp». It is the step that turns a booking into a payment. The payment key «319 328 8469» also breaks onto two lines
next to «Copiar». Expected: the label fits (shorter «Enviar comprobante», or allow wrapping) and the key stays on one line
(smaller size, or «Copiar» below). File: `app/src/pantallas/reservar/Resultado.jsx`. Screenshot `capturas/publico/movil/19-reservar-listo.png`.
**Owner: app.**

## P3 · polish

| # | Route · viewport | What I saw | Expected | Screenshot | Owner |
|---|---|---|---|---|---|
| P3-1 | `/app/*` dev · both | Vite rewrites `<link rel="manifest" href="/manifest.webmanifest">` to `/app/manifest.webmanifest`, which returns the HTML page (`text/html`); the dev icon plugin only serves the root path. Production build is correct. | Serve `/app/manifest.webmanifest` in dev too, or keep the href absolute (`%BASE_URL%`-proof) | — (pwa.spec «en desarrollo…») | app |
| P3-2 | class picker (booking, reschedule, «Reservar») · both | Day tabs say «clases llenas» for days whose classes are cancelled or past the 3 h cut-off («hoy, clases llenas», «domingo 11 de octubre, clases llenas» after a cancellation) | «sin cupo», «cerradas» or «canceladas» as appropriate (`SelectorClase.jsx`: `libres = some(reservable)` treats every non-bookable class as full) | `capturas/clienta/movil/08-hoja-reagendar.png` | app |
| P3-3 | class picker · both | The day heading is CSS-capitalized word by word: «Sábado 3 De Octubre» | Spanish capitalizes the first letter only (`first-letter:uppercase` instead of `capitalize`) | `capturas/clienta/movil/08-hoja-reagendar.png`, `capturas/publico/movil/20-lista-de-espera.png` | app |
| P3-4 | class cards · both | Accessible name repeats the availability: «6:15 a. m. Pilates Aéreo Hay cupo Hay cupo» (swings `aria-label` + visible text) | Hide one of the two from assistive tech | — | app |
| P3-5 | `/app/admin/agenda/:id` · both | The API drops «Cancelada» and «Vencida» bookings from `ClaseEquipo.gente`, but the roster offers «Canceladas y vencidas (n)», which can then only ever show «Cancelada tarde» | Either include them (admin only) or rename the section | — | server/app |
| P3-6 | `/app/admin/mensajes` · both | With WhatsApp off, Ana sees environment variable names (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`…) as «Lo que falta para conectarlo» | Plain words for Ana («Falta conectar la cuenta de WhatsApp Business. Álvaro lo hace.»); keep the variable names for `/api/admin/salud` | `capturas/admin/movil/08-mensajes.png` | app |
| P3-7 | `/app/admin/horario` · 1280 | In the 7-column board the time breaks inside «p. m.» («6:00 p. / m.») and class tags wrap to 3 lines | `whitespace-nowrap` on the time, smaller time size in the board | `capturas/admin/escritorio/04-horario.png` | app |
| P3-8 | `/app/admin/clientas/:id` · 375 | The meta line wraps leaving lines that start with «·» («· llegó por Instagram», «· desde 2 de agosto») | Separators that wrap with the item (gap instead of leading dots) | `capturas/admin/movil/07-clienta-t1.png` | app |
| P3-9 | `/app/admin/clientas` · 375 | Search placeholder cut: «Buscar por nombre, WhatsApp o c»; with `?segmento=` the active chip is off-screen in the horizontal row | Shorter placeholder («Buscar clienta»); scroll the active chip into view | `capturas/admin/movil/05-clientas-t1.png`, `06-clientas-segmento.png` | app |
| P3-10 | cancel-class sheet · both | «Sí, cancelar la clase» (danger variant) is pale pink with red text next to a white «No, volver»: it reads as disabled | A solid danger button | `capturas/admin/escritorio/19-hoja-cancelar-clase.png` | app |
| P3-11 | `/app/admin/ajustes` · both | «WhatsApp de reservas» shows raw `573128720888` while «Llave de pago» shows `319 328 8469` | Same readable format (`312 872 0888`) | `capturas/admin/movil/11-ajustes-t2.png` | app |
| P3-12 | booking «Tú», waiting list, validation messages · both | The sample phone in the visitor's own WhatsApp field is the studio's bookings number (placeholder «312 872 0888», error «como 312 872 0888») | A neutral sample («300 123 4567») so nobody types or thinks it prefilled the studio's number | `capturas/publico/movil/12-reservar-tu.png` | app + server (`esquemas.js` MSJ_WHATSAPP) |
| P3-13 | `/app/invitacion/:token` (invalid) · both | Copy repeats itself: «Esta invitación ya no sirve. Pídele una nueva a Ana. Pídele a Ana que te envíe una nueva.» | One sentence (server message + app sentence are concatenated) | `capturas/publico/movil/06-invitacion-invalida.png` | app |
| P3-14 | `/app/admin/agenda` · 375 | The floating «+» sits over the cards' count/arrow column | Extra bottom/right padding under the FAB, or a smaller FAB | `capturas/admin/movil/02-agenda.png` | app |
| P3-15 | «Cuenta» (admin and profe) · both | «Sesiones abiertas» lists every session with no cap (174 in dev after the suite) | Cap to the latest ~10 and offer «Cerrar las demás» (already there) | `capturas/profe/movil/07-cuenta-t1.png` | app/server |
| P3-16 | `GET /api/admin/agenda?desde&hasta` | Also returns older classes with attendance pending outside the range (by design for «Por marcar»), not stated in the contract | Document it in CONTRATO.md §6, or a flag | — | server |
| P3-17 | admin API | A booking's «Atribución» (utm + gclid) is not readable from any endpoint; the gclid can only be verified indirectly (the `ads.conversion` audit after a paid confirmation) | Expose it in `ClientaDetalle.reservas` (admin only) so Ana/Álvaro can audit a sale's click | — | server |

## Notes

- Nothing on the site states a class size or genders the teachers; the app does (P2-4). The suite now checks both rules
  on every site page and on the substitute banner/alert.
- All attribution steps hold: `localStorage.cl_atribucion` keeps the gclid, the CTA hands `ref` to the app, «¿Cómo llegaste?»
  is prefilled «Google», the booking is counted under campaign «prueba / google / cpc», and the paid trial produces the
  «Clase de prueba pagada» conversion for 25000 COP.
- The dev data used for the screenshots is the fresh fake studio plus what the suite creates (names ending in `QA…`).
