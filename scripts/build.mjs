// Build the public site into web/dist and check it before it ships.
// Zero dependencies: runs the same locally (`npm run build`) and in GitHub Actions.
//
// - copies web/src → web/dist, leaving out internal pages (audit bench, explorations)
// - fails if any local file referenced from HTML or CSS is missing
// - fails if an absolute "/path" slips in (GitHub Pages serves the site under /<repo>/)
// - warns (does not fail) for every piece of content still marked data-todo
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB, "src");
const DIST = join(WEB, "dist");
const INTERNAL = new Set(["auditoria", "exploraciones"]);
const SKIP_FILES = new Set([".gitkeep", ".DS_Store"]);
const inCI = !!process.env.GITHUB_ACTIONS;

const errors = [];
const exists = async (p) => stat(p).then(() => true, () => false);
const warn = (msg, file) => console.log(inCI ? `::warning file=${file ?? ""}::${msg}` : `⚠︎  ${msg}${file ? ` (${file})` : ""}`);
const fail = (msg, file) => errors.push(inCI ? `::error file=${file ?? ""}::${msg}` : `✗  ${msg}${file ? ` (${file})` : ""}`);

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(SRC, DIST, {
  recursive: true,
  filter: (src) => {
    const rel = relative(SRC, src);
    const top = rel.split(/[\\/]/)[0];
    return !INTERNAL.has(top) && !SKIP_FILES.has(rel.split(/[\\/]/).pop());
  },
});
await writeFile(join(DIST, ".nojekyll"), "");

// Cache busting. GitHub Pages serves everything with `cache-control: max-age=600`, so after a
// deploy a phone can mix a fresh page with a stale script for ten minutes. Every local .js/.css
// referenced from HTML gets ?v=<content hash>: when a file changes, its URL changes with it.
const hashOf = async (file) => createHash("sha1").update(await readFile(file)).digest("hex").slice(0, 10);
for (const page of (await readdir(DIST)).filter((f) => f.endsWith(".html"))) {
  const file = join(DIST, page);
  let html = await readFile(file, "utf8");
  const refs = [...new Set([...html.matchAll(/\s(?:src|href)="((?!https?:|\/\/)[^"?#]+\.(?:js|css))"/g)].map((m) => m[1]))];
  for (const ref of refs) {
    const target = join(DIST, ref);
    if (await exists(target)) html = html.replaceAll(`"${ref}"`, `"${ref}?v=${await hashOf(target)}"`);
  }
  await writeFile(file, html);
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}

const files = await walk(DIST);
let todos = 0;

for (const file of files.filter((f) => [".html", ".css"].includes(extname(f)))) {
  const text = await readFile(file, "utf8");
  const rel = relative(WEB, file);
  const refs = extname(file) === ".html"
    ? [...text.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    : [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);

  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:|#|%23)/.test(ref)) continue;
    if (ref.startsWith("/")) { fail(`absolute path "${ref}" breaks on GitHub Pages; use a relative path`, rel); continue; }
    const target = resolve(dirname(file), ref.split(/[?#]/)[0]);
    if (!(await exists(target))) fail(`missing file "${ref}"`, rel);
  }

  if (extname(file) === ".html") {
    const n = (text.match(/data-todo/g) || []).length;
    if (n) { todos += n; warn(`${n} block(s) still marked data-todo (content pending with Ana)`, rel); }
  }
}

const size = (await Promise.all(files.map((f) => stat(f).then((s) => s.size)))).reduce((a, b) => a + b, 0);
console.log(`dist: ${files.length} files, ${(size / 1024).toFixed(0)} KB · pending data-todo: ${todos}`);

if (errors.length) {
  errors.forEach((e) => console.log(e));
  process.exit(1);
}
