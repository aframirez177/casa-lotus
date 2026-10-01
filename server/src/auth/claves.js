// Casa Lotus · passwords, tokens and codes (node:crypto only).
// Passwords: scrypt with a per-user random salt, parameters stored with the hash so they can be raised
// later, compared in constant time. Tokens: 32 random bytes, stored only as SHA-256.
import { scrypt, randomBytes, timingSafeEqual, createHash, randomInt } from "node:crypto";

// N = 2^15, r = 8 → 32 MiB per hash; p = 3 raises CPU cost without more memory (OWASP alternative set).
const N = 32768, BLOQUE = 8, PARALELO = 3, LARGO = 64;
const MAXMEM = 128 * N * BLOQUE * 2;

// at most two hashes at a time: a burst of logins cannot exhaust a 256 MB container
let activos = 0;
const cola = [];
async function turno() {
  if (activos < 2) { activos++; return; }
  await new Promise((ok) => cola.push(ok));
  activos++;
}
function soltar() {
  activos--;
  const sig = cola.shift();
  if (sig) sig();
}

function derivar(password, sal, n, r, p) {
  return new Promise((ok, falla) => {
    scrypt(String(password).normalize("NFKC"), sal, LARGO, { N: n, r, p, maxmem: Math.max(MAXMEM, 128 * n * r * 2) }, (e, k) => (e ? falla(e) : ok(k)));
  });
}

export async function hashPassword(password) {
  await turno();
  try {
    const sal = randomBytes(16);
    const k = await derivar(password, sal, N, BLOQUE, PARALELO);
    return ["scrypt", N, BLOQUE, PARALELO, sal.toString("base64"), k.toString("base64")].join("$");
  } finally {
    soltar();
  }
}

// verifying against this when the account does not exist keeps both answers equally slow
let FALSO = null;

export async function verificarPassword(password, guardado) {
  if (!FALSO) FALSO = await hashPassword(randomBytes(12).toString("hex"));
  const partes = String(guardado || FALSO).split("$");
  const real = Boolean(guardado) && partes.length === 6 && partes[0] === "scrypt";
  const [, n, r, p, salB64, hashB64] = real ? partes : FALSO.split("$");
  await turno();
  try {
    const esperado = Buffer.from(hashB64, "base64");
    const k = await derivar(password, Buffer.from(salB64, "base64"), Number(n), Number(r), Number(p));
    return timingSafeEqual(k, esperado) && real;
  } finally {
    soltar();
  }
}

export const token = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const idCorto = (bytes = 9) => randomBytes(bytes).toString("base64url");
export const sha256 = (t) => createHash("sha256").update(String(t)).digest("hex");
export const codigo6 = () => String(randomInt(0, 1000000)).padStart(6, "0");

export function igualesSeguro(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const COMUNES = new Set(`
123456 123456789 12345678 1234567890 password 12345 qwerty 123123 111111 abc123 1234567 qwerty123 1q2w3e4r 000000 iloveyou 1234
password1 123321 654321 666666 987654321 qwertyuiop 112233 121212 dragon monkey letmein football sunshine princess welcome admin
admin123 administrador contraseña contrasena clave123 colombia bogota colombia123 bogota123 teamo te amo amor amorcito mimamá
mamamama papapapa 123456789a a123456789 1234567890a 0123456789 1111111111 0000000000 password123 passw0rd qwerty12345 asdfghjkl
zxcvbnm abcdefghij abcd1234 1qaz2wsx qazwsxedc yogayoga yoga12345 pilates123 casalotus casa lotus casalotus1 casalotus123 lotus123
aereo123 columpio estudio123 bienvenida bienvenido holahola hola123456 superman batman starwars pokemon nicolas santiago valentina
mariana camila daniela sebastian alejandro carolina natalia 1234512345 5555555555 9999999999 1029384756 qwerty1234 contraseña1 clave
`.split(/\s+/).filter(Boolean));

/** A Spanish reason why a password is too weak, or null. */
export function passwordDebil(password, { correo = "", nombre = "" } = {}) {
  const p = String(password || "");
  if (p.length < 10) return "Usa al menos 10 caracteres.";
  if (p.length > 200) return "Usa máximo 200 caracteres.";
  const bajo = p.toLowerCase();
  if (COMUNES.has(bajo) || COMUNES.has(bajo.replace(/\d+$/, ""))) return "Esa contraseña es muy común. Elige otra.";
  if (/^(.)\1+$/.test(p)) return "Esa contraseña es muy fácil de adivinar.";
  const local = String(correo).split("@")[0].toLowerCase();
  if (local.length >= 4 && bajo.includes(local)) return "No uses tu correo en la contraseña.";
  if (bajo.includes("casalotus")) return "No uses el nombre del estudio en la contraseña.";
  const n = String(nombre).toLowerCase().split(/\s+/)[0];
  if (n && n.length >= 4 && bajo.replace(/[^a-záéíóúñ]/g, "") === n) return "No uses tu nombre como contraseña.";
  return null;
}
