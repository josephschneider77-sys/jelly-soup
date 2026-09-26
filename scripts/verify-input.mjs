import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BoxGeometry, Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three/webgpu';
import { FlavorPicker } from '../src/app/flavor-picker.ts';
import { Input } from '../src/app/input.ts';
import { JellySound } from '../src/app/sound.ts';
import { Locomotion } from '../src/app/locomotion.ts';
import { PHYS } from '../src/physics/constants.js';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { SurfaceBVH } from '../src/graphics/optics/refractive-light.js';
import { SWING } from '../src/worlds/main/facilities/swing/physics.ts';
import { TRAMPOLINE } from '../src/worlds/main/facilities/trampoline/physics.ts';
import { BED } from '../src/worlds/main/facilities/bed/physics.ts';

const width=1280,height=800,TOY_SLOP=96;
const css=readFileSync(new globalThis.URL('../src/style.css',import.meta.url),'utf8');
const markup=readFileSync(new globalThis.URL('../src/main.ts',import.meta.url),'utf8');
const runtime=readFileSync(new globalThis.URL('../src/app/runtime.ts',import.meta.url),'utf8');
const startup=readFileSync(new globalThis.URL('../src/app/startup-error.ts',import.meta.url),'utf8');
assert.match(css,/#loading\.hidden,#loading\.hidden \*\{pointer-events:none\}/,'hidden loading card cannot keep receiving taps');
assert.match(css,/#retry,#play-retry\{/);
assert.equal((css.match(/#retry\{/g)??[]).length,0,'retry is styled once');
assert.match(markup,/id="play-error"/,'later errors use a toast instead of the full-screen card');
assert.match(markup,/fatal\.hidden=false/,'startup errors show the detail text');
assert.match(startup,/This game needs a browser with WebGPU/);
assert.match(runtime,/object:swing\.group/);
assert.match(runtime,/owner\?\.id===facility\.id/);
assert.match(runtime,/dismount\(active\)/);
assert(markup.indexOf('class="actions"')>markup.indexOf('id="viewport"'),'sound, reset, and flavor sit above the canvas');
assert.doesNotMatch(css,/\.actions\{[^}]*pointer-events:\s*none/);
assert.match(css,/\.icon-button\{[^}]*min-width:64px[^}]*min-height:64px/);
assert.match(runtime,/querySelector\('#sound'\)!\.addEventListener\('click'/);
assert.match(runtime,/querySelector\('#reset'\)!\.addEventListener\('click'/);

class FakeElement extends globalThis.EventTarget {
  constructor(){super();this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};}
  setPointerCapture(){}
  releasePointerCapture(){}
  hasPointerCapture(){return false;}
  getBoundingClientRect(){return {left:0,top:0,width:128,height:128,right:128,bottom:128};}
  querySelector(){return this.knob??null;}
}

const document=new globalThis.EventTarget();
const windowTarget=new globalThis.EventTarget();
const canvas=new FakeElement();
canvas.clientWidth=width;canvas.clientHeight=height;canvas.ownerDocument=document;canvas.getRootNode=()=>document;
canvas.getBoundingClientRect=()=>({left:0,top:0,width,height,right:width,bottom:height});
const joystick=new FakeElement();
const knob=new FakeElement();
joystick.knob=knob;
const jump=new FakeElement();
jump.dataset.control='Space';
const query={
  '[data-joystick]':joystick,
  '.touch-controls .jump':jump,
};
document.querySelector=selector=>query[selector]??null;
document.querySelectorAll=selector=>selector==='[data-control]'?[jump]:[];
globalThis.document=document;
globalThis.window=windowTarget;
windowTarget.addEventListener('blur',()=>{});

const body=new SoftBody(loadModel());
for(let i=0;i<40;i++)body.step(PHYS.step);
body.updateSurface();
const camera=new PerspectiveCamera(36,width/height,.001,40);
camera.position.set(.111,.170,.256);
camera.lookAt(body.center);
camera.fov=2*Math.atan(Math.tan(18*Math.PI/180)*Math.max(1,.85/camera.aspect))*180/Math.PI;
camera.setViewOffset(width,height,0,height*(width<700?.075:.025),width,height);
camera.updateProjectionMatrix();
const rig=new Locomotion(body);
const summons=[],dismounts=[],riding=new Set();
const input=new Input(camera,canvas,body,new Mesh(body.surface.geometry),rig,{unlock:async()=>{}});
let groundTaps=0,jellyTaps=0;
input.bodyControlled=()=>riding.size>0;
input.onTapGround=()=>{
  if(riding.size){dismounts.push('floor');riding.clear();return;}
  groundTaps++;
};
input.onTapJelly=()=>{jellyTaps++;};
function toyMesh(center) {
  const mesh=new Mesh(new BoxGeometry(.04,.04,.04));
  mesh.position.copy(center);mesh.updateMatrixWorld(true);return mesh;
}
const toyMeshes=new Map();
for(const [name,center] of [
  ['swing',new Vector3(SWING.x,.09,SWING.z)],
  ['trampoline',new Vector3(TRAMPOLINE.x,.05,TRAMPOLINE.z)],
  ['bed',new Vector3(BED.x,.05,BED.z)],
]) {
  const object=toyMesh(center);
  toyMeshes.set(name,object);
  input.toyTaps.push({center,radius:.14,object,use:()=>{
    if(riding.has(name)){riding.delete(name);dismounts.push(name);return;}
    if(riding.size)return;
    riding.add(name);summons.push(name);
  }});
}

function pointer(type,x,y,extra={}) {
  const event=new globalThis.Event(type,{bubbles:true,cancelable:true});
  Object.assign(event,{
    clientX:x,clientY:y,pageX:x,pageY:y,button:0,buttons:type==='pointerup'?0:1,
    pointerId:1,pointerType:'mouse',
    ...extra,
  });
  return event;
}
function flush(){return new Promise(resolve=>globalThis.queueMicrotask(resolve));}
function frontPixel() {
  const p=body.surface.positions;let best=0,bestZ=-Infinity;
  for(let i=0;i<p.length;i+=3)if(p[i+2]>bestZ){bestZ=p[i+2];best=i;}
  const point=new Vector3(p[best],p[best+1],p[best+2]).project(camera);
  return {x:(point.x+1)*.5*width,y:(1-point.y)*.5*height};
}
function releaseGrab() {
  for(let i=0;i<8;i++){input.step(PHYS.step);body.step(PHYS.step);input.afterPhysicsStep();}
}
function resetCounts(){groundTaps=0;jellyTaps=0;summons.length=0;dismounts.length=0;riding.clear();}
const homePos=camera.position.clone(),homeTarget=input.controls.target.clone();
function resetView() {
  camera.position.copy(homePos);input.controls.target.copy(homeTarget);
  camera.lookAt(homeTarget);camera.updateMatrixWorld(true);input.controls.update();camera.updateMatrixWorld(true);
}
function releasePointer(x,y,extra={}) {
  windowTarget.dispatchEvent(pointer('pointerup',x,y,extra));
  document.dispatchEvent(pointer('pointerup',x,y,extra));
}

{
  resetCounts();resetView();
  const pixel=frontPixel();
  canvas.dispatchEvent(pointer('pointerdown',pixel.x,pixel.y));
  assert.equal(body.grabs.length,1,'tapping the jelly grabs it instead of a toy');
  assert.equal(summons.length,0,'a jelly tap is not a swing, trampoline, or bed summon');
  windowTarget.dispatchEvent(pointer('pointerup',pixel.x,pixel.y));
  releaseGrab();
  assert.equal(jellyTaps,1,'releasing a short jelly tap squishes');
  assert.equal(groundTaps,0,'a jelly tap does not also hop');
  input.clear();
}

{
  resetCounts();resetView();
  const start=camera.position.clone();
  canvas.dispatchEvent(pointer('pointerdown',40,height-30));
  document.dispatchEvent(pointer('pointermove',520,height-30));
  const dragged=camera.position.distanceTo(start);
  releasePointer(520,height-30);
  await flush();
  assert(dragged>.005,'a mouse drag orbits instead of being swallowed');
  assert(camera.position.distanceTo(start)>.005,'the orbit remains after the pointer is released');
  assert.equal(summons.length,0,'a drag does not summon a toy');
  assert.equal(groundTaps,0,'a drag is not a hop');
  assert.equal(jellyTaps,0,'a drag on empty table is not a squish');
  input.clear();
}

{
  resetCounts();resetView();
  const start=camera.position.clone();
  canvas.dispatchEvent(pointer('pointerdown',48,height-36,{pointerType:'touch'}));
  document.dispatchEvent(pointer('pointermove',520,height-36,{pointerType:'touch'}));
  releasePointer(520,height-36,{pointerType:'touch',buttons:0});
  await flush();
  assert(camera.position.distanceTo(start)>.005,'a touch drag orbits');
  assert.equal(summons.length,0,'a touch drag does not summon a toy');
  assert.equal(groundTaps,0,'a touch drag is not a hop');
  input.clear();
}

{
  resetCounts();resetView();
  const raycaster=new Raycaster();
  const bvh=new SurfaceBVH(body.surface);bvh.refit();
  const spheres=[[new Vector3(SWING.x,.09,SWING.z),.12],[new Vector3(TRAMPOLINE.x,.05,TRAMPOLINE.z),.13],[new Vector3(BED.x,.05,BED.z),.14]];
  const toyScreens=spheres.map(([center])=>{
    const projected=center.clone().project(camera);
    return {x:(projected.x+1)*.5*width,y:(1-projected.y)*.5*height,z:projected.z};
  });
  const onToyScreen=(x,y)=>toyScreens.some(toy=>toy.z>=-1&&toy.z<=1&&Math.hypot(toy.x-x,toy.y-y)<=TOY_SLOP);
  let covered=0,samples=0,swallowed=null;
  for(let y=40;y<height;y+=40)for(let x=40;x<width;x+=40){
    samples++;
    raycaster.setFromCamera(new Vector2(x/width*2-1,-(y/height)*2+1),camera);
    const ray=raycaster.ray;
    let along=Infinity;
    for(const [center,radius] of spheres){
      const depth=center.clone().sub(ray.origin).dot(ray.direction);
      if(depth<=0||ray.distanceToPoint(center)>radius)continue;
      if(depth<along)along=depth;
    }
    if(!Number.isFinite(along))continue;
    covered++;
    const meshHit=bvh.hit([ray.origin.x,ray.origin.y,ray.origin.z],[ray.direction.x,ray.direction.y,ray.direction.z]);
    const hitsToy=[...toyMeshes.values()].some(mesh=>{mesh.updateWorldMatrix(true,true);return raycaster.intersectObject(mesh,true).length>0;});
    if((!meshHit||meshHit.distance>=along-.01)&&!onToyScreen(x,y)&&!hitsToy&&!swallowed)swallowed={x,y};
  }
  assert(covered/samples>.5,'world-space toy spheres cover most of the starting view');
  assert(swallowed,'the old picker would swallow a tap that is not on the jelly');
  canvas.dispatchEvent(pointer('pointerdown',swallowed.x,swallowed.y));
  releasePointer(swallowed.x,swallowed.y);
  await flush();
  assert.equal(summons.length,0,`a tap inside an old toy sphere no longer summons when the toy is off the cursor (${swallowed.x},${swallowed.y} -> ${summons.join(',')})`);
  if(body.grabs.length)releaseGrab();
  assert(groundTaps+jellyTaps===1,'that tap still hops or squishes');
  input.clear();
}

{
  resetCounts();resetView();
  let stopped=0;
  const down=pointer('pointerdown',40,height-30);
  down.stopImmediatePropagation=()=>{stopped++;};
  canvas.dispatchEvent(down);
  assert.equal(stopped,0,'a floor press is not cancelled, so a drag can orbit');
  releasePointer(48,height-24);
  await flush();
  assert.equal(groundTaps,1,'a short tap on the table hops');
  assert.equal(jellyTaps,0);
  assert.equal(summons.length,0,'a table tap does not summon a toy');
  input.clear();
}

{
  resetCounts();resetView();
  const swing=new Vector3(SWING.x,.09,SWING.z).project(camera);
  const sx=(swing.x+1)*.5*width,sy=(1-swing.y)*.5*height;
  const x0=Math.min(width-1,Math.max(0,sx)),y0=Math.min(height-1,Math.max(0,sy));
  const start=camera.position.clone();
  canvas.dispatchEvent(pointer('pointerdown',x0,y0));
  document.dispatchEvent(pointer('pointermove',x0+240,y0+80));
  releasePointer(x0+240,y0+80);
  await flush();
  assert(camera.position.distanceTo(start)>.005,'a drag that starts on the swing still orbits');
  assert.equal(summons.length,0,'dragging across a toy does not summon it');
  input.clear();
}

{
  resetCounts();resetView();
  const swing=new Vector3(SWING.x,.09,SWING.z).project(camera);
  const x=(swing.x+1)*.5*width,y=(1-swing.y)*.5*height;
  assert(x>=-TOY_SLOP&&x<=width+TOY_SLOP&&y>=-TOY_SLOP&&y<=height+TOY_SLOP,'swing is tappable from the starting view');
  const sx=Math.min(width-1,Math.max(0,x)),sy=Math.min(height-1,Math.max(0,y));
  canvas.dispatchEvent(pointer('pointerdown',sx,sy));
  releasePointer(sx,sy);
  await flush();
  assert.deepEqual(summons,['swing'],'tapping the swing mesh summons it');
  assert.equal(jellyTaps,0);
  assert.equal(groundTaps,0);
  input.clear();
}

{
  resetCounts();resetView();
  const swing=new Vector3(SWING.x,.09,SWING.z).project(camera);
  const sx=Math.min(width-1,Math.max(0,(swing.x+1)*.5*width));
  const sy=Math.min(height-1,Math.max(0,(1-swing.y)*.5*height));
  const tap=(x,y)=>{canvas.dispatchEvent(pointer('pointerdown',x,y));releasePointer(x,y);};
  tap(sx,sy);
  await flush();
  assert.equal(riding.has('swing'),true,'the swing tap mounted');
  const pixel=frontPixel();
  tap(pixel.x,pixel.y);
  await flush();
  assert.equal(jellyTaps,1,'tapping the jelly while it is on a toy still squishes');
  assert.equal(body.grabs.length,0,'riding does not start a stretch grab');
  assert.deepEqual(summons,['swing']);
  tap(40,height-30);
  await flush();
  assert.deepEqual(dismounts,['floor'],'tapping the floor gets off the toy');
  tap(sx,sy);await flush();
  tap(sx,sy);await flush();
  assert.deepEqual(dismounts,['floor','swing'],'tapping the same toy again gets off');
  input.clear();
}

{
  resetCounts();
  jump.dispatchEvent(pointer('pointerdown',20,20));
  assert.equal(groundTaps,1,'the hop button hops');
  assert.equal(summons.length,0);
  input.clear();
}

{
  rig.move.set(0,0,0);
  joystick.dispatchEvent(pointer('pointerdown',64,64));
  joystick.dispatchEvent(pointer('pointermove',64,20));
  input.step(PHYS.step);
  assert(rig.move.lengthSq()>.2,'the joystick moves the jelly');
  joystick.dispatchEvent(pointer('pointerup',64,20,{buttons:0}));
  input.clear();
}

class DomNode extends globalThis.EventTarget {
  constructor(id=''){super();this.id=id;this.dataset={};this.hidden=false;this.children=[];this.attributes=new Map();this.classList={add(){},remove(){},toggle(){}};}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  append(...kids){for(const kid of kids)this.children.push(kid);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  querySelectorAll(selector){
    const hits=[];
    const visit=node=>{
      if(node.id&&selector===`#${node.id}`)hits.push(node);
      if(selector==='[data-flavor]'&&node.dataset.flavor)hits.push(node);
      for(const child of node.children)visit(child);
    };
    for(const child of this.children)visit(child);
    return hits;
  }
  focus(){}
  blur(){}
}
const pickerRoot=new DomNode('flavor-picker');
const flavorButton=new DomNode('flavor');
const flavorMenu=new DomNode('flavor-menu');
flavorMenu.hidden=true;
const lemon=new DomNode();
lemon.dataset.flavor='lemon';
flavorMenu.append(lemon);
pickerRoot.append(flavorButton,flavorMenu);
query['#flavor-picker']=pickerRoot;
const picked=[];
const flavors=new FlavorPicker(name=>picked.push(name));
flavorButton.dispatchEvent(new globalThis.Event('click'));
assert.equal(flavorMenu.hidden,false,'the flavor button opens the color blobs');
lemon.dispatchEvent(new globalThis.Event('click'));
assert.deepEqual(picked,['lemon'],'tapping a flavor blob changes the jelly');
assert.equal(flavorButton.getAttribute('aria-pressed'),null);
assert.equal(lemon.getAttribute('aria-pressed'),'true');
flavors.dispose();

const sound=new JellySound();
const soundButton=new DomNode('sound');
query['#sound']=soundButton;
soundButton.addEventListener('click',event=>{
  const muted=sound.toggle(),button=document.querySelector('#sound');
  button.setAttribute('aria-pressed',String(muted));
  button.setAttribute('aria-label',muted?'Enable sound':'Mute sound');
  button.classList.toggle('muted',muted);void sound.unlock().catch(()=>{});
  if(event.detail>0)event.currentTarget.blur();
});
soundButton.dispatchEvent(new globalThis.Event('click'));
assert.equal(sound.muted,true,'the sound button toggles mute');
assert.equal(soundButton.getAttribute('aria-pressed'),'true');
let resets=0;
const resetButton=new DomNode('reset');
resetButton.addEventListener('click',()=>{resets++;input.recenter();});
resetButton.dispatchEvent(new globalThis.Event('click'));
assert.equal(resets,1,'the reset button runs the recenter');
sound.dispose();

input.dispose();
console.log('Input: jelly tap, table hop, toy tap, mouse drag, touch drag, hop button, joystick, and HUD buttons passed.');
