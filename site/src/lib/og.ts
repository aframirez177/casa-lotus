// Open Graph images, rendered at build time: satori (layout → SVG) + resvg (SVG → PNG) + sharp
// (palette PNG, well under 300 KB so WhatsApp shows the preview). Paper background, Ana's colours,
// the lotus symbol and wordmark (never redrawn: the real SVG paths), the page's title.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import type { Pagina } from "../data/paginas";

const RAIZ = process.cwd();
const leer = (ruta: string) => readFile(join(RAIZ, ruta));
const NAVY = "#165472";

let recursos: Promise<{ fuentes: { name: string; data: Buffer; weight: 400 | 600; style: "normal" }[]; simbolo: string; palabra: string }> | null = null;
function cargar() {
  recursos ??= (async () => {
    const svg = async (f: string) => {
      const texto = (await leer(f)).toString("utf8").replace(/currentColor/g, NAVY);
      return `data:image/svg+xml;base64,${Buffer.from(texto).toString("base64")}`;
    };
    return {
      fuentes: [
        { name: "Momo Trust Display", data: await leer("src/assets/fonts/ttf/MomoTrustDisplay-Regular.ttf"), weight: 400, style: "normal" },
        { name: "Momo Trust Sans", data: await leer("src/assets/fonts/ttf/MomoTrustSans-Regular.ttf"), weight: 400, style: "normal" },
        { name: "Momo Trust Sans", data: await leer("src/assets/fonts/ttf/MomoTrustSans-SemiBold.ttf"), weight: 600, style: "normal" },
      ],
      simbolo: await svg("src/assets/logo/simbolo.svg"),
      palabra: await svg("src/assets/logo/palabra.svg"),
    };
  })();
  return recursos;
}

type Nodo = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (Nodo | string | null)[]): Nodo => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter(Boolean) },
});
const img = (src: string, style: Record<string, unknown>): Nodo => ({ type: "img", props: { src, style } });

export async function imagenOg(p: Pagina): Promise<Buffer> {
  const { fuentes, simbolo, palabra } = await cargar();
  const campo = p.og.color ?? "#B2D4E0";
  const titulo = p.og.titulo;
  const tam = titulo.length > 34 ? 70 : titulo.length > 22 ? 80 : 92;

  const arbol = h("div", {
    width: 1200, height: 630, position: "relative", background: "#F6F8FC", fontFamily: "Momo Trust Sans", color: "#24434C",
    backgroundImage: "radial-gradient(circle at 12% 110%, rgba(210,243,162,0.55), rgba(246,248,252,0) 42%), radial-gradient(circle at 58% -20%, rgba(178,212,224,0.65), rgba(246,248,252,0) 48%)",
  },
    // copy column
    h("div", { position: "absolute", left: 72, top: 64, bottom: 64, width: 690, flexDirection: "column", justifyContent: "space-between" },
      h("div", { alignItems: "center", gap: 18 },
        img(simbolo, { width: 58, height: 51 }),
        img(palabra, { width: 196, height: 29, marginTop: 6 }),
      ),
      h("div", { flexDirection: "column", gap: 26 },
        p.og.etiqueta ? h("div", { alignItems: "center", gap: 16, fontSize: 21, fontWeight: 600, letterSpacing: 3.4, textTransform: "uppercase", color: "#53748C" },
          h("div", { width: 38, height: 2, background: "#53748C", opacity: 0.6 }), p.og.etiqueta) : null,
        h("div", { fontFamily: "Momo Trust Display", fontSize: tam, lineHeight: 0.98, letterSpacing: -2.6, color: NAVY }, titulo),
        h("div", { fontSize: 30, lineHeight: 1.35, color: "#24434C", maxWidth: 640 }, p.og.descripcion),
      ),
      h("div", { fontSize: 22, fontWeight: 600, color: "#53748C", letterSpacing: 0.5 }, "casalotus.studio · Bogotá"),
    ),
    // class-colour field with the mark, like the cards on the site
    h("div", { position: "absolute", right: 64, top: 64, bottom: 64, width: 340, borderRadius: 36, background: campo, alignItems: "center", justifyContent: "center", overflow: "hidden" },
      h("div", { position: "absolute", left: -60, bottom: -80, width: 420, height: 420, borderRadius: 999, background: "rgba(255,255,255,0.28)" }),
      img(simbolo, { width: 236, height: 208 }),
    ),
  );

  const svg = await satori(arbol as unknown as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts: fuentes });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 }, font: { loadSystemFonts: false } }).render().asPng();
  return sharp(png).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
}
