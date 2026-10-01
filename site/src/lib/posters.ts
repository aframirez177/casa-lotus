// Video posters as optimised images (AVIF/WebP at the size they are shown). The originals stay in
// public/assets/video for the video player and the VideoObject thumbnails.
import type { ImageMetadata } from "astro";
import t1 from "../assets/posters/testimonio-1.webp";
import t2 from "../assets/posters/testimonio-2.webp";
import t3 from "../assets/posters/testimonio-3.webp";
import primera from "../assets/posters/primera-clase.webp";

export const POSTERS: Record<string, ImageMetadata> = {
  "testimonio-1": t1,
  "testimonio-2": t2,
  "testimonio-3": t3,
  "primera-clase": primera,
};
