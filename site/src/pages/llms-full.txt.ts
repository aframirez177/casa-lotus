import type { APIRoute } from "astro";
import { llmsCompleto } from "../lib/llms";
export const GET: APIRoute = () => new Response(llmsCompleto(), { headers: { "content-type": "text/plain; charset=utf-8" } });
