import type { APIRoute } from "astro";
import { llms } from "../lib/llms";
export const GET: APIRoute = () => new Response(llms(), { headers: { "content-type": "text/plain; charset=utf-8" } });
