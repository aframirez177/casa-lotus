// Run the whole platform locally, each part on its port, with prefixed logs:
//   API  http://localhost:8787/api   (memory driver: a fake studio, nothing touches Google)
//   app  http://localhost:5180/app/  (proxies /api to 8787)
//   site http://localhost:4321/      (proxies /api to 8787 and /app to 5180)
// Ctrl+C stops all three.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const partes = [
  { nombre: "api ", dir: "server", color: 35 },
  { nombre: "app ", dir: "app", color: 36 },
  { nombre: "site", dir: "site", color: 32 },
];
const hijos = partes.map(({ nombre, dir, color }) => {
  const h = spawn("npm", ["run", "dev"], { cwd: join(WEB, dir), env: process.env });
  const prefijo = `\x1b[${color}m${nombre}\x1b[0m │ `;
  const salida = (flujo) => (b) => b.toString().split("\n").filter(Boolean).forEach((l) => flujo.write(prefijo + l + "\n"));
  h.stdout.on("data", salida(process.stdout));
  h.stderr.on("data", salida(process.stderr));
  h.on("exit", (code) => console.log(`${prefijo}terminó (${code})`));
  return h;
});
const parar = () => { hijos.forEach((h) => h.kill("SIGINT")); setTimeout(() => process.exit(0), 500); };
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
