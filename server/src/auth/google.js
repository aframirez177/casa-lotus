// Casa Lotus · «Entrar con Google» for staff. The app gets a Google ID token (Google Identity Services)
// and posts it here; the server verifies it (signature, audience = GOOGLE_CLIENT_ID, expiry) and signs in
// the ACTIVE staff member with that e-mail. Google never creates accounts: Ana invites by e-mail first.
import { consumir, MINUTO } from "./limites.js";
import { porId, leerToken, gastarToken } from "./usuarios.js";
import { anotarRegistro } from "../dominio/registro.js";
import { noAutenticado, noConfigurado, noExiste, sinPermiso } from "../errores.js";

const EMISORES = ["accounts.google.com", "https://accounts.google.com"];
export const NO_EN_EL_EQUIPO = "Esta cuenta de Google no está en el equipo de Casa Lotus. Pídele a Ana que te invite con ese correo.";

/** The real verifier (google-auth-library). Null when GOOGLE_CLIENT_ID is not set. */
export function crearVerificadorGoogle(config) {
  const clientId = config.google.clientId;
  if (!clientId) return null;
  let cliente = null;
  return {
    clientId,
    async verificar(credential) {
      if (!cliente) {
        const { OAuth2Client } = await import("google-auth-library");
        cliente = new OAuth2Client(clientId);
      }
      const ticket = await cliente.verifyIdToken({ idToken: credential, audience: clientId });
      return ticket.getPayload();
    },
  };
}

/** The verified Google e-mail behind an ID token, or 401. */
async function correoDeGoogle(ctx, credential) {
  if (!ctx.google) throw noConfigurado("El acceso con Google todavía no está activado.");
  const malo = noAutenticado("No pudimos verificar tu cuenta de Google. Intenta de nuevo.");
  let p;
  try {
    p = await ctx.google.verificar(credential);
  } catch {
    throw malo;
  }
  const aud = Array.isArray(p?.aud) ? p.aud : [p?.aud];
  if (!p || !EMISORES.includes(p.iss) || p.email_verified !== true || !p.email || !aud.includes(ctx.google.clientId)) throw malo;
  if (p.exp && p.exp * 1000 < ctx.ahora()) throw malo;
  return String(p.email).trim().toLowerCase();
}

const staffPorCorreo = (ctx, correo) => ctx.db.prepare("SELECT * FROM usuarios WHERE correo = ? COLLATE NOCASE").get(correo);

/** POST /api/auth/google → the staff row (the route opens the same session as /api/auth/entrar). */
export async function entrarConGoogle(ctx, credential, { ip = "" } = {}) {
  consumir(ctx, "entrar-ip:" + ip, 30, 15 * MINUTO, "Demasiados intentos desde esta conexión. Espera 15 minutos.");
  const correo = await correoDeGoogle(ctx, credential);
  consumir(ctx, "entrar:" + correo + "|" + ip, 5, 15 * MINUTO, "Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.");
  const u = staffPorCorreo(ctx, correo);
  if (!u || !u.activa) {
    anotarRegistro(ctx, { tipo: "publico", nombre: "" }, "auth.google-fallido", u ? u.id : "", { motivo: u ? "inactiva" : "desconocido" });
    throw sinPermiso(NO_EN_EL_EQUIPO);
  }
  ctx.db.prepare("DELETE FROM limites WHERE clave = ?").run("entrar:" + correo + "|" + ip);
  ctx.db.prepare("UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?").run(ctx.ahora(), u.id);
  anotarRegistro(ctx, { tipo: u.rol, id: u.id, nombre: u.nombre }, "auth.entrar-google", u.id, { texto: "Entró con Google" });
  return porId(ctx, u.id);
}

/** POST /api/auth/invitacion/:token/google: the invited person accepts with the Google account of that e-mail. */
export async function aceptarInvitacionConGoogle(ctx, token, credential, { ip = "" } = {}) {
  consumir(ctx, "invitacion-ip:" + ip, 20, 60 * MINUTO);
  const f = leerToken(ctx, "invitacion", token);
  const u = f && porId(ctx, f.usuario);
  if (!u || !u.activa) throw noExiste("Esta invitación ya no sirve. Pídele una nueva a Ana.");
  const correo = await correoDeGoogle(ctx, credential);
  if (correo !== String(u.correo).toLowerCase()) {
    throw sinPermiso("Esta invitación es para " + u.correo + ". Entra con esa cuenta de Google o crea una contraseña.");
  }
  if (!gastarToken(ctx, f)) throw noExiste("Esta invitación ya no sirve.");
  ctx.db.prepare("UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?").run(ctx.ahora(), u.id);
  anotarRegistro(ctx, { tipo: u.rol, id: u.id, nombre: u.nombre }, "auth.invitacion", u.id, { metodo: "google", texto: "Aceptó la invitación con Google" });
  return porId(ctx, u.id);
}
