import * as THREE from 'three/webgpu';
import { positionLocal, sin, time, uniform, vec3 } from 'three/tsl';
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
  private readonly water: THREE.Mesh;
  private readonly ripple = uniform(0);
  private readonly stream: THREE.Mesh;
  private level = TUB.restLevel;
  private faucetOn = false;
  constructor() {
    this.group.add(this.room(), this.tub());
    this.faucet = this.makeFaucet();
    this.stream = this.makeStream();
    this.faucet.add(this.stream);
    this.group.add(this.faucet);
    this.water = this.makeWater();
    this.group.add(this.water);
    this.ducks = [
      this.duck(-.14, .05, 0),
      this.duck(.15, .02, 1.4),
      this.duck(.02, .11, 2.6),
    ];
    this.bubbles = Array.from({ length: 8 }, (_, i) => this.bubble(i));
    this.sponge = this.makeSponge();
    this.cup = this.makeCup();
    this.wand = this.makeWand();
    this.group.add(this.cup, this.wand);
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
  }
  resetToys() {
    for (const duck of this.ducks) {
      duck.x = duck.homeX; duck.z = duck.homeZ; duck.vx = 0; duck.vz = 0;
      this.placeDuck(duck);
    }
    this.sponge.group.position.set(this.sponge.homeX, this.level + .045, this.sponge.homeZ);
    for (const bubble of this.bubbles) this.respawn(bubble, Math.random());
  }
  update(dt: number, timeSeconds: number) {
    this.stream.scale.y = this.faucetOn ? .85 + Math.sin(timeSeconds * 28) * .08 : 1;
    this.stream.position.y = this.faucetOn ? .02 - this.stream.scale.y * .08 : .02;
    for (const bubble of this.bubbles) {
      if (!bubble.alive) {
        bubble.wait -= dt;
        if (bubble.wait <= 0) this.respawn(bubble, Math.random());
        continue;
      }
      bubble.y += bubble.speed * dt;
      bubble.x += Math.sin(timeSeconds * 1.3 + bubble.phase) * .012 * dt;
      bubble.mesh.position.set(bubble.x, bubble.y, bubble.z);
      if (bubble.y > this.level + .16) this.pop(bubble, 1.2 + Math.random());
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
    bubble.x = (seed - .5) * .36;
    bubble.z = (Math.sin(seed * 12) - .2) * .16;
    bubble.y = this.level + .01 + seed * .04;
    bubble.mesh.visible = true;
    bubble.mesh.position.set(bubble.x, bubble.y, bubble.z);
  }
  private room() {
    const room = new THREE.Group();
    const tiles = tileTexture();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.4, .04, 2.4), new THREE.MeshStandardMaterial({ map: tiles, roughness: .84, metalness: 0 }));
    floor.position.y = -.02;
    const wallMat = pastel('#f6fbff');
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.35, .06), wallMat);
    back.position.set(0, .64, -.72);
    const left = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.35, 2.2), pastel('#fff4f8'));
    left.position.set(-1.15, .64, .1);
    const right = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.35, 2.2), pastel('#f3fff8'));
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
    const ceramic = glossy('#fffdf8', .22);
    const shell = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ceramic);
      mesh.position.set(x, y, z); tub.add(mesh);
    };
    shell(.7, .05, .46, 0, .02, 0);
    shell(.04, .22, .46, -.34, .12, 0);
    shell(.04, .22, .46, .34, .12, 0);
    shell(.7, .22, .04, 0, .12, -.22);
    shell(.7, .07, .04, 0, .055, .22);
    const rim = glossy('#f4fbff', .16);
    for (const [w, d, x, z] of [[.74, .05, 0, -.24], [.74, .05, 0, .24], [.05, .5, -.36, 0], [.05, .5, .36, 0]] as const) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, .035, d), rim);
      mesh.position.set(x, .22, z); tub.add(mesh);
    }
    return tub;
  }
  private makeWater() {
    const material = new THREE.MeshPhysicalNodeMaterial({
      color: '#8fd4ff', roughness: .08, metalness: 0, transmission: 0,
      transparent: true, opacity: .62, clearcoat: 1, clearcoatRoughness: .04,
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
    faucet.position.set(0, .2, -.18);
    const metal = glossy('#f7fbff', .12);
    metal.metalness = .55;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.018, .02, .1, 12), metal);
    neck.position.y = .04;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .1, 12), metal);
    spout.rotation.x = Math.PI / 2; spout.position.set(0, .08, .05);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(.034, 16, 12), glossy('#ffd0e0', .28));
    handle.position.set(.07, .09, .01);
    faucet.add(neck, spout, handle);
    return faucet;
  }
  private makeStream() {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(.012, .02, .16, 10),
      new THREE.MeshStandardMaterial({ color: '#c6ecff', transparent: true, opacity: .55, roughness: .05, depthWrite: false }),
    );
    mesh.position.set(0, -.02, .09);
    mesh.visible = false;
    return mesh;
  }
  private duck(x: number, z: number, phase: number) {
    const group = new THREE.Group();
    const yellow = glossy('#ffe14a', .38);
    const body = new THREE.Mesh(new THREE.SphereGeometry(.046, 16, 12), yellow);
    body.scale.set(1.2, .82, 1.28);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.028, 14, 10), yellow);
    head.position.set(0, .032, .028);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(.012, .03, 8), glossy('#ff8a3d', .4));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, .03, .055);
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#243042', roughness: .3 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(.006, 8, 6), eyeMat);
    const eyeR = eyeL.clone();
    eyeL.position.set(-.012, .04, .046); eyeR.position.set(.012, .04, .046);
    group.add(body, head, beak, eyeL, eyeR);
    const duck: BathDuck = { group, homeX: x, homeZ: z, x, z, vx: 0, vz: 0, phase };
    this.placeDuck(duck);
    this.group.add(group);
    return duck;
  }
  placeDuck(duck: BathDuck) {
    duck.group.position.set(duck.x, this.level + .02, duck.z);
    duck.group.rotation.z = Math.sin(duck.phase) * .08;
  }
  private bubble(index: number) {
    const radius = .028 + (index % 3) * .008;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 14, 10),
      new THREE.MeshStandardMaterial({
        color: '#eaf8ff', emissive: '#d7f2ff', emissiveIntensity: .25,
        transparent: true, opacity: .42, roughness: .05, depthWrite: false,
      }),
    );
    const bubble: BathBubble = {
      mesh, alive: true, x: 0, y: 0, z: 0, radius, speed: .035 + (index % 4) * .008, wait: 0, phase: index * .7,
    };
    this.respawn(bubble, index / 8);
    this.group.add(mesh);
    return bubble;
  }
  private makeSponge() {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.09, .035, .055), glossy('#ffb7c8', .72));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(.09, .012, .055), glossy('#fff0b0', .6));
    stripe.position.y = .008;
    group.add(mesh, stripe);
    const homeX = .2, homeZ = -.04;
    group.position.set(homeX, TUB.restLevel + .045, homeZ);
    this.group.add(group);
    return { group, homeX, homeZ };
  }
  private makeCup() {
    const cup = new THREE.Group();
    const mat = glossy('#c8f0d8', .3);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(.03, .026, .05, 14, 1, true), mat);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(.025, 12), mat);
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -.024;
    cup.add(wall, bottom);
    cup.position.set(-.2, .25, -.02);
    return cup;
  }
  private makeWand() {
    const wand = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .12, 8), glossy('#ffffff', .3));
    stick.rotation.z = .4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.022, .004, 8, 16), glossy('#9ad0ff', .25));
    ring.position.set(.04, .05, 0);
    wand.add(stick, ring);
    wand.position.set(.22, .24, .08);
    return wand;
  }
}

function tileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const colors = ['#f7d7e8', '#d8f3ea', '#fff0cc', '#d5ecff'];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = colors[(x + y * 2) % colors.length];
    g.fillRect(x * 64, y * 64, 64, 64);
    g.fillStyle = '#ffffffaa';
    g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
