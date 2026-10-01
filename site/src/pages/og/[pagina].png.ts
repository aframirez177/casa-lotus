// /og/<clave>.png for every page in data/paginas.ts (1200×630, < 300 KB).
import type { APIRoute, GetStaticPaths } from "astro";
import { LISTA_PAGINAS, type Pagina } from "../../data/paginas";
import { imagenOg } from "../../lib/og";

export const getStaticPaths: GetStaticPaths = () => LISTA_PAGINAS.map((p) => ({ params: { pagina: p.clave }, props: { p } }));

export const GET: APIRoute = async ({ props }) => {
  const png = await imagenOg((props as { p: Pagina }).p);
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
};
