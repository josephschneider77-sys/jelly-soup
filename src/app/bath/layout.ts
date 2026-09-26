/** Shared bath framing so the toys stay big enough to tap on every screen. */

export const BATH_HOME = { x: 0, y: .7, z: .82, lookX: 0, lookY: .09, lookZ: 0 };
/** Wide screens keep the three-quarter view. The fit numbers are the tub, not the room. */
export const BATH_FIT = { distance: 1.02, halfW: .48, halfH: .34, maxFov: 96 };
/**
 * Portrait stands over the tub. A wide field of view, used to squeeze the tub's
 * width into a tall screen, shrinks every toy. minPolar stays under this angle.
 */
export const BATH_PORTRAIT = { fov: 50, x: 0, y: .78, z: .36 };
export const PORTRAIT_ASPECT = .9;
/** Orbit target. The jelly cannot leave the tub, so the camera does not follow it. */
export const TUB_LOOK = { x: 0, y: .09, z: 0 };
export const BATH_ORBIT = { minDistance: .2, maxDistance: 1.6, minPolar: .3, maxPolar: 1.06 };

export const DUCK_HOME: ReadonlyArray<readonly [number, number]> = [
  [-.1, .015],
  [.09, -.02],
  [0, -.1],
];
export const CUP_HOME = { x: -.09, z: -.05 };
export const SPONGE_HOME = { x: .09, z: .04 };
export const FAUCET_HOME = { x: 0, y: .16, z: -.2 };

export type BathFrame = {
  fov: number;
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
};

/** Vertical field of view, in degrees, for a wide screen at the home distance. */
export function bathFov(aspect: number) {
  const { distance, halfW, halfH, maxFov } = BATH_FIT;
  const safeAspect = Math.max(aspect, .2);
  const tanHalf = Math.max(halfH / distance, halfW / (distance * safeAspect));
  return Math.min(maxFov, 2 * Math.atan(tanHalf) * 180 / Math.PI);
}

/** Camera pose. Tall screens move in and look down so the tub fills the height. */
export function bathFrame(aspect: number): BathFrame {
  const lookX = TUB_LOOK.x, lookY = TUB_LOOK.y, lookZ = TUB_LOOK.z;
  if (aspect < PORTRAIT_ASPECT) {
    return { fov: BATH_PORTRAIT.fov, x: BATH_PORTRAIT.x, y: BATH_PORTRAIT.y, z: BATH_PORTRAIT.z, lookX, lookY, lookZ };
  }
  return { fov: bathFov(aspect), x: BATH_HOME.x, y: BATH_HOME.y, z: BATH_HOME.z, lookX, lookY, lookZ };
}
