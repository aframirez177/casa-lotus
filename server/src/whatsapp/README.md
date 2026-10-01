# src/whatsapp · WhatsApp Cloud API (CRM inbox, templates, webhook)

Implements CONTRATO §6 «CRM · WhatsApp». Setup in Meta, migration of the studio's number,
costs and policy: `docs/whatsapp/guia-whatsapp-cloud-api.md` in the private repo.

## Mounting (server)

```js
import { crearWhatsApp } from "./whatsapp/index.js";

const wa = await crearWhatsApp({ config: config.whatsapp, db, dominio, publicar, log, auditar });

app.use("/api/whatsapp", wa.rutasWebhook);            // BEFORE express.json(): the signature needs the raw body
app.use(express.json());
app.use("/api/admin/whatsapp", soloAdmin, wa.rutasAdmin); // after admin auth (reads req.usuario)
```

| Option | What |
|---|---|
| `config` | `{ token, phoneNumberId, wabaId, appSecret, verifyToken, graphVersion, modo }`. Any missing key falls back to its `WHATSAPP_*` env var. `{ whatsapp: {...} }` also works. |
| `db` | `node:sqlite` `DatabaseSync`. The module creates its own `wa_*` tables on start. |
| `dominio` | `buscarClientaPorWhatsApp(numero)`, `crearLead({ nombre, whatsapp }) → "C-0001"`, optional `buscarClientaPorId(id)` and `registrarBaja(numero)` (called on every BAJA, 131050 and `user_preferences` stop, so the Sheet's «novedades» consent goes off). Sync or async. |
| `publicar(evento)` | `{ tipo: "mensaje" \| "sistema", titulo, detalle, clienta?: "C-0001", conversacion, ts, actor }` for every inbound message, opt-out and failed delivery. |
| `auditar(e)` | optional, `{ accion, objeto, detalle, actor }` on every send and conversation change. |
| `log` | console-like. Phone numbers, tokens and codes are never logged. |
| `fetch`, `ahora`, `esperar` | injectable (tests). |

Returned object (the agreed interface, plus extras marked +):

| Member | Notes |
|---|---|
| `configurado` | token + phone number id + app secret present |
| `rutasAdmin`, `rutasWebhook` | Express routers |
| `estado()` | `{ conectado, modo, numero?, nombreVerificado?, calidad?, plantillas, faltan, cobrables30d?, error? }`. Meta is asked at most every 5 min. |
| `enviarTexto(whatsapp, texto, autor)` | refuses (409 `conflicto`, `motivo: "ventana"`) outside the 24 h window |
| `enviarPlantilla(whatsapp, nombre, variables, autor)` | variables as `{ nombre: … }` or an array in catalogue order; refuses after a BAJA (409 `motivo: "baja"`) or when Meta has not approved it (409 `motivo: "plantilla"`) |
| `enviarCodigo(whatsapp, codigo)` | AUTHENTICATION template, returns `true/false`, never throws, never stores the code |
| `resumenConversacion(whatsapp)` | `{ id, noLeidos, ultimoMensaje } \| null` (sync) for `ClientaDetalle.conversacion` |
| + `optIn(whatsapp, origen)` | clears a previous BAJA (the server calls it when she turns «novedades» on) |
| + `sincronizarPlantillas()` | reads the WABA's templates into the cache (start-up + daily) |
| + `enviarPlantillasAMeta({ nombres?, forzar? })` | submits catalogue templates Meta does not have |
| + `listarPlantillas()`, `resumenConfig()`, `esperarPendientes()` | catalogue with status · config without secrets · await the webhook queue |

Errors are `WhatsAppError` (`status`, `codigo`, `message`, `motivo?`, `campos?`, `cuerpo()` → CONTRATO §4 body):
`validacion` 422 · `no-existe` 404 · `conflicto` 409 · `limite` 429 · `servidor` 502/504 · `no-configurado` 503.

## Env vars

| Var | Where it comes from (guide §1) |
|---|---|
| `WHATSAPP_TOKEN` | System User permanent token (test: the temporary token from API Setup) |
| `WHATSAPP_PHONE_NUMBER_ID` | API Setup → «Phone number ID» (not the phone number) |
| `WHATSAPP_WABA_ID` | API Setup → «WhatsApp Business Account ID» |
| `WHATSAPP_APP_SECRET` | App Dashboard → App settings → Basic → App secret |
| `WHATSAPP_VERIFY_TOKEN` | any long random string, also typed in the webhook config |
| `WHATSAPP_GRAPH_VERSION` | default `v26.0` |
| `WHATSAPP_MODO` | `prueba` (default) or `produccion`; `desconectado` is automatic when something is missing |

## Behaviour

- **Webhook.** GET echoes `hub.challenge` only with the right verify token. POST checks
  `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret, `timingSafeEqual`), answers
  `200` at once and processes afterwards, one notification at a time. No app secret → every POST is `401`.
  Messages for another phone number id are ignored.
- **Idempotent.** Messages are unique on Meta's id, statuses on (id, status), so Meta's retries change nothing.
- **Inbound.** Every type is parsed (text, image, sticker, audio/voice, video, document, location,
  interactive replies, template quick replies, reactions, contacts, system, unsupported). Media: only Meta's
  id and mime are kept, nothing is downloaded. An unknown number creates a lead with its WhatsApp profile name.
  Reactions and system notices don't ring. Click-to-WhatsApp ad ids (`ctwa_clid`) are kept for attribution.
- **Statuses** only move forward (sent → delivered → read); `failed` stores a Spanish explanation and rings Ana.
  Meta's pricing info per message is stored (`wa_estados.categoria/cobrable`) and summed in `estado().cobrables30d`.
- **24 h window** from her last message, closed 2 minutes early so a reply is never refused in flight.
- **Opt-out.** A message that is only «BAJA», «STOP», «no más», «darme de baja»… records a BAJA, answers politely
  inside the window and tells Ana. «ALTA» undoes it. «cancelar» is *not* an opt-out (it means a class).
  Error 131050 and the `user_preferences` webhook record a marketing-only opt-out. Login codes still go out.
- **2026 usernames.** A contact who uses a WhatsApp username may arrive without a phone number, only with a
  business-scoped user id (BSUID). The inbox keeps that conversation, replies with `recipient` instead of `to`,
  and merges it with her number's conversation when Meta sends both. No lead is created without a number.
- **Coexistence ready.** `smb_message_echoes` (what Ana sends from the Business app on her phone) are stored as hers
  and mark the chat read. `history` and `smb_app_state_sync` are only logged for now.
- **Graph client.** Timeout 10 s; retries with backoff on 429, 5xx and Meta's throttling codes. A POST that timed
  out is never retried (it may have been sent).

## Templates

`plantillas.js` is the catalogue (Spanish, named variables, examples, category). Changing an approved body
means editing it in Meta too. CLI: `node scripts/whatsapp-plantillas.mjs revisar | listar | payload <n> | estado |
sincronizar | enviar [n…] | hola <numero>`.

| Name | Category | Variables |
|---|---|---|
| reserva_recibida | UTILITY | nombre, clase, cuando, vence, monto, codigo (payment key and bookings WhatsApp are literal text) |
| reserva_confirmada | UTILITY | nombre, clase, cuando, horas |
| recordatorio_clase | UTILITY (+2 quick replies) | nombre, cuando, clase |
| cupo_liberado | UTILITY (+quick reply) | nombre, clase, cuando |
| clase_cancelada | UTILITY | nombre, clase, cuando |
| cambio_de_clase | UTILITY | nombre, cuando, cambio |
| saldo_bajo | UTILITY | nombre, saldo («2 clases»), vence |
| plan_por_vencer | UTILITY | nombre, vence, saldo |
| bienvenida_prueba | MARKETING (+quick reply, BAJA footer) | nombre |
| codigo_acceso | AUTHENTICATION (copy code, 10 min) | codigo |

## AI agent (later)

`ia.js` documents the hook: inbound message → `agente.alRecibirMensaje({ conversacion, mensaje })` → tools from
`src/herramientas/` (same domain functions as REST, actor `{ tipo: "ia" }`) → `enviarTexto`. Nothing calls a model today.

## Data

Tables: `wa_conversaciones`, `wa_mensajes`, `wa_estados`, `wa_plantillas`, `wa_bajas`. Messages may contain health
details a person chose to write; they stay in the server's SQLite, are admin-only and never leave it except to Meta.
Status history older than ~13 months is pruned on start.

## Tests

`node --test 'tests/whatsapp/*.test.mjs'`: in-memory SQLite, scripted fetch, no network. Route tests use real HTTP
and skip themselves if `express` is not installed.
