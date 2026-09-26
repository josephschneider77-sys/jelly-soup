import type { SoftBody } from '../../physics/soft-body.js';

/** Tub in meters. The jelly is about 7 cm, so the bath stays small and close. */
export const TUB = {
  halfX: .30,
  halfZ: .18,
  floor: .032,
  restLevel: .108,
  maxLevel: .145,
};

export type FaucetPush = { on: boolean; x: number; z: number };

/** Move the settled jelly into the tub without changing its rest shape. */
export function placeInTub(body: SoftBody, height = .09) {
  body.reset();
  body.updateCenter();
  const dx = -body.center.x, dy = height - body.center.y, dz = -body.center.z;
  const x = body.x, previous = body.previous;
  for (let i = 0; i < x.length; i += 3) {
    x[i] += dx; x[i + 1] += dy; x[i + 2] += dz;
    previous[i] += dx; previous[i + 1] += dy; previous[i + 2] += dz;
  }
  body.velocity.fill(0);
  body.updateCenter();
  body.orientationSafety?.capture();
  body.updateSurface();
  body.wake();
}

/**
 * Buoyancy, drag, and the faucet stream as velocity impulses.
 * Elasticity still holds the jelly together; this only pushes the particles.
 * Returns the root-mean-square particle speed, used to drive ripples.
 */
export function applyBathForces(body: SoftBody, level: number, h: number, faucet: FaucetPush, time: number) {
  const x = body.x, v = body.velocity, n = body.mass.length;
  const bob = Math.sin(time * 1.6) * .55;
  let speed = 0, submerged = 0;
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const px = x[j], py = x[j + 1], pz = x[j + 2];
    const depth = level - py;
    if (depth > 0) {
      const sub = Math.min(1, depth / .022);
      submerged++;
      v[j + 1] += (6.8 * sub + bob * sub - 7.5 * v[j + 1] * sub) * h;
      const drag = Math.min(.65, 3.4 * sub * h);
      v[j] -= v[j] * drag;
      v[j + 2] -= v[j + 2] * drag;
    }
    if (faucet.on) {
      const dx = px - faucet.x, dz = pz - faucet.z;
      if (dx * dx < .0036 && dz > -.02 && dz < .18 && py > level - .1) {
        // Slide across the tub. A push toward +z parks the jelly behind the front lip.
        v[j] += 6.5 * h;
        v[j + 2] -= 1.6 * h;
        v[j + 1] -= .4 * h;
      }
    }
    speed += v[j] * v[j] + v[j + 1] * v[j + 1] + v[j + 2] * v[j + 2];
  }
  body.wake();
  return { speed: Math.sqrt(speed / Math.max(1, n)), submerged };
}

/** Soft tub walls and floor so a toss stays in the bath. halfX can be the visible slice of the tub. */
export function containInTub(body: SoftBody, halfX = TUB.halfX) {
  const x = body.x, v = body.velocity;
  const { halfZ, floor } = TUB;
  const limit = Math.min(TUB.halfX, Math.max(.05, halfX));
  for (let i = 0; i < body.mass.length; i++) {
    const j = i * 3;
    pushInside(x, v, j, -limit, limit);
    pushInside(x, v, j + 2, -halfZ, halfZ);
    if (x[j + 1] < floor) {
      x[j + 1] = floor;
      if (v[j + 1] < 0) v[j + 1] = .25;
    }
  }
}

function pushInside(x: Float64Array, v: Float64Array, index: number, min: number, max: number) {
  if (x[index] < min) {
    x[index] = min;
    if (v[index] < 0) v[index] *= -.15;
  } else if (x[index] > max) {
    x[index] = max;
    if (v[index] > 0) v[index] *= -.15;
  }
}

/** A cup pour: a soft downward shove on whatever is under the cup. */
export function pourOn(body: SoftBody, x: number, z: number) {
  const p = body.x, v = body.velocity;
  body.wake();
  for (let i = 0; i < body.mass.length; i++) {
    const j = i * 3;
    const dx = p[j] - x, dz = p[j + 2] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < .014) {
      // A small nudge. A hard downward kick sinks the jelly under the water line.
      v[j + 1] = Math.max(-.08, v[j + 1] - .16);
      v[j] += dx * 2;
      v[j + 2] += dz * 2;
    }
  }
}
