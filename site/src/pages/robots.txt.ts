// robots.txt (docs/seo/plan.md §5.6): open to every search and answer engine, including AI crawlers
// (a model that knows the studio is an asset). /app/ is NOT disallowed: Google must crawl it to see its
// noindex (the app serves it). /api/ is never a page.
import type { APIRoute } from "astro";
import { SITIO } from "../data/estudio";

export const GET: APIRoute = () =>
  new Response(
    [
      `# ${SITIO}/robots.txt`,
      "# Casa Lotus welcomes search engines and AI answer engines. Facts: /llms.txt and /llms-full.txt.",
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "",
      `Sitemap: ${SITIO}/sitemap-index.xml`,
      "",
    ].join("\n"),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
