import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BoxGeometry, Mesh, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { Input } from '../src/app/input.ts';
import { Locomotion } from '../src/app/locomotion.ts';
import { PHYS } from '../src/physics/constants.js';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';

const width=1280,height=800;
const css=readFileSync(new globalThis.URL('../src/style.css',import.meta.url),'utf8');
const markup=readFileSync(new globalThis.URL('../src/main.ts',import.meta.url),'utf8');
const runtime=readFileSync(new globalThis.URL('../src/app/runtime.ts',import.meta.url),'utf8');
const startup=readFileSync(new globalThis.URL('../src/app/startup-error.ts',import.meta.url),'utf8');
const html=readFileSync(new globalThis.URL('../index.html',import.meta.url),'utf8');
assert.match(css,/#loading\.hidden,#loading\.hidden \*\{pointer-events:none\}/,'hidden loading card cannot keep receiving taps');
assert.match(css,/#retry,#play-retry\{/);
assert.equal((css.match(/#retry\{/g)??[]).length,0,'retry is styled once');
assert.match(markup,/id="play-error"/,'later errors use a toast instead of the full-screen card');
assert.match(markup,/id="error-details"/,'startup errors tuck the stack behind a details toggle');
assert.match(markup,/<summary>Details<\/summary>/);
assert.doesNotMatch(markup,/fatal\.hidden=false/);
const failBody=markup.slice(markup.indexOf('function fail'),markup.indexOf('window.addEventListener'));
const firstLog=failBody.indexOf('console.error');
assert(failBody.indexOf('if(!toast.hidden)return')<firstLog,'a repeated playing error is not logged every frame');
assert(failBody.indexOf('if(failed)return')<failBody.indexOf('console.error',firstLog+1),'a repeated startup error is not logged every frame');
assert.match(runtime,/__jellyQC/);
assert.match(runtime,/get\('qc'\) === '1'/);
assert.match(startup,/This game needs a browser with WebGPU/);
assert.match(html,/Jelly Soup: Bath Time/);
assert.match(runtime,/bath\.faucet/);
assert.match(runtime,/bath\.ducks/);
assert.match(runtime,/bath\.bubbles/);
assert.match(runtime,/onTapJelly/);
assert.match(runtime,/querySelector\('#sound'\)!\.addEventListener\('click'/);
assert.match(runtime,/querySelector\('#reset'\)!\.addEventListener\('click'/);
assert(markup.indexOf('class="actions"')>markup.indexOf('id="viewport"'),'sound, reset, and flavor sit above the canvas');
assert.doesNotMatch(css,/\.actions\{[^}]*pointer-events:\s*none/);
assert.match(css,/\.icon-button\{[^}]*min-width:64px[^}]*min-height:64px/);
assert.doesNotMatch(markup,/lighting-mode|data-joystick|touch-controls/);

class FakeElement extends globalThis.EventTarget {
  constructor(){super();this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};}
  setPointerCapture(){}
  releasePointerCapture(){}
  hasPointerCapture(){return false;}
  getBoundingClientRect(){return {left:0,top:0,width:128,height:128,right:128,bottom:128};}
  querySelector(){return null;}
}

const document=new globalThis.EventTarget();
const windowTarget=new globalThis.EventTarget();
const canvas=new FakeElement();
canvas.clientWidth=width;canvas.clientHeight=height;canvas.ownerDocument=document;canvas.getRootNode=()=>document;
canvas.getBoundingClientRect=()=>({left:0,top:0,width,height,right:width,bottom:height});
document.querySelector=()=>null;
document.querySelectorAll=()=>[];
globalThis.document=document;
globalThis.window=windowTarget;

const body=new SoftBody(loadModel());
for(let i=0;i<40;i++)body.step(PHYS.step);
body.updateSurface();
const camera=new PerspectiveCamera(36,width/height,.02,12);
camera.position.set(.16,.46,.52);
camera.lookAt(0,.08,0);
camera.updateMatrixWorld(true);
const rig=new Locomotion(body);
const input=new Input(camera,canvas,body,new Mesh(body.surface.geometry),rig,{unlock:async()=>{}});
const hits={faucet:0,duck:0,bubble:0,jelly:0,ground:0,sponge:0};
let spongeMoves=0;
function toy(name,x,y,z,extra={}) {
  const mesh=new Mesh(new BoxGeometry(.06,.06,.06));
  mesh.position.set(x,y,z);mesh.updateMatrixWorld(true);
  const center=new Vector3(x,y,z);
  input.toyTaps.push({center,radius:.05,object:mesh,use:()=>{hits[name]++;},...extra});
  return {mesh,center};
}
toy('faucet',0,.22,-.12);
toy('duck',.18,.12,.06);
toy('bubble',-.18,.18,0);
toy('sponge',.2,.12,-.08,{drag:(phase,point)=>{if(phase==='move')spongeMoves++;hits.sponge=point.x;}});

function pointer(type,x,y,extra={}) {
  const event=new globalThis.Event(type,{bubbles:true,cancelable:true});
  let stopped=0;
  const original=event.stopImmediatePropagation.bind(event);
  event.stopImmediatePropagation=()=>{stopped++;original();};
  Object.assign(event,{
    clientX:x,clientY:y,pageX:x,pageY:y,button:0,buttons:type==='pointerup'?0:1,
    pointerId:1,pointerType:'mouse',stopped:()=>stopped,
    ...extra,
  });
  return event;
}
function project(x,y,z) {
  camera.updateMatrixWorld(true);
  const p=new Vector3(x,y,z).project(camera);
  assert(p.z>-.2&&p.z<1,`${x},${y},${z} is in front of the camera`);
  return {x:(p.x+1)*.5*width,y:(1-p.y)*.5*height};
}
function tap(x,y) {
  const down=pointer('pointerdown',x,y);
  canvas.dispatchEvent(down);
  assert.equal(down.stopped(),0,'pointerdown does not swallow the drag');
  windowTarget.dispatchEvent(pointer('pointerup',x,y));
}
function frontPixel() {
  const p=body.surface.positions;let best=0,bestZ=-Infinity;
  for(let i=0;i<p.length;i+=3)if(p[i+2]>bestZ){bestZ=p[i+2];best=i;}
  return project(p[best],p[best+1],p[best+2]);
}
function releaseGrab() {
  for(let i=0;i<8;i++){input.step(PHYS.step);body.step(PHYS.step);input.afterPhysicsStep();}
  body.updateSurface();
}

{
  const pixel=project(0,.22,-.12);
  tap(pixel.x,pixel.y);
  assert.equal(hits.faucet,1,'tapping the faucet hits the faucet');
  assert.equal(hits.duck,0);
  assert.equal(hits.bubble,0);
}
{
  const pixel=project(.18,.12,.06);
  tap(pixel.x,pixel.y);
  assert.equal(hits.duck,1,'tapping a duck hits the duck');
}
{
  const pixel=project(-.18,.18,0);
  tap(pixel.x,pixel.y);
  assert.equal(hits.bubble,1,'tapping a bubble hits the bubble');
}
{
  input.onTapJelly=()=>{hits.jelly++;};
  const pixel=frontPixel();
  const down=pointer('pointerdown',pixel.x,pixel.y);
  canvas.dispatchEvent(down);
  assert.equal(down.stopped(),0,'a jelly press does not cancel pointerdown');
  assert.equal(body.grabs.length,1,'tapping the jelly grabs it');
  assert.equal(input.hold(),'jelly');
  windowTarget.dispatchEvent(pointer('pointerup',pixel.x,pixel.y));
  releaseGrab();
  assert.equal(hits.jelly,1,'releasing a short jelly tap squishes');
}
{
  input.clear();hits.jelly=0;
  const pixel=frontPixel();
  canvas.dispatchEvent(pointer('pointerdown',pixel.x,pixel.y));
  windowTarget.dispatchEvent(pointer('pointerup',pixel.x,pixel.y));
  releaseGrab();
  assert.equal(hits.jelly,1,'a second jelly tap still squishes');
  assert.equal(hits.faucet,1,'a jelly tap does not toggle the faucet');
}
{
  input.clear();
  const start=camera.position.clone();
  const down=pointer('pointerdown',40,height-30);
  canvas.dispatchEvent(down);
  assert.equal(down.stopped(),0,'a floor press leaves the orbit drag alone');
  document.dispatchEvent(pointer('pointermove',520,height-30));
  windowTarget.dispatchEvent(pointer('pointerup',520,height-30));
  assert.equal(hits.faucet,1,'a camera drag is not a faucet tap');
  assert.equal(hits.duck,1,'a camera drag is not a duck tap');
  assert.equal(hits.bubble,1,'a camera drag is not a bubble tap');
  input.update(1/60);
  assert(camera.position.distanceTo(start)>.005,'dragging the bath orbits the camera');
}
{
  input.clear();
  const pixel=project(.2,.12,-.08);
  const down=pointer('pointerdown',pixel.x,pixel.y);
  canvas.dispatchEvent(down);
  assert.equal(input.controls.enabled,false,'dragging the sponge lets go of the camera');
  assert.equal(input.hold(),'sponge');
  assert.equal(down.stopped(),0,'sponge pointerdown is not cancelled');
  canvas.dispatchEvent(pointer('pointermove',pixel.x+80,pixel.y+10));
  windowTarget.dispatchEvent(pointer('pointerup',pixel.x+80,pixel.y+10));
  assert(spongeMoves>0,'dragging the sponge moves it');
  assert.equal(hits.faucet,1,'a sponge drag does not tap the faucet');
}
{
  input.clear();
  input.onTapGround=()=>{hits.ground++;};
  const down=pointer('pointerdown',40,height-30);
  canvas.dispatchEvent(down);
  windowTarget.dispatchEvent(pointer('pointerup',60,height-30));
  assert.equal(hits.ground,1,'a 20 CSS-pixel wobble still taps');
  hits.ground=0;
  canvas.dispatchEvent(pointer('pointerdown',40,height-30));
  windowTarget.dispatchEvent(pointer('pointerup',72,height-30));
  assert.equal(hits.ground,0,'a 32 CSS-pixel drag is not a tap');
  const clock={t:1000};
  const original=performance.now.bind(performance);
  performance.now=()=>clock.t;
  hits.ground=0;
  canvas.dispatchEvent(pointer('pointerdown',40,height-30));
  clock.t=1550;
  windowTarget.dispatchEvent(pointer('pointerup',40,height-30));
  assert.equal(hits.ground,1,'a 550ms press still taps');
  hits.ground=0;
  clock.t=3000;
  canvas.dispatchEvent(pointer('pointerdown',40,height-30));
  clock.t=3650;
  windowTarget.dispatchEvent(pointer('pointerup',40,height-30));
  assert.equal(hits.ground,0,'a press held past 600ms is not a tap');
  performance.now=original;
}

console.log('Bath taps: faucet, duck, bubble, and jelly.');
