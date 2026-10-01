// Motion's providers live where motion is used (role frames, sheets, toasts, sign-in pages), not at the root,
// so the public booking page paints without them. Nesting is fine: the innermost provider wins.
import { LazyMotion, MotionConfig } from "motion/react";

const cargar = () => import("./motion-funciones.js").then((r) => r.default);

export function ConMovimiento({ children }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={cargar} strict>{children}</LazyMotion>
    </MotionConfig>
  );
}
