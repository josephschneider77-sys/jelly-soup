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
    ['faucet',.05,.24,-.18],
    ['spout',0,.15,-.12],
    ['duck-left',DUCK_HOME[0][0],.13,DUCK_HOME[0][1]],
    ['duck-right',DUCK_HOME[1][0],.13,DUCK_HOME[1][1]],
    ['duck-back',DUCK_HOME[2][0],.13,DUCK_HOME[2][1]],
    ['wand',-.1,.24,-.19],
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
  assert.match(bath,/speed: \.01/);
  assert.doesNotMatch(input,/follow\.lerp/);
  assert.match(input,/controls\.target\.copy\(this\.anchor\)/);
  assert.match(runtime,/containInTub\(body, roamX\)/);
  assert.match(input,/padded:false/);
  assert.match(runtime,/yieldsToToys: true/);
  assert.match(bath,/opacityNode/);
  assert.match(bath,/float\(\.7\)/);
  assert.match(bath,/handle\.rotation\.y/);
  assert.match(bath,/splashRing\.visible = on/);
  assert.match(runtime,/faucetTip/);
  assert.match(runtime,/label: 'wand'/);
  assert.match(runtime,/bath\.blow\(\)/);
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
{
  globalThis.document={createElement(){return {width:256,height:256,getContext(){return {fillRect(){},fillStyle:''};}};}};
  const {Bathroom}=await import('../src/app/bath/bathroom.ts');
  const bath=new Bathroom();
  const projectBounds=(camera,root)=>{
    root.updateWorldMatrix(true,true);
    const point=new Vector3();
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,count=0;
    root.traverse(obj=>{
      if(!obj.isMesh||obj.visible===false)return;
      const pos=obj.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        point.fromBufferAttribute(pos,i).applyMatrix4(obj.matrixWorld).project(camera);
        minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);
        minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
        count++;
      }
    });
    assert(count>0,'the prop has a visible mesh');
    return {minX,minY,maxX,maxY};
  };
  const overlaps=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minY<b.maxY&&a.maxY>b.minY;
  const cameras=[[390,844],[1024,768],[1280,800]].map(([w,h])=>{
    const frame=bathFrame(w/h);
    const camera=new PerspectiveCamera(frame.fov,w/h,.02,12);
    camera.position.set(frame.x,frame.y,frame.z);
    camera.lookAt(frame.lookX,frame.lookY,frame.lookZ);
    camera.updateMatrixWorld(true);
    return {w,h,camera};
  });
  const assertClear=(label)=>{
    for(const {w,h,camera} of cameras){
      const wand=projectBounds(camera,bath.wand);
      const faucet=projectBounds(camera,bath.faucet);
      assert(!overlaps(wand,faucet),`${label}: wand and faucet stay apart at ${w}x${h}`);
      assert(wand.minX>-.9&&wand.maxX<.9&&wand.minY>-.92&&wand.maxY<.92,`the wand stays on screen at ${w}x${h}`);
    }
  };
  let ring=null;
  bath.wand.traverse(obj=>{if(obj.name==='wand-ring')ring=obj;});
  {
    const phone=cameras.find(entry=>entry.w===390);
    const box=projectBounds(phone.camera,ring);
    const width=(box.maxX-box.minX)/2*390,height=(box.maxY-box.minY)/2*844;
    assert(Math.min(width,height)/Math.max(width,height)>.75,`the wand ring faces the phone (${width.toFixed(0)}x${height.toFixed(0)})`);
  }
  assertClear('resting');
  bath.setFaucet(true);
  bath.update(1/60,0);
  assertClear('water running');
  let splash=null;
  bath.faucet.traverse(obj=>{if(obj.name==='faucet-splash')splash=obj;});
  for(const {w,h,camera} of cameras){
    assert(!overlaps(projectBounds(camera,bath.ducks[2].group),projectBounds(camera,splash)),`the duck stays off the splash at ${w}x${h}`);
  }
  const restLean=bath.wand.rotation.x;
  bath.wand.rotation.x=restLean+.21;
  assertClear('wand waved forward');
  bath.wand.rotation.x=restLean-.21;
  assertClear('wand waved back');
  bath.wand.rotation.x=restLean;
  let grip=null;
  bath.wand.traverse(obj=>{if(obj.name==='wand-grip')grip=obj;});
  grip.updateWorldMatrix(true,true);
  const corner=new Vector3();
  let gripMinY=Infinity,gripMinZ=Infinity,gripMaxZ=-Infinity;
  const gripPos=grip.geometry.attributes.position;
  for(let i=0;i<gripPos.count;i++){
    corner.fromBufferAttribute(gripPos,i).applyMatrix4(grip.matrixWorld);
    gripMinY=Math.min(gripMinY,corner.y);
    gripMinZ=Math.min(gripMinZ,corner.z);
    gripMaxZ=Math.max(gripMaxZ,corner.z);
  }
  assert(Math.abs(gripMinY-.185)<.012,`the wand grip sits on the tub rim (${gripMinY.toFixed(3)})`);
  assert(gripMinZ<-.21&&gripMaxZ>-.27,`the wand grip is on the back rim (${gripMinZ.toFixed(3)} to ${gripMaxZ.toFixed(3)})`);
  bath.blow();
  const burst=bath.bubbles.filter(bubble=>bubble.burst);
  assert.equal(burst.length,6,'the wand blows six bubbles');
  assert(burst.every(bubble=>bubble.alive&&bubble.mesh.visible),'all six wand bubbles are visible');
  for(let step=0;step<180;step++)bath.update(1/60,step/60);
  assert(burst.every(bubble=>bubble.alive&&bubble.mesh.visible),'wand bubbles last at least three seconds');
}
console.log('Bath float and faucet push.');
