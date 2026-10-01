# Casa Lotus · platform contract (v2)

The one document `server/`, `app/` and `site/` agree on. Change it here first, then in code.
Domain words stay in Spanish (they are the words Ana uses and the Sheet's headers); prose is English.
UI copy is Colombian neutral Spanish. Never gender the teachers: «profe», «tu profe».

## 1. Shape of the platform

```
casalotus.studio            site/   Astro MPA, static, indexable (SEO/SEM/AEO/GEO)
casalotus.studio/app/       app/    React + Tailwind PWA (clienta, profe, admin), noindex
casalotus.studio/api/       server/ Express API (Docker on the droplet)
                                    ├─ Google Sheet «Casa Lotus · Sistema» = business record (Sheets API)
                                    └─ SQLite = system internals (accounts, sessions, CRM messages, audit, events, push)
shared/                     pure ESM shared by all three: reglas.js, tema.css, this contract
```

- One origin: the app calls `/api/...` with `credentials: "include"`. No CORS in production.
- Dev ports: server **8787**, app **5180** (Vite, base `/app/`, proxies `/api` → 8787), site **4321** (Astro, proxies `/api` → 8787 and `/app` → 5180).
- Node **24** everywhere (`.nvmrc`). Each folder is an independent npm project (own `package.json` and lockfile). **No npm workspaces.** Shared code is imported by relative path from `../shared/` (`../../shared/` from `src/`).
- Time zone: Bogotá, UTC−5, no DST. Dates travel as `"yyyy-MM-dd"`, times as `"HH:mm"`, instants as ISO strings. Use `shared/reglas.js` for every date rule, never `new Date()` arithmetic in local time.
- Money: COP integers. Display with `dinero()` → `$158.000`.

## 2. The Sheet (source of truth for the business)

Tabs and typed columns (calculated columns come after them and are formulas: **never write them**).
The server reads every tab by header name and writes **only typed columns**, so new columns can be added in the Sheet without breaking it. If a column the server wants to write does not exist yet, it skips it and reports it in `GET /api/admin/salud`.

| Tab | Typed columns (order) | Calculated |
|---|---|---|
| Clases | ID, Fecha, Día, Hora, Clase, Profe, Cupos, Estado (Programada/Cancelada), Notas, **Tipo** (Regular/Extra) | Ocupados, Libres |
| Reservas | ID, Creada, Clase, Clienta, Estado, Compra, Origen, Vence apartado, Notas, **Reagendada de**, **Atribución** | Nombre, WhatsApp |
| Clientas | ID, Nombre, WhatsApp, Correo, Desde, Cómo llegó, Acepta datos, Notas, **Nacimiento, Barrio, Intereses, Salud, EPS, Contacto de emergencia, Experiencia, Autoriza imagen, Descargo, Datos sensibles, Etiquetas** | Clases disponibles, Plan vence |
| Compras | ID, Fecha, Clienta, Plan, Clases, Valor, Medio de pago, Inicio, Notas | Nombre, Vence, Usadas, Disponibles, Estado |
| Espera | ID, Creada, Clase, Clienta, Estado (Esperando/Avisada/Tomó el cupo/Ya no), Notas | Nombre, WhatsApp |
| Horario | Día, Hora, Clase, Profe, Cupos, Activa (Sí/No) | — |
| Planes | Plan, Clases, Precio, Vigencia (días), Tipo (Prueba/Mensual/Trimestral/Ajuste), Activo | — |
| Ajustes | Ajuste, Valor, Para qué sirve | — |
| **Conversiones Ads** | Google Click ID, Conversion Name, Conversion Time, Conversion Value, Conversion Currency | — |

**Bold** = new in v2 (the Sheet's installer, `apps-script/sistema/Esquema.js`, adds them).

IDs: `C-0001` clientas, `R-0001` reservas, `P-0001` compras, `E-0001` espera. Class id = `"yyyy-MM-dd HH:mm"`. Horario slot id = `"<Día> <HH:mm>"`.

Rules that never bend:
- **Balances are computed, never typed:** classes bought − bookings that spend a class (`CONSUMEN`). See `shared/reglas.js`.
- States: `Pendiente de pago` (holds a swing until «Vence apartado»), `Confirmada`, `Asistió`, `No vino`, `Cancelada` (class goes back), `Cancelada tarde` (frees the swing, spends the class), `Vencida` (unpaid hold expired).
- Holidays have no class (computed).
- Every write to the Sheet happens inside the server's single write lock, re-reading what it needs inside the lock.

Ajustes keys the platform reads (missing → default, and the server appends the row with its default the first time):

| Ajuste | Default | Use |
|---|---|---|
| Cupos por clase | 8 | default for new classes |
| Horas para pagar una reserva web | 12 | hold time for an unpaid booking |
| Horas mínimas para reservar | 3 | booking cut-off |
| Horas mínimas para cancelar | 6 | cancel / reschedule cut-off (with notice → class back) |
| Cambios permitidos clase de prueba | 1 | reschedules allowed on a trial booking |
| Mínimo de personas | 2 | below it, a class shows «poca gente» |
| Semanas de clases hacia adelante | 4 | calendar horizon |
| Aviso de saldo bajo (clases) | 2 | «poquitas» threshold |
| Días para avisar vencimiento | 7 | «vence pronto» window |
| WhatsApp de reservas | 573128720888 | where receipts go |
| Llave de pago | 319 328 8469 | Nequi / DaviPlata / Bre-B key (never bank account numbers) |
| Correo para avisos | casalotusbogota@gmail.com | email on each web booking |
| Pago por clase a profes | *(empty)* | teacher cost per class taught, admin only. Set in the Sheet, **never in code**: this repo is public and business figures stay out of it. Empty → the app hides teacher cost. |

## 3. Accounts and sessions (SQLite, never the Sheet)

| Role | Who | How they sign in |
|---|---|---|
| `admin` | Ana, Álvaro | email + password (scrypt). Reset by email code. |
| `profe` | Ximena, Laura, Geral… | invited by an admin (one-time link, sent by WhatsApp share), then email + password |
| `clienta` | every student | passwordless: 6-digit code to her WhatsApp (when the Meta API is live) or email; or a private access link Ana sends; a web booking also opens a session on that device |

- Session = opaque random token (32 bytes) in cookie `cl_sesion`: `HttpOnly; Secure; SameSite=Lax; Path=/`. Stored hashed (SHA-256) in SQLite with role, user id, created, last seen, user agent, ip. Staff: 30-day sliding expiry. Clienta: 180 days.
- CSRF: every non-GET request must carry header `X-Casa-Lotus: 1` and, when present, a same-site `Origin`. The app's fetch wrapper always sends it.
- Rate limits: login 5/15 min per email+IP; codes 3/hour per phone, 10/hour per IP; public booking 10/hour per IP.
- Codes and invitation/reset tokens are stored hashed, single-use, 10 minutes (codes) / 7 days (invitations) / 1 hour (reset).
- Staff record: `{ id, rol, nombre, nombreHorario, correo, whatsapp, activa, bio, foto, creada, ultimoAcceso }`. `nombreHorario` is the name as written in Clases/Horario «Profe» (accent- and case-insensitive match).
- Clienta session binds to the Sheet id (`C-0001`) and her WhatsApp.
- Bootstrap: `node server/scripts/crear-admin.mjs --correo … --nombre …` prints a one-time setup link.

## 4. HTTP conventions

- JSON in and out. Success: the resource (or `{ ok: true, ... }` for actions). Failure: HTTP 4xx/5xx with
  `{ ok: false, error: "<codigo>", mensaje: "<texto para mostrar>", campos?: { campo: "mensaje" } }`.
- Codes: `no-autenticado` 401 · `sin-permiso` 403 · `no-existe` 404 · `validacion` 422 · `conflicto` 409 (with `motivo`: `llena`, `tarde`, `cancelada`, `ya-reservada`, `muchas-pendientes`, `cambios`, `empezo`, `estado`) · `limite` 429 · `servidor` 500 · `no-configurado` 503 (e.g. WhatsApp not connected).
- Every write returns the fresh object(s) it changed, so the app can update its cache without refetching everything.
- Every write is recorded in the audit log with the actor.

## 5. Shared objects

```ts
Clase = {
  id: "2026-10-03 08:00", fecha: "2026-10-03", dia: "Sábado", hora: "08:00",
  fechaTexto: "sábado 3 de octubre", horaTexto: "8:00 a. m.",
  clase: "Pilates Aéreo" | "",            // "" when «Por confirmar»
  tipo: "Regular" | "Extra",
  cupos: 8, ocupados: 5, libres: 3,
  reservable: true, motivo?: "llena" | "tarde" | "cancelada",
  estado: "Programada" | "Cancelada"
}
// staff only (admin, and profe for their own classes):
ClaseEquipo = Clase & {
  profe: "Ximena", notas: "", esHoy: boolean, pasada: boolean, pocaGente: boolean,
  gente: Asistente[], espera: EsperaItem[]
}
Asistente = {
  reserva: "R-0012", clienta: "C-0003", nombre, whatsapp, whatsappTexto, estado,
  primeraVez: boolean, experiencia: "" | "Primera vez" | "Algo de experiencia" | "Practico seguido",
  salud: string,                         // free text; admin and the class's profe only
  cumple: boolean,                       // birthday within ±3 days
  autorizaImagen: boolean | null, contactoEmergencia: string, origen: string
}
EsperaItem = { id: "E-0003", clienta, nombre, whatsapp, creada, estado }
Saldo = { clases: 3, vence: "2026-10-30", venceTexto: "viernes 30 de octubre" }
Compra = { id, fecha, clienta, nombre, plan, clases, valor, medio, inicio, vence, usadas, disponibles, estado: "Vigente"|"Agotado"|"Vencido" }
Plan = { nombre, clases, precio, vigencia, tipo, activo }
Perfil = {                               // Ana's Google Form + what booking needs
  nombre, whatsapp, correo, nacimiento: "yyyy-MM-dd" | "", barrio,
  intereses: string[],                   // up to 2, from INTERESES below
  salud: string,                         // "Ninguna" | free text | "Prefiero contárselo a mi profe"
  eps, contactoEmergencia: { nombre, whatsapp },
  experiencia, llego: "Instagram" | "Facebook" | "Referencia de un amigo/a" | "Google" | "Otro"
}
Consentimientos = {
  datos: { acepta: boolean, fecha, version },          // Ley 1581: tratamiento de datos personales
  sensibles: { acepta: boolean, fecha, version },      // datos de salud (opcional, art. 6)
  descargo: { acepta: boolean, fecha, version },       // descargo de responsabilidad (texto de Ana)
  imagen: { acepta: boolean, fecha },                  // registro audiovisual
  novedades?: { acepta: boolean, fecha, version }      // optional marketing opt-in for WhatsApp (default off)
}
```

`INTERESES` (Ana's form, verbatim labels): «Objetivos estéticos: bajar de peso / tono muscular» · «Desarrollar fuerza, flexibilidad y conciencia corporal» · «Reducir niveles de estrés / ansiedad» · «Progreso físico hacia posturas más avanzadas y acrobáticas» · «Aprender sobre meditación, mindfulness o técnicas de respiración» · «Incorporar buenos hábitos, disciplina y constancia» · «Mejorar la calidad de sueño y relajación» · «Construir comunidad en torno al bienestar».

Consent texts and their versions live in `shared/consentimientos.js` (site renders them on /privacidad and /terminos; app renders them in the booking flow; server stores `version`).

## 6. Endpoints

### Public (no session)
| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/publico/disponibilidad` | `?desde=yyyy-MM-dd&dias=21` | `{ actualizado, horasParaPagar, clases: Clase[] }` (counts only, no names) |
| GET | `/api/publico/planes` | — | `Plan[]` (active) |
| GET | `/api/publico/estudio` | — | `{ whatsapp, llavePago, mediosPago: string[], politicas: { horasReservar, horasCancelar, horasPagar, cambiosPrueba } }` |
| POST | `/api/publico/reservas` | `{ clase, perfil: Perfil, consentimientos, plan?: "Clase de prueba"…, ref, utm?: {source,medium,campaign,term,content}, clickIds?: {gclid,gbraid,wbraid,fbclid}, website: "" }` | `201 { codigo, estado, clase: Clase, pago: { monto, plan, llave, medios, whatsapp, venceApartado, waTexto, waEnlace }, sesion: true }` + sets the clienta session cookie. A known WhatsApp books as that clienta (profile fields only fill blanks; nothing reveals that she exists). |
| POST | `/api/publico/espera` | `{ clase, nombre, whatsapp, consentimientos }` | `201 { id }` |
| POST | `/api/publico/eventos` | `{ tipo: "cta"|"vista"|"reserva-inicio"|…, ref, pagina, utm?, clickIds? }` (sendBeacon) | `204` |

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/auth/yo` | — | `{ usuario: { id, rol, nombre, correo?, whatsapp?, clienta? } }` or 401 |
| POST | `/api/auth/entrar` | `{ correo, password }` | `{ usuario }` + cookie (staff) |
| POST | `/api/auth/codigo` | `{ whatsapp }` or `{ correo }` | `{ canal: "whatsapp"|"correo"|"ninguno", destino: "•••• 0888" }` (always 200, never reveals if she exists) |
| POST | `/api/auth/verificar` | `{ whatsapp|correo, codigo }` | `{ usuario }` + cookie (clienta) |
| GET | `/api/auth/enlace/:token` | — | sets cookie, `302 /app/mi` (access link Ana sends) |
| POST | `/api/auth/salir` | — | `204` |
| POST | `/api/auth/password` | `{ actual, nueva }` | `204` (staff; min 10 chars, not in a common-password list) |
| POST | `/api/auth/recuperar` | `{ correo }` | `204` always (sends a reset link if it exists) |
| POST | `/api/auth/restablecer` | `{ token, nueva }` | `{ usuario }` + cookie |
| GET | `/api/auth/invitacion/:token` | — | `{ nombre, correo, rol }` |
| POST | `/api/auth/invitacion/:token` | `{ password }` | `{ usuario }` + cookie |
| GET | `/api/auth/sesiones` | — | `[{ id, actual, creada, ultimoUso, dispositivo }]` |
| DELETE | `/api/auth/sesiones/:id` | — | `204` (`:id = "otras"` closes every other session) |
| PATCH | `/api/auth/cuenta` | `{ nombre?, whatsapp?, bio?, foto? }` (staff) | `{ usuario }` |

### Clienta (`/api/yo`, role clienta)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/yo` | — | `{ clienta: { id, perfil: Perfil, consentimientos, fichaCompleta }, saldo: Saldo, compras: Compra[] (vigentes), proximas: ReservaClienta[], historial: ReservaClienta[] (last 20), espera: EsperaItem[], politicas, pago }` |
| PATCH | `/api/yo/perfil` | partial `Perfil` | `{ perfil, fichaCompleta }` |
| POST | `/api/yo/consentimientos` | partial `Consentimientos` (acepta flags) | `{ consentimientos }` |
| POST | `/api/yo/reservas` | `{ clase }` | `201 ReservaClienta` (Confirmada if a plan covers it, else Pendiente de pago with `pago`) |
| POST | `/api/yo/reservas/:id/cancelar` | — | `{ reserva: ReservaClienta, devolvioClase, mensaje }` |
| POST | `/api/yo/reservas/:id/reagendar` | `{ clase }` | `{ anterior: ReservaClienta, nueva: ReservaClienta, mensaje }` (atomic) |
| POST | `/api/yo/espera` | `{ clase }` | `201 EsperaItem` |
| DELETE | `/api/yo/espera/:id` | — | `204` |

`ReservaClienta = { id, estado, clase: Clase, compra?, plan?, puedeCancelar, cancelarSinCosto, limiteCancelar (ISO), puedeReagendar, limiteReagendar (ISO), reagendadaDe?, pago? }`

### Profe (`/api/profe`, role profe; admin may call it too)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/profe/clases` | `?desde&hasta` (default today → +14) | `ClaseEquipo[]` of classes whose Profe matches her/him (past 7 days with attendance pending included) |
| GET | `/api/profe/clases/:id` | — | `ClaseEquipo` |
| POST | `/api/profe/reservas/:id/asistencia` | `{ vino: boolean }` | `ClaseEquipo` |
| POST | `/api/profe/clases/:id/notas` | `{ texto }` | `ClaseEquipo` |
| GET | `/api/profe/resumen` | `?mes=yyyy-MM` | `{ mes, clasesDictadas, asistentes, proximas, ocupacionPct }` |

### Admin (`/api/admin`, role admin)
| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/admin/tablero` | — | `Tablero` (below) |
| GET | `/api/admin/novedades` | `?desde=ISO` | `{ ahora, eventos: Evento[] }` — the bell (also pushed by SSE and Web Push) |
| GET | `/api/admin/stream` | — | Server-Sent Events: `evento` messages with `Evento` |
| GET | `/api/admin/agenda` | `?desde&hasta` | `ClaseEquipo[]` |
| POST | `/api/admin/clases` | `{ fecha, hora, clase, profe, cupos?, notas? }` | `201 ClaseEquipo` (Tipo = Extra; refuses holidays unless `forzar`, and an existing id) |
| PATCH | `/api/admin/clases/:id` | `{ clase?, profe?, cupos?, notas? }` | `ClaseEquipo` (cupos never below ocupados) |
| POST | `/api/admin/clases/:id/cancelar` | `{ motivo }` | `{ clase, afectadas: Asistente[] (with waTexto to notify) }` |
| GET | `/api/admin/horario` | — | `HorarioSlot[]` `{ id, dia, hora, clase, profe, cupos, activa, proximas: number }` |
| POST | `/api/admin/horario` | `{ dia, hora, clase, profe, cupos, activa, desde? }` | `201 { slot, clasesCreadas: number }` (generates its classes right away) |
| PATCH | `/api/admin/horario/:id` | partial slot + `aplicarAFuturas?: boolean` | `{ slot, clasesActualizadas }` |
| DELETE | `/api/admin/horario/:id` | — | sets Activa = No; future classes without bookings are cancelled; returns `{ canceladas, conReservas: ClaseEquipo[] }` |
| GET | `/api/admin/clientas` | `?segmento=&q=&orden=` | `ClientaFila[]` |
| GET | `/api/admin/segmentos` | — | `[{ id, nombre, descripcion, total }]` |
| GET | `/api/admin/clientas/:id` | — | `ClientaDetalle` |
| POST | `/api/admin/clientas` | `Perfil & { notas?, consentimientos? }` | `201 ClientaDetalle` |
| PATCH | `/api/admin/clientas/:id` | partial `Perfil & { notas, etiquetas }` | `ClientaDetalle` |
| POST | `/api/admin/clientas/:id/acceso` | — | `{ enlace, waTexto, waEnlace }` (private access link for her) |
| POST | `/api/admin/reservas` | `{ clienta, clase }` | `201 { reserva, clase: ClaseEquipo }` |
| POST | `/api/admin/reservas/:id/confirmar` | `{ pago?: { plan, medio, valor?, clases? } }` | `{ reserva, compra?, clase }` |
| POST | `/api/admin/reservas/:id/asistencia` | `{ vino }` | `{ reserva, clase }` |
| POST | `/api/admin/reservas/:id/cancelar` | `{ sinCosto?: boolean }` (admin may waive the late rule) | `{ reserva, clase, devolvioClase }` |
| POST | `/api/admin/reservas/:id/liberar` | — | `{ reserva, clase }` (unpaid hold → Vencida) |
| POST | `/api/admin/reservas/:id/reagendar` | `{ clase }` | `{ anterior, nueva }` |
| GET | `/api/admin/pagos` | `?mes=yyyy-MM` | `{ mes, total, porMedio: {}, porPlan: {}, compras: Compra[] }` |
| POST | `/api/admin/pagos` | `{ clienta, plan, medio, valor?, inicio?, clases? }` | `201 { compra, saldo }` |
| GET | `/api/admin/espera` | — | `[{ ...EsperaItem, clase: Clase }]` |
| POST | `/api/admin/espera/:id/tomar` | — | `{ reserva, clase }` |
| PATCH | `/api/admin/espera/:id` | `{ estado }` | `EsperaItem` |
| GET | `/api/admin/equipo` | — | `Staff[]` + `{ clasesMes, pagoMes }` per profe |
| POST | `/api/admin/equipo` | `{ rol, nombre, nombreHorario?, correo, whatsapp? }` | `201 { usuario, invitacion: { enlace, waTexto, waEnlace, vence } }` |
| PATCH | `/api/admin/equipo/:id` | `{ activa?, rol?, nombre?, nombreHorario?, whatsapp? }` | `Staff` (deactivating closes their sessions) |
| POST | `/api/admin/equipo/:id/invitacion` | — | new invitation |
| GET / PATCH | `/api/admin/ajustes` | `{ [ajuste]: valor }` | `[{ ajuste, valor, ayuda }]` |
| GET / PATCH | `/api/admin/planes` | `{ nombre, precio?, clases?, vigencia?, activo? }` | `Plan[]` |
| GET | `/api/admin/registro` | `?limite=100&antes=ISO` | `[{ ts, actor: { tipo, id, nombre }, accion, objeto, detalle }]` |
| GET | `/api/admin/atribucion` | `?desde&hasta` | `{ porRef: [{ ref, clics, reservas, confirmadas, ingresos }], porCampana: [...] }` |
| GET | `/api/admin/salud` | — | `{ datos: "sheets"|"memoria", hoja: { ok, faltan: ["Clientas.Barrio", …] }, whatsapp: {…}, correo: {…}, push: {…}, version }` |
| POST | `/api/admin/push/suscribir` | `PushSubscription JSON` | `204` (Web Push for Ana's installed app) |
| DELETE | `/api/admin/push/suscribir` | `{ endpoint }` | `204` |

```ts
Tablero = {
  hoy, hoyTexto, saludo: "Buenos días",
  kpis: {
    semana: { clases, cupos, ocupados, pct },          // the number that governs: occupancy
    mes: { ingresos, compras, clasesDictadas, pagoProfes, asistentes },
    clientasActivas, pendientesPago, enEspera
  },
  hoyClases: ClaseEquipo[], manana: ClaseEquipo[],
  porMarcar: ClaseEquipo[],                            // past classes with attendance still to mark
  pendientes: PendientePago[],
  alertas: Alerta[],                                   // ordered by urgency
  segmentos: [{ id, nombre, total }]
}
PendientePago = { reserva, clienta, nombre, whatsapp, clase: Clase, creada, venceApartado, saldo: number, origen, waTexto, waEnlace }
Alerta = { id, tipo: "pago-por-vencer"|"sin-marcar"|"poca-gente"|"saldo-bajo"|"vence-pronto"|"sin-clases"|"prueba-sin-plan"|"cumple"|"cupo-liberado"|"ficha-incompleta",
           prioridad: 1|2|3, titulo, detalle, clienta?: { id, nombre }, clase?: Clase, accion?: { tipo: "whatsapp", texto, enlace } | { tipo: "abrir", ruta } }
ClientaFila = { id, nombre, whatsapp, whatsappTexto, correo, desde, llego, etapa, segmentos: string[], saldo: Saldo,
                proxima: Clase | null, ultimaVisita: "yyyy-MM-dd" | "", visitas30: number, etiquetas: string[], fichaCompleta }
ClientaDetalle = ClientaFila & { perfil: Perfil, consentimientos, notas, compras: Compra[], reservas: ReservaClienta[], espera: EsperaItem[],
                 conversacion?: { id, noLeidos, ultimoMensaje }, linea: Evento[] }  // timeline: bookings, payments, messages, notes
Evento = { id, ts, tipo: "reserva-web"|"reserva"|"cancelacion"|"reagenda"|"pago"|"asistencia"|"mensaje"|"espera"|"clase"|"sistema", titulo, detalle?, clienta?, clase?, actor }
```

**Segments** (`/api/admin/segmentos`, computed on today's Bogotá date; a clienta can be in several):

| id | nombre | rule |
|---|---|---|
| `agendadas` | Agendaron | has a Pendiente/Confirmada booking in a class from today on |
| `con-clases` | Con clases | saldo > 0 |
| `poquitas` | Les quedan poquitas | 0 < saldo ≤ «Aviso de saldo bajo» |
| `vence-pronto` | Vence pronto | saldo > 0 and plan expires within «Días para avisar vencimiento» |
| `sin-clases` | Renovar | bought in the last 45 days, saldo 0 |
| `pendiente-pago` | Deben un pago | has a Pendiente de pago booking |
| `prueba` | Vinieron a prueba | attended a trial, no later plan |
| `nuevas` | Nuevas | Desde within 14 days |
| `inactivas` | Inactivas | had classes, none attended in 30 days, nothing booked |
| `cumple` | Cumpleaños | birthday within 7 days |
| `ficha-incompleta` | Ficha incompleta | missing health answer, emergency contact or disclaimer |
| `leads` | Interesadas | never bought nor attended |

`etapa` (one per clienta): `lead` → `prueba` → `activa` → `en-riesgo` (poquitas / vence-pronto / sin-clases) → `inactiva`.

### CRM · WhatsApp (`/api/admin/whatsapp`, role admin; webhook public)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/admin/whatsapp/estado` | — | `{ conectado, modo: "desconectado"|"prueba"|"produccion", numero?, nombreVerificado?, plantillas: Plantilla[], faltan: string[] }` |
| GET | `/api/admin/whatsapp/conversaciones` | `?filtro=abiertas|sin-leer|todas&q=` | `Conversacion[]` |
| GET | `/api/admin/whatsapp/conversaciones/:id` | — | `{ conversacion, mensajes: Mensaje[], clienta?: ClientaFila }` (marks read) |
| POST | `/api/admin/whatsapp/conversaciones/:id/mensajes` | `{ texto }` or `{ plantilla, variables }` | `201 Mensaje` (free text only inside the 24 h window) |
| PATCH | `/api/admin/whatsapp/conversaciones/:id` | `{ estado?, etiquetas?, clienta? }` | `Conversacion` |
| GET | `/api/admin/whatsapp/plantillas` | — | `Plantilla[]` (local catalog + Meta approval status) |
| GET / POST | `/api/whatsapp/webhook` | Meta | verification echo / `200` fast, signature checked |

```ts
Conversacion = { id, whatsapp, nombre, clienta?: { id, nombre, etapa }, ultimoMensaje: { texto, ts, direccion }, noLeidos, ventanaHasta: ISO | null, estado: "abierta"|"cerrada", etiquetas: string[] }
Mensaje = { id, conversacion, direccion: "entrante"|"saliente", tipo: "texto"|"plantilla"|"imagen"|"audio"|"documento"|"ubicacion"|"interactivo"|"reaccion"|"sistema",
            texto, plantilla?, media?: { tipo, id, mime }, estado: "recibido"|"enviado"|"entregado"|"leido"|"fallido", error?, ts, autor: { tipo: "clienta"|"admin"|"ia"|"sistema", nombre } }
Plantilla = { nombre, categoria: "UTILITY"|"MARKETING"|"AUTHENTICATION", idioma: "es", cuerpo, variables: string[], estadoMeta?: "APPROVED"|"PENDING"|"REJECTED"|"NO_ENVIADA", uso }
```

## 7. Ready for the AI agent (later)

`server/src/herramientas/` exposes the domain as a typed tool catalog (name, description, JSON schema, role, `soloLectura`, handler(actor, input)). The REST routes and a future WhatsApp AI call the **same** domain functions; nothing in the routes holds business logic. Write tools require an actor and are audited with `actor.tipo = "ia"`.

## 8. App routes (`/app/`)

`/app/` → by role: admin → `/app/admin`, profe → `/app/profe`, clienta → `/app/mi`, nobody → `/app/entrar`.

| Route | Who | What |
|---|---|---|
| `/app/entrar` | all | «Soy alumna» (WhatsApp/email code) · «Equipo» (email + password) · «¿Olvidaste tu contraseña?» |
| `/app/reservar` | anyone | booking flow: class → you → your ficha → agreements → payment instructions. `?clase=&plan=&ref=` |
| `/app/acceso/:token`, `/app/invitacion/:token`, `/app/restablecer/:token` | — | links |
| `/app/mi`, `/app/mi/clases`, `/app/mi/reservar`, `/app/mi/perfil` | clienta | home (next class, balance), classes (cancel/reschedule), book, profile + agreements |
| `/app/profe`, `/app/profe/clase/:id`, `/app/profe/cuenta` | profe | my classes, roster with ficha, attendance |
| `/app/admin` | admin | Hoy (dashboard) |
| `/app/admin/agenda`, `/app/admin/agenda/:id`, `/app/admin/horario` | admin | calendar, class detail, weekly template + extra classes |
| `/app/admin/clientas`, `/app/admin/clientas/:id` | admin | CRM: segments, search, profile, timeline |
| `/app/admin/mensajes`, `/app/admin/mensajes/:id` | admin | WhatsApp inbox |
| `/app/admin/pagos`, `/app/admin/equipo`, `/app/admin/ajustes`, `/app/admin/cuenta`, `/app/admin/registro` | admin | payments, team, settings, account, audit |

## 9. Site ↔ app hand-off

Every booking CTA on the site links to `/app/reservar?ref=<REF>[&clase=<id>][&plan=Clase de prueba]`, keeping the visitor's UTM / click ids, which the site stores first-party in `localStorage["cl_atribucion"]` as `{ utm, clickIds, landing, ts }` for **90 days** (Google Ads accepts conversions up to 90 days after the click), last non-empty click wins, and the app reads. The prefilled WhatsApp messages carry a short attribution code (`ref`) so chats that start on WhatsApp stay attributable. Refs keep the v1 scheme (`WEB-HERO`, `WEB-CLASE-PILATES`, `WEB-HORARIO-SAB-0800`, `WEB-PLAN-8`, …).

## 10. Additions after the first build (implemented in server/, app/ follows them)

| Where | What |
|---|---|
| `GET /api/yo`, `GET /api/auth/yo` | `limitada: boolean` — a public booking with a known WhatsApp opens a limited session (see Security) |
| `POST /api/auth/codigo` | always `{ ok: true }` (no `canal`/`destino`); sending happens after the answer |
| `GET /api/publico/disponibilidad` | cancelled classes stay listed with `reservable: false, motivo: "cancelada"` |
| `ClaseEquipo` | `asistenciaEditable: boolean` (profe: class day → start + 48 h; admin: from the class day) and `reemplazoPedido: { fecha, motivo, pedidoPor } \| null` |
| `GET /api/profe/clientas?q=` | ≥ 2 letters, names only → `[{ id, nombre, primeraVez, fichaCompleta }]`, max 10 |
| `POST /api/profe/clases/:id/asistentes` `{ clienta }` | `201 { clase: ClaseEquipo, reserva: { id, clienta, estado }, sinPlan }` — «Asistió» on her plan, or «Pendiente de pago» + Notas «Vino sin plan» (alert `vino-sin-plan`, push). Full class: 409 `llena` unless admin. Origen «Profe · <nombre>» |
| `POST /api/profe/clases/:id/cerrar` | `ClaseEquipo & { marcadas }` — remaining «Confirmada» → «No vino»; 409 `no-ha-empezado` before the start |
| profe attendance writes | after start + 48 h → 409 `fuera-de-plazo` (admins unaffected) |
| `POST /api/profe/clases/:id/reemplazo` `{ motivo }` | `ClaseEquipo` with `reemplazoPedido`; alert `necesita-reemplazo` (prioridad 1, ruta `…/agenda/<id>?profe=1`), novedad, push to admins |
| `GET /api/profe/resumen` | adds `pendientesPorMarcar`, `proximaClase: Clase \| null`, `reemplazosPedidos` |
| `GET /api/{admin,profe}/push/clave`, `POST/DELETE /api/{admin,profe}/push/suscribir` | Web Push for any staff member; profes hear about assignments and new bookings in their classes |
| `GET /api/admin/profes` | `[{ id, nombre, nombreHorario, activa }]` (profes, and admins with a schedule name) |
| `PATCH /api/admin/clases/:id`, `POST/PATCH /api/admin/horario`, `POST /api/admin/clases` | `profe` must be active staff (schedule name or full name, accent/case-insensitive) or `""` / «Por confirmar» → 422 otherwise; written as her schedule name. A change closes the substitute request, adds a novedad and pushes «Te asignaron…» to the new profe |
| `GET /api/admin/clases/:id` | one `ClaseEquipo` |
| alerts | new `vino-sin-plan` (1), `necesita-reemplazo` (1), `sin-profe` (2, next 7 days, ruta `/app/admin/agenda/<id>`) |
| `GET /api/admin/salud` | `push: { activo, clavePublica, suscripciones }`, `conversiones: { destino, sheetId, pestana, ok }` |
| conversions | Data Manager columns, one row per purchase, separate spreadsheet (`CONVERSIONES_SHEET_ID`) |
| `Consentimientos.novedades`, `Perfil.novedades` | WhatsApp marketing opt-in (stored as the tag `novedades-whatsapp` in «Etiquetas») |
| `PendientePago.plan` | the plan she asked for: the public booking's `plan` (default «Clase de prueba»), stored as `plan` inside the «Atribución» JSON (no new column); other pending bookings: her last plan, or the trial |
| `POST /api/admin/clases` on a holiday | 409 `{ ok: false, error: "conflicto", motivo: "festivo", mensaje: "El 12 de octubre es festivo (Día de la Raza). ¿Crearla igual?" }`; the same body with `forzar: true` creates it |
| `POST /api/admin/espera` `{ clienta, clase }` | `201 EsperaItem` — any class not cancelled and not started (even with swings left); 409 `ya-reservada` (already waiting or booked), 409 `cancelada`, 409 `empezo`, 404 unknown class or clienta |

Alert `accion.ruta` values are full paths (`/app/admin/…`), the same strings used as Web Push URLs.
