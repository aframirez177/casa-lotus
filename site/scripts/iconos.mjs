// Brand icons for the site and the app (one origin, one manifest): run `npm run iconos` after a logo change.
// Source: src/assets/logo/simbolo.svg (the real mark, never redrawn). Output in public/:
//   favicon.svg (navy; sky on dark tab bars) · favicon.ico (16/32/48) · apple-touch-icon.png (180, paper on navy)
//   icons/icon-192.png · icons/icon-512.png · icons/maskable-512.png (mark inside the 80 % safe circle, navy full-bleed)
//   icons/monochrome-512.png (alpha-only silhouette) · assets/brand/casa-lotus-logo-512.png (schema.org logo)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(RAIZ, "public");
const NAVY = "#165472", PAPER = "#F6F8FC", SKY = "#B2D4E0";
const W = 865, H = 763; // the symbol's viewBox

const fuente = await readFile(join(RAIZ, "src/assets/logo/simbolo.svg"), "utf8");
const trazos = [...fuente.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
if (trazos.length !== 4) throw new Error(`simbolo.svg: expected 4 paths, found ${trazos.length}`);
const paths = (fill) => trazos.map((d) => `<path fill="${fill}" d="${d}"/>`).join("");

/** The symbol `ancho` px wide, centred on a `lado` square, optionally on a background. */
function lienzo(lado, ancho, color, fondo, dy = 0) {
  const s = ancho / W, alto = H * s;
  const x = (lado - ancho) / 2, y = (lado - alto) / 2 + dy * lado;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">` +
    (fondo ? `<rect width="${lado}" height="${lado}" fill="${fondo}"/>` : "") +
    `<g transform="translate(${x} ${y}) scale(${s})">${paths(color)}</g></svg>`);
}
const png = (svg) => sharp(svg).png({ compressionLevel: 9, palette: false }).toBuffer();

/** ICO container with PNG entries (supported by every browser since Vista). */
function ico(imagenes) {
  const cab = Buffer.alloc(6 + 16 * imagenes.length);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(imagenes.length, 4);
  let offset = cab.length;
  imagenes.forEach(({ lado, datos }, i) => {
    const e = 6 + 16 * i;
    cab.writeUInt8(lado >= 256 ? 0 : lado, e); cab.writeUInt8(lado >= 256 ? 0 : lado, e + 1);
    cab.writeUInt8(0, e + 2); cab.writeUInt8(0, e + 3);
    cab.writeUInt16LE(1, e + 4); cab.writeUInt16LE(32, e + 6);
    cab.writeUInt32LE(datos.length, e + 8); cab.writeUInt32LE(offset, e + 12);
    offset += datos.length;
  });
  return Buffer.concat([cab, ...imagenes.map((x) => x.datos)]);
}

await mkdir(join(PUB, "icons"), { recursive: true });

// favicon.svg: square viewBox with the mark slightly low (it reads centred, the petals are light)
const pad = 40, lado = W + pad * 2;
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-(lado - H) / 2} ${lado} ${lado}">` +
  `<style>path{fill:${NAVY}}@media (prefers-color-scheme:dark){path{fill:${SKY}}}</style>` +
  trazos.map((d) => `<path d="${d}"/>`).join("") + `</svg>\n`;
await writeFile(join(PUB, "favicon.svg"), favicon);

// favicon.ico: navy mark on transparent, nearly full-bleed (tiny sizes need every pixel)
const icoPngs = await Promise.all([16, 32, 48].map(async (l) => ({ lado: l, datos: await png(lienzo(l, l * 0.94, NAVY, null)) })));
await writeFile(join(PUB, "favicon.ico"), ico(icoPngs));

// home-screen icons: paper mark on navy, generous padding
await writeFile(join(PUB, "apple-touch-icon.png"), await png(lienzo(180, 180 * 0.58, PAPER, NAVY, 0.01)));
await writeFile(join(PUB, "icons/icon-192.png"), await png(lienzo(192, 192 * 0.58, PAPER, NAVY, 0.01)));
await writeFile(join(PUB, "icons/icon-512.png"), await png(lienzo(512, 512 * 0.58, PAPER, NAVY, 0.01)));
// maskable: the mark's bounding box (diagonal ≈ 1.33 × width) inside the 80 % safe circle
await writeFile(join(PUB, "icons/maskable-512.png"), await png(lienzo(512, 512 * 0.5, PAPER, NAVY, 0.01)));
// monochrome: the system only uses the alpha channel
await writeFile(join(PUB, "icons/monochrome-512.png"), await png(lienzo(512, 512 * 0.62, "#FFFFFF", null)));

// Organization logo for Google (plan §3.2): square raster ≥ 112 px, the flat navy mark on white
await mkdir(join(PUB, "assets/brand"), { recursive: true });
await writeFile(join(PUB, "assets/brand/casa-lotus-logo-512.png"), await png(lienzo(512, 512 * 0.72, NAVY, "#FFFFFF")));

console.log("icons → public/: favicon.svg, favicon.ico, apple-touch-icon.png, icons/{icon-192,icon-512,maskable-512,monochrome-512}.png");
