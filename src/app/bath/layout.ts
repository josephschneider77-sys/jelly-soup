/** Shared bath framing so the toys stay inside the picture on every screen. */

export const BATH_HOME = { x: 0, y: .7, z: .82, lookX: 0, lookY: .1, lookZ: -.02 };
/** Meters of the bath that must stay inside the frame at the home distance. */
export const BATH_FIT = { distance: 1.02, halfW: .48, halfH: .34, maxFov: 96 };
export const BATH_ORBIT = { minDistance: .2, maxDistance: 1.6, minPolar: .4, maxPolar: 1.06 };

export const DUCK_HOME: ReadonlyArray<readonly [number, number]> = [
  [-.17, -.06],
  [.18, -.03],
  [0, -.14],
];
export const CUP_HOME = { x: -.2, z: -.08 };
export const SPONGE_HOME = { x: .2, z: .06 };
export const FAUCET_HOME = { x: 0, y: .16, z: -.2 };

/** Vertical field of view, in degrees, that fits the tub at this aspect. */
export function bathFov(aspect: number) {
  const { distance, halfW, halfH, maxFov } = BATH_FIT;
  const safeAspect = Math.max(aspect, .2);
  const tanHalf = Math.max(halfH / distance, halfW / (distance * safeAspect));
  return Math.min(maxFov, 2 * Math.atan(tanHalf) * 180 / Math.PI);
}
