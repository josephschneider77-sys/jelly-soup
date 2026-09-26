import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FlavorPicker } from './flavor-picker.ts';
import { Input } from './input.ts';
import { FixedStepper } from './fixed-step.ts';
import { Locomotion } from './locomotion.ts';
import { JellySound } from './sound.ts';
import { Bathroom, type BathBubble, type BathDuck } from './bath/bathroom.ts';
import { applyBathForces, containInTub, placeInTub, pourOn, TUB, type FaucetPush } from './bath/forces.ts';
import { BATH_HOME } from './bath/layout.ts';
import { Baby } from '../graphics/character/baby.ts';
import { createRenderer, resizeView } from '../graphics/scene/renderer.ts';
import { PHYS } from '../physics/constants.js';
import { loadBabyCage } from '../physics/baby-cage.ts';
import { SoftBody } from '../physics/soft-body.js';

export async function startGame(stage: (s: string) => void, fail: (e: unknown) => void) {
  stage('Starting WebGPU');
  const renderer = await createRenderer(fail);
  document.querySelector('#viewport')!.appendChild(renderer.domElement);
  const sound = new JellySound();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#7ec8f5');
  scene.fog = new THREE.Fog('#b9e2f8', 4.2, 8);
  const camera = new THREE.PerspectiveCamera(36, 1, .02, 12);
  camera.position.set(BATH_HOME.x, BATH_HOME.y, BATH_HOME.z);
  stage('Filling the tub');
  const body = new SoftBody(await loadBabyCage());
  // The face is bound in the jelly's rest pose. Move it into the tub after that.
  const baby = new Baby(body);
  placeInTub(body);
  const bath = new Bathroom();
  scene.add(bath.group, baby.group);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environment = environment;
  baby.setReflectionMap(environment, 1.15);
  scene.add(new THREE.HemisphereLight('#fff1e0', '#6eb6e8', .85));
  const sun = new THREE.DirectionalLight('#fff6e8', 1.25);
  sun.position.set(.45, .9, .35);
  scene.add(sun);
  // Squish uses the rig. rig.step() is the walking motor, and its muscles fight the bath.
  const rig = new Locomotion(body);
  camera.lookAt(body.center);
  const input = new Input(camera, renderer.domElement, body, baby.mesh, rig, sound);
  const faucet: FaucetPush = { on: false, x: 0, z: -.1 };
  let level = TUB.restLevel;
  let ripple = 0;
  let simTime = 0;
  let splashWait = 0;
  let giggleWait = 0;
  let squeezeWait = 0;
  let wasUnder = true;
  let refill: 'idle' | 'drain' | 'fill' = 'idle';
  const clock = new FixedStepper(PHYS.step);
  const faucetCenter = new THREE.Vector3();
  const duckCenters = bath.ducks.map(() => new THREE.Vector3());
  const bubbleCenters = bath.bubbles.map(() => new THREE.Vector3());
  const spongeCenter = new THREE.Vector3();
  const cupCenter = new THREE.Vector3();
  const spongeOffset = new THREE.Vector3();

  const giggle = () => {
    if (giggleWait > 0) return;
    giggleWait = .35;
    baby.cheer();
    sound.chirp();
  };
  const splash = (amount: number) => {
    ripple = Math.min(1, ripple + amount);
    if (splashWait > 0) return;
    splashWait = .28;
    sound.splash();
  };
  let interaction: string | null = null;
  let squishCount = 0;
  let squishAt = 0;
  const note = (name: string) => { interaction = name; };
  const noteSquish = () => { squishCount++; squishAt = performance.now(); };
  input.onTapJelly = () => { note('jelly'); noteSquish(); rig.squish(); giggle(); splash(.35); };
  // Space splashes the water. Bath Time has no rideable toy to climb off.
  input.onTapGround = () => { ripple = Math.min(1, ripple + .25); };
  const syncCenters = () => {
    bath.faucet.getWorldPosition(faucetCenter);
    faucet.x = faucetCenter.x; faucet.z = faucetCenter.z + .09;
    bath.ducks.forEach((duck, i) => duckCenters[i].set(duck.x, level + .02, duck.z));
    bath.bubbles.forEach((bubble, i) => bubbleCenters[i].set(bubble.x, bubble.y, bubble.z));
    spongeCenter.set(bath.sponge.group.position.x, bath.sponge.group.position.y, bath.sponge.group.position.z);
    bath.cup.getWorldPosition(cupCenter);
  };
  syncCenters();
  input.toyTaps.push({
    center: faucetCenter, radius: .05, object: bath.faucet, label: 'faucet', use: () => {
      note('faucet');
      faucet.on = !faucet.on;
      bath.setFaucet(faucet.on);
      splash(.2);
    },
  });
  bath.ducks.forEach((duck, i) => {
    const offset = new THREE.Vector3();
    input.toyTaps.push({
      center: duckCenters[i], radius: .05, object: duck.group, label: 'duck',
      use: () => {
        note('duck');
        sound.squeak();
        duck.vx += (Math.random() - .5) * .35;
        duck.vz += (Math.random() - .5) * .35;
        giggle();
      },
      drag: (phase, point) => {
        note('duck');
        if (phase === 'start') { duck.held = true; offset.set(duck.x - point.x, 0, duck.z - point.z); }
        if (phase === 'end') { duck.held = false; return; }
        duck.x = THREE.MathUtils.clamp(point.x + offset.x, -TUB.halfX + .03, TUB.halfX - .03);
        duck.z = THREE.MathUtils.clamp(point.z + offset.z, -TUB.halfZ + .03, TUB.halfZ - .03);
        duck.vx = 0; duck.vz = 0;
        duck.group.position.set(duck.x, level + .02, duck.z);
        duckCenters[i].copy(duck.group.position);
      },
    });
  });
  bath.bubbles.forEach((bubble, i) => input.toyTaps.push({
    center: bubbleCenters[i], radius: .05, object: bubble.mesh, label: 'bubble', yieldsToJelly: true,
    use: () => popBubble(bubble),
  }));
  input.toyTaps.push({
    center: spongeCenter, radius: .05, object: bath.sponge.group, label: 'sponge',
    use: () => { note('sponge'); squeeze(); },
    drag: (phase, point) => {
      note('sponge');
      if (phase === 'start') spongeOffset.copy(bath.sponge.group.position).sub(point);
      const x = THREE.MathUtils.clamp(point.x + spongeOffset.x, -TUB.halfX + .04, TUB.halfX - .04);
      const z = THREE.MathUtils.clamp(point.z + spongeOffset.z, -TUB.halfZ + .04, TUB.halfZ - .04);
      bath.sponge.group.position.set(x, level + .045, z);
      spongeCenter.copy(bath.sponge.group.position);
      if (phase !== 'start') squeeze();
    },
  });
  input.toyTaps.push({
    center: cupCenter, radius: .05, object: bath.cup, label: 'cup', use: () => {
      note('cup');
      pourOn(body, body.center.x, body.center.z);
      splash(.7);
      giggle();
    },
  });

  function popBubble(bubble: BathBubble) {
    if (!bubble.alive) return;
    note('bubble');
    bath.pop(bubble);
    sound.pop();
    giggle();
    ripple = Math.min(1, ripple + .3);
  }
  function squeeze() {
    if (squeezeWait > 0) return;
    if (bath.sponge.group.position.distanceTo(body.center) > .09) return;
    squeezeWait = .32;
    noteSquish();
    rig.squish();
    giggle();
  }
  function stepDucks(h: number) {
    const jellyX = body.center.x, jellyZ = body.center.z;
    for (const duck of bath.ducks) separateDuck(duck, jellyX, jellyZ, h);
    for (let a = 0; a < bath.ducks.length; a++) for (let b = a + 1; b < bath.ducks.length; b++) {
      const left = bath.ducks[a], right = bath.ducks[b];
      const dx = right.x - left.x, dz = right.z - left.z, dist = Math.hypot(dx, dz) || .0001;
      if (dist < .06) {
        const push = (.1 - dist) * 2.2;
        left.vx -= dx / dist * push; left.vz -= dz / dist * push;
        right.vx += dx / dist * push; right.vz += dz / dist * push;
      }
    }
  }
  function separateDuck(duck: BathDuck, jellyX: number, jellyZ: number, h: number) {
    if (duck.held) {
      duck.group.position.y = level + .02 + Math.sin(simTime * 2 + duck.phase) * .004;
      return;
    }
    duck.vx += (duck.homeX - duck.x) * 1.5 * h;
    duck.vz += (duck.homeZ - duck.z) * 1.5 * h;
    const dx = duck.x - jellyX, dz = duck.z - jellyZ, dist = Math.hypot(dx, dz);
    if (dist < .06 && dist > 1e-4) {
      const push = (.09 - dist) * 4;
      duck.vx += dx / dist * push; duck.vz += dz / dist * push;
      const v = body.velocity;
      for (let i = 0; i < body.mass.length; i++) {
        const j = i * 3;
        const px = body.x[j] - duck.x, pz = body.x[j + 2] - duck.z;
        if (px * px + pz * pz < .008) { v[j] -= dx / dist * .9 * h; v[j + 2] -= dz / dist * .9 * h; }
      }
    }
    duck.vx *= Math.exp(-1.4 * h); duck.vz *= Math.exp(-1.4 * h);
    duck.x = THREE.MathUtils.clamp(duck.x + duck.vx * h, -TUB.halfX + .04, TUB.halfX - .04);
    duck.z = THREE.MathUtils.clamp(duck.z + duck.vz * h, -TUB.halfZ + .04, TUB.halfZ - .04);
    duck.group.position.set(duck.x, level + .02 + Math.sin(simTime * 2 + duck.phase) * .004, duck.z);
    duck.group.rotation.y = Math.sin(simTime * .7 + duck.phase) * .4;
  }

  const reset = () => {
    input.clear();
    interaction = null;
    faucet.on = false;
    bath.setFaucet(false);
    refill = 'drain';
    splash(.4);
  };
  document.querySelector('#sound')!.addEventListener('click', () => {
    const muted = sound.toggle();
    document.querySelector('#sound')!.classList.toggle('muted', muted);
    document.querySelector('#sound')!.setAttribute('aria-pressed', String(muted));
    void sound.unlock().catch(() => {});
  });
  document.querySelector('#reset')!.addEventListener('click', reset);
  const flavors = new FlavorPicker(name => baby.setFlavor(name));
  const resize = () => resizeView(renderer, camera, input.controls, 1.5);
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(document.body);
  let disposed = false;
  let last = performance.now();
  const frame = (now: number) => {
    if (disposed) return;
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000));
    last = now;
    splashWait = Math.max(0, splashWait - dt);
    giggleWait = Math.max(0, giggleWait - dt);
    squeezeWait = Math.max(0, squeezeWait - dt);
    const target = refill === 'drain' ? TUB.floor + .012 : faucet.on ? Math.min(TUB.maxLevel, TUB.restLevel + .028) : TUB.restLevel;
    level += (target - level) * (1 - Math.exp(-dt * (refill === 'idle' ? .7 : 2.4)));
    if (refill === 'drain' && level < TUB.floor + .02) {
      placeInTub(body);
      rig.reset();
      bath.resetToys();
      syncCenters();
      refill = 'fill';
    } else if (refill === 'fill' && Math.abs(level - TUB.restLevel) < .004) refill = 'idle';
    bath.setLevel(level);
    const beforeY = body.center.y;
    clock.advance(dt, () => {
      simTime += PHYS.step;
      input.step(PHYS.step);
      const motion = applyBathForces(body, level, PHYS.step, faucet, simTime);
      stepDucks(PHYS.step);
      body.step(PHYS.step);
      containInTub(body);
      input.afterPhysicsStep();
      if (motion.speed > .35) ripple = Math.min(1, ripple + motion.speed * .04);
    });
    body.updateCenter();
    const under = body.center.y < level + .01;
    if (under && !wasUnder && beforeY - body.center.y > 0) splash(.8);
    wasUnder = under;
    ripple *= Math.exp(-2.2 * dt);
    bath.setRipple(ripple);
    body.updateSurface();
    baby.update(dt);
    bath.update(dt, simTime);
    syncCenters();
    input.update(dt);
    sound.listen(camera);
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(frame);
  stage('Bath time');
  if (new URLSearchParams(location.search).get('qc') === '1') {
    const spherical = new THREE.Spherical();
    const offset = new THREE.Vector3();
    Object.assign(window, {
      __jellyQC: {
        get jelly() { return { x: body.center.x, y: body.center.y, z: body.center.z }; },
        get squish() { return { count: squishCount, active: squishAt > 0 && performance.now() - squishAt < 400 }; },
        get interaction() { return input.hold() ?? interaction; },
        get faucet() { return faucet.on; },
        get camera() {
          offset.copy(camera.position).sub(input.controls.target);
          spherical.setFromVector3(offset);
          return { theta: spherical.theta, phi: spherical.phi, radius: spherical.radius };
        },
      },
    });
  }
  return {
    stop: () => {
      disposed = true;
      input.dispose();
      flavors.dispose();
      sound.dispose();
      resizeObserver.disconnect();
      void renderer.setAnimationLoop(null);
      pmrem.dispose();
    },
  };
}
