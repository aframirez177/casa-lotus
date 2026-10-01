// Shared between the light site script (sitio.js) and the motion module (movimiento.js), which fills
// these hooks when it loads: until then everything works without them.
export const estado = {
  /** Lenis instance (smooth scroll), to stop it under dialogs and the menu */
  lenis: null,
  /** heading line-split entrance (GSAP SplitText) */
  splitIn: null,
  /** plans: tween a price from → to and fade the lines under it */
  precio: null,
};
