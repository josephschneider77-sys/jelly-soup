import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { bathFrame, CUP_HOME, DUCK_HOME, screenHalfX, SPONGE_HOME } from '../src/app/bath/layout.ts';
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
let z0=pushed.center.z,x0=pushed.center.x;
for(let i=0;i<240;i++){
  applyBathForces(pushed,TUB.restLevel,PHYS.step,faucet,i*PHYS.step);
  pushed.step(PHYS.step);
  containInTub(pushed);
}
pushed.updateCenter();
assert(pushed.center.x>x0+.01,`faucet stream pushes the jelly sideways (${x0} -> ${pushed.center.x})`);
assert(pushed.center.z<z0+.005,`faucet stream does not drive the jelly into the front wall (${pushed.center.z})`);

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
{
  const points=[
    ['jelly',0,.12,0],
    ['cup',CUP_HOME.x,.16,CUP_HOME.z],
    ['sponge',SPONGE_HOME.x,.15,SPONGE_HOME.z],
    ['faucet',0,.28,-.16],
    ['duck-left',DUCK_HOME[0][0],.13,DUCK_HOME[0][1]],
    ['duck-right',DUCK_HOME[1][0],.13,DUCK_HOME[1][1]],
    ['duck-back',DUCK_HOME[2][0],.13,DUCK_HOME[2][1]],
    ['wand',.05,.2,-.11],
  ];
  const wide=bathFrame(1280/800);
  assert(Math.abs(wide.fov-36.9)<1,'a wide screen keeps the three-quarter field of view');
  assert(wide.y===.7&&wide.z===.82,'a wide screen keeps the home camera');
  const phoneFrame=bathFrame(390/844);
  assert(phoneFrame.z<.5&&phoneFrame.y<.95,'a phone moves the camera in over the tub');
  const project=(camera,x,y,z)=>new Vector3(x,y,z).project(camera);
  for(const [w,h] of [[1280,800],[390,844],[1024,768],[768,1024]]){
    const frame=bathFrame(w/h);
    const camera=new PerspectiveCamera(frame.fov,w/h,.02,12);
    camera.position.set(frame.x,frame.y,frame.z);
    camera.lookAt(frame.lookX,frame.lookY,frame.lookZ);
    camera.updateMatrixWorld(true);
    for(const [name,x,y,z] of points){
      const ndc=project(camera,x,y,z);
      assert(Math.abs(ndc.x)<.9&&Math.abs(ndc.y)<.92&&ndc.z>0&&ndc.z<1,`${name} stays on screen at ${w}x${h} (${ndc.x.toFixed(2)},${ndc.y.toFixed(2)})`);
    }
    const lip=project(camera,0,.06,.22);
    const jelly=project(camera,0,.12,0);
    assert(lip.y<jelly.y-.15,`the front lip sits below the jelly at ${w}x${h} (lip ${lip.y.toFixed(2)}, jelly ${jelly.y.toFixed(2)})`);
    const left=project(camera,-.025,.12,0),right=project(camera,.025,.12,0);
    const fiveCm=Math.abs(left.x-right.x)/2*w;
    assert(fiveCm>=50,`a 5 cm toy is at least 50 px at ${w}x${h} (${fiveCm.toFixed(0)} px)`);
    if(w===390&&h===844){
      const water=Math.abs(project(camera,0,.108,.16).y-project(camera,0,.108,-.16).y);
      const tub=Math.abs(project(camera,0,.05,.22).y-project(camera,0,.28,-.2).y);
      assert(water>=.7,`the water fills the phone (${(water/2*100).toFixed(0)}% of the height)`);
      assert(tub>=1.3,`the tub fills most of the phone (${(tub/2*100).toFixed(0)}% of the height)`);
      assert(fiveCm>=58,`phone toys are big enough to tap (${fiveCm.toFixed(0)} px)`);
    }
  }
}
{
  const bath=readFileSync(new globalThis.URL('../src/app/bath/bathroom.ts',import.meta.url),'utf8');
  const input=readFileSync(new globalThis.URL('../src/app/input.ts',import.meta.url),'utf8');
  assert.match(runtime,/label: 'sponge', yieldsToJelly: true/);
  assert.match(runtime,/bath\.pour\(\)/);
  assert.match(runtime,/releaseSponge\(\)/);
  assert.match(runtime,/hold\(\) === 'sponge'/);
  assert.match(runtime,/distanceTo\(body\.center\) > \.11/);
  assert.match(runtime,/captureHome\(\)/);
  assert.match(bath,/cup\.rotation\.z = -tilt/);
  assert.match(bath,/cupStream\.visible/);
  assert.match(bath,/speed: \.008/);
  assert.doesNotMatch(input,/follow\.lerp/);
  assert.match(input,/controls\.target\.copy\(this\.anchor\)/);
  assert.match(runtime,/containInTub\(body, roamX\)/);
  assert.match(input,/padded:false/);
  assert.match(runtime,/yieldsToToys: true/);
  assert.match(bath,/opacityNode/);
  assert.match(bath,/float\(\.45\)/);
}
{
  for(const [w,h] of [[390,844],[1024,768],[1280,800]]){
    const half=screenHalfX(w/h);
    const frame=bathFrame(w/h);
    const camera=new PerspectiveCamera(frame.fov,w/h,.02,12);
    camera.position.set(frame.x,frame.y,frame.z);
    camera.lookAt(frame.lookX,frame.lookY,frame.lookZ);
    camera.updateMatrixWorld(true);
    for(const z of [-.12,0,.1]){
      for(const x of [-half,half]){
        const ndc=new Vector3(x,TUB.restLevel,z).project(camera);
        assert(Math.abs(ndc.x)<.95&&Math.abs(ndc.y)<.98&&ndc.z>0&&ndc.z<1,`roam bound stays on screen at ${w}x${h} (${ndc.x.toFixed(2)},${ndc.y.toFixed(2)})`);
      }
    }
    assert(half<=TUB.halfX+.0001,`roam stays inside the tub at ${w}x${h}`);
  }
  const phone=screenHalfX(390/844);
  assert(phone<.16,`the phone play width is the visible band (${phone.toFixed(3)})`);
  const held=new SoftBody(loadModel());
  placeInTub(held,.09);
  const push={on:true,x:0,z:-.1};
  for(let i=0;i<1440;i++){
    applyBathForces(held,TUB.restLevel,PHYS.step,push,i*PHYS.step);
    held.step(PHYS.step);
    containInTub(held,phone);
  }
  let maxX=0;
  for(let i=0;i<held.mass.length;i++)maxX=Math.max(maxX,Math.abs(held.x[i*3]));
  assert(maxX<=phone+1e-6,`six seconds of faucet stays inside the phone (${maxX.toFixed(3)} of ${phone.toFixed(3)})`);
}
console.log('Bath float and faucet push.');
