// Casa Lotus · platform API entry point.
import { leerConfig } from "./config.js";
import { crearLog } from "./log.js";
import { crearContexto } from "./contexto.js";
import { crearApp } from "./app.js";
import { iniciarTareas } from "./tareas/index.js";
import { asegurarAjustes } from "./dominio/ajustes.js";

export async function iniciar(env = process.env) {
  const config = leerConfig(env);
  const log = crearLog({ nivel: config.logLevel });
  const ctx = await crearContexto(config, { log });
  try {
    await asegurarAjustes(ctx);
  } catch (e) {
    log.error("no pude revisar la pestaña Ajustes al arrancar", { error: e });
  }
  const app = crearApp(ctx);
  const tareas = config.tareas ? iniciarTareas(ctx) : null;
  const servidor = await new Promise((ok) => {
    const s = app.listen(config.puerto, () => ok(s));
  });
  servidor.keepAliveTimeout = 65000;
  servidor.headersTimeout = 66000;
  servidor.requestTimeout = 60000;
  log.info("Casa Lotus API lista", { puerto: servidor.address().port, datos: config.datos, entorno: config.entorno, whatsapp: Boolean(ctx.whatsapp.configurado) });

  let cerrando = false;
  const cerrar = (senal) => {
    if (cerrando) return;
    cerrando = true;
    log.info("cerrando", { senal });
    tareas?.detener();
    // SSE streams never end on their own: say goodbye and close them, then the idle keep-alives
    for (const st of ctx.streams) { try { st.cerrar(); } catch { /* already gone */ } }
    servidor.close(() => {
      ctx.esperarSegundoPlano().finally(() => { try { ctx.db.close(); } catch { /* already closed */ } process.exit(0); });
    });
    servidor.closeIdleConnections();
    setTimeout(() => servidor.closeAllConnections(), 3000).unref();
    setTimeout(() => process.exit(0), 8000).unref();
  };
  // a stray rejection is logged, never a crash in the middle of someone's booking
  process.on("unhandledRejection", (e) => log.error("promesa rechazada sin manejar", { error: e }));
  process.once("SIGTERM", () => cerrar("SIGTERM"));
  process.once("SIGINT", () => cerrar("SIGINT"));
  return { ctx, servidor, config };
}

const esPrincipal = import.meta.url === new URL(process.argv[1], "file://").href || process.argv[1]?.endsWith("src/index.js");
if (esPrincipal) {
  iniciar().catch((e) => {
    process.stderr.write("No pude arrancar: " + (e?.message || e) + "\n");
    process.exit(1);
  });
}
