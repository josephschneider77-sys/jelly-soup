import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyBathForces, containInTub, placeInTub, TUB } from '../src/app/bath/forces.ts';
import { Locomotion } from '../src/app/locomotion.ts';
import { Baby } from '../src/graphics/character/baby.ts';
import { PHYS } from '../src/physics/constants.js';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';

const runtime=readFileSync(new globalThis.URL('../src/app/runtime.ts',import.meta.url),'utf8');
assert(runtime.indexOf('new Baby(body)')<runtime.indexOf('placeInTub(body)'),'the face binds before the jelly is moved into the tub');
{
  const posed=new SoftBody(loadModel());
  const baby=new Baby(posed);
  placeInTub(posed);
  baby.update(1/60);
}

const body=new SoftBody(loadModel());
placeInTub(body,.09);
const faucet={on:false,x:0,z:-.1};
let time=0;
for(let i=0;i<720;i++){
  applyBathForces(body,TUB.restLevel,PHYS.step,faucet,time);
  body.step(PHYS.step);
  containInTub(body);
  time+=PHYS.step;
}
body.updateCenter();
assert(body.isFinite(),'floating jelly stays finite');
assert(body.center.y>TUB.floor+.02,`jelly floats above the tub floor (${body.center.y})`);
assert(body.center.y<TUB.restLevel+.06,`jelly stays near the waterline (${body.center.y})`);
let reach=0;
for(let i=0;i<body.mass.length;i++){
  const dx=body.x[i*3]-body.center.x,dy=body.x[i*3+1]-body.center.y,dz=body.x[i*3+2]-body.center.z;
  reach=Math.max(reach,Math.hypot(dx,dy,dz));
}
assert(reach<.12,`soupy body stays together (${reach})`);

const pushed=new SoftBody(loadModel());
placeInTub(pushed,.09);
faucet.on=true;
let z0=pushed.center.z;
for(let i=0;i<240;i++){
  applyBathForces(pushed,TUB.restLevel,PHYS.step,faucet,i*PHYS.step);
  pushed.step(PHYS.step);
  containInTub(pushed);
}
pushed.updateCenter();
assert(pushed.center.z>z0+.01,`faucet stream pushes the jelly (${z0} -> ${pushed.center.z})`);

{
  const air=new SoftBody(loadModel());
  const rig=new Locomotion(air);
  let jumps=0;
  rig.onJump=()=>{jumps++;};
  air.grounded=false;
  rig.jump();
  for(let i=0;i<20;i++){air.grounded=false;rig.step(PHYS.step);}
  assert.equal(jumps,0,'an air tap waits for the floor');
  air.grounded=true;
  rig.step(PHYS.step);
  assert.equal(jumps,1,'an air tap jumps when the jelly lands');
}
{
  const late=new SoftBody(loadModel());
  const rig=new Locomotion(late);
  let jumps=0;
  rig.onJump=()=>{jumps++;};
  late.grounded=false;
  rig.jump();
  for(let i=0;i<60;i++){late.grounded=false;rig.step(PHYS.step);}
  late.grounded=true;
  rig.step(PHYS.step);
  assert.equal(jumps,0,'a jump buffered past 0.2s is dropped');
}
console.log('Bath float and faucet push.');
