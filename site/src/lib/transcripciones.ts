// Video transcripts, read from the captions (.vtt) at build time. They go in the VideoObject JSON-LD and
// as visible text under each testimonial: what JS-blind AI crawlers can actually read (plan §3.4).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "public/assets/video");

function texto(vtt: string) {
  return vtt
    .split(/\r?\n/)
    .filter((l) => l && l !== "WEBVTT" && !/-->/.test(l) && !/^\d+$/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

let cache: Record<string, string> | null = null;
/** { "testimonio-1": "Hola. Bueno, a mí me gusta…" } */
export function transcripciones() {
  cache ??= Object.fromEntries(
    readdirSync(DIR).filter((f) => f.endsWith(".vtt")).map((f) => [f.replace(/\.vtt$/, ""), texto(readFileSync(join(DIR, f), "utf8"))]),
  );
  return cache;
}
