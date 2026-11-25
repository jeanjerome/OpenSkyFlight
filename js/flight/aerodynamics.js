import {
  ALPHA_CL_MAX,
  CD0_SUBSONIC,
  CD0_SUPERSONIC,
  CD0_TRANSONIC,
  CL_MAX,
  INDUCED_DRAG_SUBSONIC,
  INDUCED_DRAG_SUPERSONIC,
} from '../constants/rafale.js';

/**
 * Aerodynamic coefficients of the Rafale, referred to the wing area.
 *
 * Lift rises with the angle of attack along a sine up to CL_MAX at
 * ALPHA_CL_MAX (the vortices of the delta wing and canards keep the lift
 * growing well past the linear range), then falls slowly; the curve is scaled
 * with Mach as the lift slope of a low aspect ratio wing (DATCOM): a little
 * higher near Mach 1, lower when supersonic. Drag is a parabolic polar,
 * CD0(M) + k(M)·CL², plus the normal-force drag of the wing past the highest
 * lift.
 */

/** Points (Mach, value) interpolated linearly, held beyond the ends */
function piecewise(points) {
  return (mach) => {
    if (mach <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [m1, v1] = points[i];
      if (mach <= m1) {
        const [m0, v0] = points[i - 1];
        return v0 + ((v1 - v0) * (mach - m0)) / (m1 - m0);
      }
    }
    return points[points.length - 1][1];
  };
}

/** Lift relative to low speed at a given angle of attack */
export const liftMachFactor = piecewise([
  [0, 1],
  [0.8, 1.12],
  [0.95, 1.18],
  [1.1, 1.1],
  [1.4, 0.85],
  [2, 0.6],
]);

/** Zero-lift drag coefficient */
export const zeroLiftDrag = piecewise([
  [0.8, CD0_SUBSONIC],
  [0.95, CD0_SUBSONIC + (CD0_TRANSONIC - CD0_SUBSONIC) * 0.35],
  [1.05, CD0_TRANSONIC],
  [1.2, CD0_TRANSONIC],
  [2, CD0_SUPERSONIC],
]);

/** Induced drag factor k */
export const inducedDragFactor = piecewise([
  [0.9, INDUCED_DRAG_SUBSONIC],
  [2, INDUCED_DRAG_SUPERSONIC],
]);

/** Rate at which lift falls past the highest lift (per rad of angle of attack) */
const POST_STALL_SLOPE = 1.4;

/**
 * Lift coefficient
 * @param {number} alpha - angle of attack (rad)
 * @param {number} mach
 */
export function liftCoefficient(alpha, mach) {
  const a = Math.abs(alpha);
  const shape =
    a <= ALPHA_CL_MAX
      ? Math.sin((Math.PI / 2) * (a / ALPHA_CL_MAX))
      : Math.cos(Math.min(Math.PI / 2, (a - ALPHA_CL_MAX) * POST_STALL_SLOPE));
  return Math.sign(alpha) * CL_MAX * shape * liftMachFactor(mach);
}

/**
 * Angle of attack giving a lift coefficient, on the rising part of the curve;
 * the angle of the highest lift when the coefficient is out of reach
 * @param {number} cl
 * @param {number} mach
 */
export function alphaForLift(cl, mach) {
  const ratio = Math.min(1, Math.abs(cl) / (CL_MAX * liftMachFactor(mach)));
  return Math.sign(cl) * ((2 * ALPHA_CL_MAX) / Math.PI) * Math.asin(ratio);
}

/**
 * Drag coefficient
 * @param {number} alpha - angle of attack (rad)
 * @param {number} cl - lift coefficient at that angle
 * @param {number} mach
 * @param {number} [extra=0] - zero-lift drag added (airbrake, gear)
 */
export function dragCoefficient(alpha, cl, mach, extra = 0) {
  const beyond = Math.max(0, Math.abs(alpha) - ALPHA_CL_MAX);
  return zeroLiftDrag(mach) + extra + inducedDragFactor(mach) * cl * cl + 1.2 * Math.sin(beyond) ** 2;
}
