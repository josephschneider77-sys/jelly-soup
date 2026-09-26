export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Soupier than the original confection. Shear is low enough that landings
// squash and walks slosh, bulk stays high enough that the body keeps a
// readable volume (it does not puddle or invert), and the lighter axial
// damping lets that wobble ring for a few seconds instead of dying at once.
export const PHYS = {
  density: 1050, shear: 640, bulk: 46000, damping: 1.55,
  gravity: 2.4, step: 1 / 240, iterations: 3,
  staticFriction: .65, dynamicFriction: .42, restitution: .1,
  floor: .00015, maxGrabForce: 2.8,
};
