import assert from 'node:assert/strict';
import { applyBathForces, containInTub, placeInTub, TUB } from '../src/app/bath/forces.ts';
import { PHYS } from '../src/physics/constants.js';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';

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
console.log('Bath float and faucet push.');
