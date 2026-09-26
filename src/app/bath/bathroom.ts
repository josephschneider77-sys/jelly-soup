import * as THREE from 'three/webgpu';
import { abs, color as tslColor, float, mix, normalView, positionLocal, positionViewDirection, pow, sin, sub, time, uniform, vec3 } from 'three/tsl';
import { BATH_HOME, BATH_PORTRAIT, CUP_HOME, DUCK_HOME, FAUCET_HOME, SPONGE_HOME } from './layout.ts';
import { TUB } from './forces.ts';

const pastel = (hex: string) => new THREE.MeshStandardMaterial({ color: hex, roughness: .72, metalness: 0 });
const glossy = (hex: string, roughness = .18) => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness: .04 });

export type BathDuck = {
  group: THREE.Group;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  phase: number;
  held: boolean;
};

export type BathBubble = {
  mesh: THREE.Mesh;
  alive: boolean;
  x: number;
  y: number;
  z: number;
  radius: number;
  speed: number;
  wait: number;
  phase: number;
  vx: number;
  vz: number;
  /** Wand bubbles stay hidden until the wand is tapped. */
  burst: boolean;
};

export type BathSponge = { group: THREE.Group; homeX: number; homeZ: number };

export class Bathroom {
  readonly group = new THREE.Group();
  readonly faucet: THREE.Group;
  readonly ducks: BathDuck[];
  readonly bubbles: BathBubble[];
  readonly sponge: BathSponge;
  readonly cup: THREE.Group;
  readonly wand: THREE.Group;
  readonly wandRing: THREE.Mesh;
  private readonly handle: THREE.Group;
  private readonly water: THREE.Mesh;
  private readonly ripple = uniform(0);
  private readonly stream: THREE.Mesh;
  private readonly cupStream: THREE.Mesh;
  private readonly mouth = new THREE.Vector3();
  private readonly pourEnd = new THREE.Vector3();
  private readonly pourDir = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly spoutLocal = new THREE.Vector3();
  private readonly splashRing: THREE.Mesh;
  private level = TUB.restLevel;
  private faucetOn = false;
  private handleAngle = 0;
  private wave = 0;
  private wandLean = 0;
  private wandYaw = 0;
  private wandRoll = 0;
  private pourLeft = 0;
  private roamX = TUB.halfX;
  private spongeHeld = false;
  private spongeReturning = false;
  private readonly pourDuration = .9;
  constructor() {
    this.group.add(this.room(), this.tub());
    const tap = this.makeFaucet();
    this.faucet = tap.group;
    this.handle = tap.handle;
    this.stream = this.makeStream();
    this.faucet.add(this.stream);
    this.splashRing = this.makeSplash();
    this.faucet.add(this.splashRing);
    this.group.add(this.faucet);
    this.water = this.makeWater();
    this.group.add(this.water);
    this.ducks = DUCK_HOME.map(([x, z], i) => this.duck(x, z, i * 1.4));
    this.bubbles = [
      ...Array.from({ length: 5 }, (_, i) => this.bubble(i, false)),
      ...Array.from({ length: 6 }, (_, i) => this.bubble(i + 5, true)),
    ];
    this.sponge = this.makeSponge();
    this.cup = this.makeCup();
    this.cupStream = this.makeCupStream();
    const wand = this.makeWand();
    this.wand = wand.group;
    this.wandRing = wand.ring;
    this.group.add(this.cup, this.cupStream, this.wand);
    this.setLevel(TUB.restLevel);
  }
  setLevel(level: number) {
    this.level = level;
    this.water.position.y = level;
  }
  setRipple(amount: number) { this.ripple.value = amount; }
  setFaucet(on: boolean) {
    this.faucetOn = on;
    this.stream.visible = on;
    this.splashRing.visible = on;
  }
  /** Where the spout pours, in world space. The stream pushes the jelly from here. */
  faucetTip(out: THREE.Vector3) {
    this.faucet.updateWorldMatrix(true, false);
    out.copy(this.spoutLocal);
    this.faucet.localToWorld(out);
    return out;
  }
  resetToys() {
    for (const duck of this.ducks) {
      duck.x = duck.homeX; duck.z = duck.homeZ; duck.vx = 0; duck.vz = 0; duck.held = false;
      this.placeDuck(duck);
    }
    this.spongeHeld = false;
    this.spongeReturning = false;
    this.sponge.group.position.set(this.sponge.homeX, this.level + .045, this.sponge.homeZ);
    this.pourLeft = 0;
    this.cup.rotation.z = 0;
    this.cupStream.visible = false;
    this.wave = 0;
    this.wand.rotation.x = this.wandLean;
    this.wand.rotation.y = this.wandYaw;
    this.wand.rotation.z = this.wandRoll;
    for (const bubble of this.bubbles) {
      if (bubble.burst) this.pop(bubble);
      else this.respawn(bubble, Math.random());
    }
  }
  /** A drag is in progress, so the sponge stays under the finger. */
  holdSponge() { this.spongeHeld = true; this.spongeReturning = false; }
  /** Let go. The sponge floats back beside the jelly instead of sitting on it. */
  releaseSponge() { this.spongeHeld = false; this.spongeReturning = true; }
  /** Tip the cup and run a stream. The caller also nudges the jelly. */
  pour() { this.pourLeft = this.pourDuration; }
  /** Wave the wand and blow a handful of bubbles across the water. */
  blow() {
    this.wave = .7;
    const ring = new THREE.Vector3();
    this.wandRing.getWorldPosition(ring);
    let n = 0;
    for (const bubble of this.bubbles) {
      if (!bubble.burst) continue;
      bubble.alive = true;
      bubble.wait = 0;
      bubble.x = ring.x + (n - 2.5) * .02;
      bubble.z = ring.z + .05 + (n % 3) * .01;
      // Low over the water. A higher start dies on the first frame.
      bubble.y = this.level + .02 + n * .002;
      bubble.speed = .008;
      bubble.vx = .014;
      bubble.vz = (n - 2.5) * .003;
      this.clearOfSponge(bubble);
      bubble.mesh.visible = true;
      bubble.mesh.position.set(bubble.x, bubble.y, bubble.z);
      n++;
      if (n >= 6) break;
    }
  }
  /** Visible half-width at the waterline. Bubbles stay inside it. */
  setRoam(halfX: number) { this.roamX = halfX; }
  update(dt: number, timeSeconds: number) {
    const wobble = this.faucetOn ? .92 + Math.sin(timeSeconds * 28) * .08 : 1;
    this.stream.scale.y = wobble;
    this.stream.position.set(this.spoutLocal.x, this.spoutLocal.y - .035 * wobble, this.spoutLocal.z);
    const tip = this.faucetTip(this.mouth);
    this.splashRing.position.set(tip.x, this.level + .006, tip.z);
    this.faucet.worldToLocal(this.splashRing.position);
    this.splashRing.scale.setScalar(.8 + Math.sin(timeSeconds * 9) * .18);
    const targetAngle = this.faucetOn ? 1.35 : 0;
    this.handleAngle += (targetAngle - this.handleAngle) * (1 - Math.exp(-10 * dt));
    this.handle.rotation.y = this.handleAngle;
    if (this.wave > 0) {
      this.wave = Math.max(0, this.wave - dt);
      const t = 1 - this.wave / .7;
      // A small nod. A bigger swing would cross the faucet.
      this.wand.rotation.x = this.wandLean + Math.sin(t * Math.PI * 3) * (1 - t) * .25;
    }
    this.aimPour(dt);
    this.easeSponge(dt);
    for (const bubble of this.bubbles) {
      if (!bubble.alive) {
        if (bubble.burst) continue;
        bubble.wait -= dt;
        if (bubble.wait <= 0) this.respawn(bubble, Math.random());
        continue;
      }
      bubble.y += bubble.speed * dt;
      const sway = bubble.burst ? .012 : .006;
      bubble.x += Math.sin(timeSeconds * .7 + bubble.phase) * sway * dt + bubble.vx * dt;
      bubble.z += Math.cos(timeSeconds * .5 + bubble.phase) * (bubble.burst ? .008 : .004) * dt + bubble.vz * dt;
      this.clearOfSponge(bubble);
      const bubbleLimit = Math.min(.12, Math.max(.05, this.roamX - bubble.radius));
      bubble.x = THREE.MathUtils.clamp(bubble.x, -bubbleLimit, bubbleLimit);
      bubble.z = THREE.MathUtils.clamp(bubble.z, -.12, .05);
      this.clearOfSponge(bubble);
      if (Math.abs(bubble.x) < .06 && bubble.z > -.03) bubble.z = -.08;
      bubble.mesh.position.set(bubble.x, bubble.y, bubble.z);
      // Wand bubbles rise slowly and live about five seconds. The others stay low.
      const ceiling = bubble.burst ? .068 : .065;
      if (bubble.y > this.level + ceiling) this.pop(bubble, 1.4 + Math.random());
    }
  }
  private aimPour(dt: number) {
    if (this.pourLeft > 0) this.pourLeft = Math.max(0, this.pourLeft - dt);
    const tilt = this.pourLeft > 0 ? Math.sin((1 - this.pourLeft / this.pourDuration) * Math.PI) * 1.15 : 0;
    this.cup.rotation.z = -tilt;
    this.cup.updateWorldMatrix(true, false);
    this.mouth.set(.012, .02, 0).applyMatrix4(this.cup.matrixWorld);
    this.pourEnd.set(this.mouth.x + .06, this.level + .01, this.mouth.z);
    this.pourDir.copy(this.pourEnd).sub(this.mouth);
    const length = this.pourDir.length();
    this.cupStream.visible = tilt > .18 && length > .02;
    if (!this.cupStream.visible) return;
    this.pourDir.multiplyScalar(1 / length);
    this.cupStream.position.copy(this.mouth).addScaledVector(this.pourDir, length * .5);
    this.cupStream.quaternion.setFromUnitVectors(this.up, this.pourDir);
    this.cupStream.scale.y = length / .14;
  }
  private easeSponge(dt: number) {
    if (!this.spongeReturning || this.spongeHeld) return;
    const homeY = this.level + .045;
    const home = this.sponge.group.position;
    const k = 1 - Math.exp(-6 * dt);
    home.x += (this.sponge.homeX - home.x) * k;
    home.y += (homeY - home.y) * k;
    home.z += (this.sponge.homeZ - home.z) * k;
    const dx = this.sponge.homeX - home.x, dy = homeY - home.y, dz = this.sponge.homeZ - home.z;
    if (dx * dx + dy * dy + dz * dz < .0004) {
      home.set(this.sponge.homeX, homeY, this.sponge.homeZ);
      this.spongeReturning = false;
    }
  }
  pop(bubble: BathBubble, wait = .8) {
    bubble.alive = false;
    bubble.wait = wait;
    bubble.mesh.visible = false;
  }
  private respawn(bubble: BathBubble, seed: number) {
    bubble.alive = true;
    bubble.wait = 0;
    // Slots sit beside and behind the jelly, never on the camera's line to its face.
    const slots: ReadonlyArray<readonly [number, number]> = [
      [-.1, .02], [-.11, -.04], [-.08, -.1], [.04, -.1],
      [-.05, .05], [-.02, -.11], [0, -.11], [.02, -.08],
    ];
    const slot = slots[Math.floor(seed * slots.length) % slots.length];
    let x = slot[0] + (seed - .5) * .03;
    let z = slot[1] + Math.sin(seed * 9) * .02;
    if (Math.hypot(x, z) < .1) x += x < 0 ? -.06 : .06;
    if (Math.abs(x) < .07 && z > -.05) z = -.14;
    bubble.x = x;
    bubble.z = z;
    this.clearOfSponge(bubble);
    bubble.y = this.level + .03 + (seed % .2);
    bubble.mesh.visible = true;
    bubble.mesh.position.set(bubble.x, bubble.y, bubble.z);
  }
  private room() {
    const room = new THREE.Group();
    const tiles = tileTexture();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.4, .04, 2.4), new THREE.MeshStandardMaterial({ map: tiles, roughness: .84, metalness: 0 }));
    floor.position.y = -.02;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.35, .06), pastel('#ffb59a'));
    back.position.set(0, .64, -.72);
    const left = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.35, 2.2), pastel('#ffe56a'));
    left.position.set(-1.15, .64, .1);
    const right = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.35, 2.2), pastel('#7ddec0'));
    right.position.set(1.15, .64, .1);
    const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(.46, .34, .04), glossy('#ffffff', .3));
    windowFrame.position.set(.35, .78, -.68);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(.36, .24, .02), new THREE.MeshStandardMaterial({
      color: '#d7f4ff', emissive: '#9ad8ff', emissiveIntensity: .35, roughness: .15,
    }));
    pane.position.set(.35, .78, -.66);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(.28, .36, .02), new THREE.MeshStandardMaterial({
      color: '#e7f7ff', roughness: .05, metalness: .65,
    }));
    mirror.position.set(-.42, .72, -.68);
    room.add(floor, back, left, right, windowFrame, pane, mirror);
    return room;
  }
  private tub() {
    const tub = new THREE.Group();
    const ceramic = glossy('#ffb7c8', .48);
    const interior = glossy('#7ec8ea', .4);
    const shell = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ceramic);
      mesh.position.set(x, y, z); tub.add(mesh);
    };
    const floor = new THREE.Mesh(new THREE.BoxGeometry(.7, .05, .46), interior);
    floor.position.set(0, .02, 0);
    tub.add(floor);
    shell(.04, .14, .46, -.34, .08, 0);
    shell(.04, .14, .46, .34, .08, 0);
    shell(.7, .16, .04, 0, .09, -.22);
    // A low front lip, so the near wall does not hide the water.
    shell(.7, .04, .04, 0, .035, .2);
    const rim = glossy('#ffd0dc', .2);
    const backRim = new THREE.Mesh(new THREE.BoxGeometry(.74, .03, .05), rim);
    backRim.position.set(0, .17, -.24);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, .46), rim);
    sideL.position.set(-.36, .15, 0);
    const sideR = sideL.clone();
    sideR.position.x = .36;
    const frontRim = new THREE.Mesh(new THREE.BoxGeometry(.74, .02, .04), rim);
    frontRim.position.set(0, .055, .22);
    tub.add(backRim, sideL, sideR, frontRim);
    return tub;
  }
  private makeWater() {
    const material = new THREE.MeshPhysicalNodeMaterial({
      color: '#0e86c4', emissive: '#7fd4ff', emissiveIntensity: .35, roughness: .06, metalness: 0, transmission: 0,
      transparent: true, opacity: .82, clearcoat: 1, clearcoatRoughness: .08,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const wave = sin(positionLocal.x.mul(26).add(time.mul(1.6))).mul(.0032)
      .add(sin(positionLocal.z.mul(34).add(time.mul(1.25))).mul(.0024));
    const ripple = sin(positionLocal.x.mul(positionLocal.x).add(positionLocal.z.mul(positionLocal.z)).mul(70).sub(time.mul(7)))
      .mul(this.ripple).mul(.012);
    material.positionNode = vec3(positionLocal.x, positionLocal.y.add(wave).add(ripple), positionLocal.z);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.56, .32, 28, 16), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    return mesh;
  }
  private makeFaucet() {
    const faucet = new THREE.Group();
    faucet.position.set(FAUCET_HOME.x, FAUCET_HOME.y, FAUCET_HOME.z);
    const metal = glossy('#d5dee8', .16);
    metal.metalness = .62;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.06, .05, .02), metal);
    plate.position.set(0, .032, -.012);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.022, .024, .046, 14), metal);
    body.position.set(0, .048, .018);
    // A short gooseneck: out from the wall, then down into the tub.
    const elbow = new THREE.Mesh(new THREE.TorusGeometry(.04, .017, 12, 18, Math.PI / 2), metal);
    elbow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
    ));
    elbow.position.set(0, .03, .04);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.016, .02, .038, 14), metal);
    nozzle.position.set(0, .011, .08);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(.02, .006, 8, 16), metal);
    mouth.rotation.x = Math.PI / 2;
    mouth.position.set(0, -.008, .08);
    this.spoutLocal.copy(mouth.position);
    const handle = new THREE.Group();
    handle.position.set(0, .078, .016);
    const pink = glossy('#ff2d86', .25);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(.016, .018, .018, 14), pink);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(.056, .02, .016), pink);
    lever.name = 'faucet-lever';
    lever.position.x = .034;
    handle.add(knob, lever);
    faucet.add(plate, body, elbow, nozzle, mouth, handle);
    return { group: faucet, handle };
  }
  private makeStream() {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(.012, .018, .07, 12),
      new THREE.MeshStandardMaterial({
        color: '#49c2ff', emissive: '#b7ecff', emissiveIntensity: .45,
        transparent: true, opacity: .88, roughness: .04, depthWrite: false,
      }),
    );
    mesh.visible = false;
    mesh.renderOrder = 3;
    return mesh;
  }
  private makeSplash() {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(.02, .045, 18),
      new THREE.MeshBasicMaterial({ color: '#e8f8ff', transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.name = 'faucet-splash';
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = 3;
    return mesh;
  }
  private duck(x: number, z: number, phase: number) {
    const group = new THREE.Group();
    const yellow = glossy('#ffcc00', .4);
    const body = new THREE.Mesh(new THREE.SphereGeometry(.024, 16, 12), yellow);
    body.scale.set(1.15, .8, 1.2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.014, 14, 10), yellow);
    head.position.set(0, .016, .014);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(.006, .016, 8), glossy('#ff7a1a', .4));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, .015, .028);
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#243042', roughness: .3 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(.003, 8, 6), eyeMat);
    const eyeR = eyeL.clone();
    eyeL.position.set(-.006, .02, .024); eyeR.position.set(.006, .02, .024);
    group.add(body, head, beak, eyeL, eyeR);
    const duck: BathDuck = { group, homeX: x, homeZ: z, x, z, vx: 0, vz: 0, phase, held: false };
    this.placeDuck(duck);
    this.group.add(group);
    return duck;
  }
  placeDuck(duck: BathDuck) {
    duck.group.position.set(duck.x, this.level + .02, duck.z);
    duck.group.rotation.z = Math.sin(duck.phase) * .08;
  }
  /** Keep bubbles off the sponge, which sits on the right of the jelly. */
  private clearOfSponge(bubble: BathBubble) {
    const dx = bubble.x - SPONGE_HOME.x, dz = bubble.z - SPONGE_HOME.z;
    if (dx * dx + dz * dz >= .08 * .08) return;
    bubble.z = Math.min(bubble.z, SPONGE_HOME.z - .09);
    if (bubble.x > SPONGE_HOME.x - .05) bubble.x = SPONGE_HOME.x - .1;
  }
  private bubble(index: number, burst: boolean) {
    const radius = (burst ? .048 : .042) + (index % 3) * .008;
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
    // Rainbow rim, nearly clear middle, so the bubble shows on the water
    // and a duck behind it stays its own colour.
    const facing = abs(normalView.dot(positionViewDirection));
    const rim = pow(sub(float(1), facing), float(1.25));
    const tint = new THREE.Color().setHSL((index * .17) % 1, .82, .62);
    material.opacityNode = mix(float(.08), float(.7), rim);
    material.colorNode = mix(tslColor(tint), tslColor('#ffffff'), rim.mul(.4));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 22, 16), material);
    mesh.renderOrder = 4;
    const bubble: BathBubble = {
      mesh, alive: !burst, x: 0, y: 0, z: 0, radius, speed: .01 + (index % 4) * .003, wait: 0, phase: index * .7, vx: 0, vz: 0, burst,
    };
    if (burst) mesh.visible = false;
    else this.respawn(bubble, index / 8);
    this.group.add(mesh);
    return bubble;
  }
  private makeSponge() {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.07, .028, .045), glossy('#ff6b9d', .62));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(.07, .01, .045), glossy('#ffe14a', .5));
    stripe.position.y = .008;
    group.add(mesh, stripe);
    const homeX = SPONGE_HOME.x, homeZ = SPONGE_HOME.z;
    group.position.set(homeX, TUB.restLevel + .045, homeZ);
    this.group.add(group);
    return { group, homeX, homeZ };
  }
  private makeCup() {
    const cup = new THREE.Group();
    const mat = glossy('#00c47a', .3);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(.03, .026, .05, 14, 1, true), mat);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(.025, 12), mat);
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -.024;
    const cupHandle = new THREE.Mesh(new THREE.TorusGeometry(.016, .004, 8, 14), mat);
    cupHandle.rotation.y = Math.PI / 2;
    cupHandle.position.set(.032, .004, 0);
    cup.add(wall, bottom, cupHandle);
    cup.position.set(CUP_HOME.x, TUB.restLevel + .05, CUP_HOME.z);
    return cup;
  }
  private makeCupStream() {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(.01, .016, .14, 10),
      new THREE.MeshStandardMaterial({
        color: '#3ec4ff', emissive: '#8ad8ff', emissiveIntensity: .4,
        transparent: true, opacity: .88, roughness: .08, depthWrite: false,
      }),
    );
    mesh.visible = false;
    mesh.renderOrder = 3;
    return mesh;
  }
  private makeWand() {
    const wand = new THREE.Group();
    const ringR = .034;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.01, .012, .08, 12), glossy('#ff7ab8', .35));
    handle.position.y = .012;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(.013, .013, .022, 12), glossy('#ffe14a', .4));
    grip.name = 'wand-grip';
    grip.position.y = -.03;
    const head = new THREE.Group();
    head.position.y = .048;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, .01, 12, 28), glossy('#3d8cff', .22));
    ring.name = 'wand-ring';
    ring.position.y = ringR;
    const film = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const shimmer = sin(time.mul(1.8).add(positionLocal.x.mul(48))).mul(.5).add(.5);
    film.opacityNode = mix(float(.1), float(.28), shimmer);
    film.colorNode = mix(tslColor('#8af7ff'), tslColor('#ffb6ea'), shimmer);
    const soap = new THREE.Mesh(new THREE.CircleGeometry(ringR - .012, 24), film);
    soap.position.y = ringR;
    const beads = new THREE.Group();
    const beadColors = ['#ff5d8f', '#ffe14a', '#7ddec0', '#7aa2ff'];
    for (let i = 0; i < 4; i++) {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(.01, 10, 8), glossy(beadColors[i], .3));
      const angle = (i / 4) * Math.PI * 2;
      bead.position.set(Math.cos(angle) * ringR, ringR + Math.sin(angle) * ringR, 0);
      beads.add(bead);
    }
    head.add(ring, soap, beads);
    wand.add(handle, grip, head);
    // Grip on the back rim. The stick leans over the water, and the ring turns to face the camera.
    wand.position.set(-.09, .2, -.22);
    this.wandLean = 1.45;
    this.wandYaw = 0;
    this.wandRoll = 0;
    wand.rotation.set(this.wandLean, this.wandYaw, this.wandRoll);
    wand.updateWorldMatrix(true, true);
    const gripPos = grip.geometry.attributes.position;
    const gripPoint = new THREE.Vector3();
    let gripMinY = Infinity;
    for (let i = 0; i < gripPos.count; i++) {
      gripPoint.fromBufferAttribute(gripPos, i).applyMatrix4(grip.matrixWorld);
      gripMinY = Math.min(gripMinY, gripPoint.y);
    }
    wand.position.y += .185 - gripMinY;
    wand.updateWorldMatrix(true, true);
    const origin = new THREE.Vector3();
    head.getWorldPosition(origin);
    const portrait = new THREE.Vector3(BATH_PORTRAIT.x, BATH_PORTRAIT.y, BATH_PORTRAIT.z).sub(origin).normalize();
    const landscape = new THREE.Vector3(BATH_HOME.x, BATH_HOME.y, BATH_HOME.z).sub(origin).normalize();
    const aim = portrait.add(landscape).normalize();
    const localAim = aim.transformDirection(new THREE.Matrix4().copy(wand.matrixWorld).invert());
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localAim);
    return { group: wand, ring };
  }
}

function tileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const colors = ['#ff8fb8', '#7ad7ff', '#ffe14a', '#7ddec0'];
  g.fillStyle = '#fff7ef';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = colors[(x + y) % colors.length];
    g.fillRect(x * 64 + 4, y * 64 + 4, 56, 56);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
