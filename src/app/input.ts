import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SoftBody } from '../physics/soft-body.js';
import type { Locomotion } from './locomotion.ts';
import type { JellySound } from './sound.ts';
import { surfaceGrab, projectGrabTarget, advanceGrabTarget } from '../physics/grab.ts';
import { MAX_GRABS } from '../physics/soft-body-kernel.js';
import { SurfaceBVH } from '../graphics/optics/refractive-light.js';
import { BATH_ORBIT } from './bath/layout.ts';
type PointerGrab={
  grab:NonNullable<ReturnType<typeof surfaceGrab>>;
  pointerType:string;
  plane:THREE.Plane;
  rawTarget:THREE.Vector3;
  releasePending:boolean;
  releaseStepsRemaining:number;
  physicsSteps:number;
  commandVersion:number;
  consumedVersion:number;
  originX:number;
  originY:number;
  originTime:number;
  jellyTap:boolean;
};

export type ToyTap={
  center:THREE.Vector3;
  radius:number;
  use:()=>void;
  object?:THREE.Object3D;
  /** Shown by the qc=1 probe while this toy is held. */
  label?:string;
  /** A real hit on this toy loses to the jelly, and only to the jelly. */
  yieldsToJelly?:boolean;
  /** Drag on a plane through center.y. Pointer-down still reaches OrbitControls. */
  drag?:(phase:'start'|'move'|'end',point:THREE.Vector3)=>void;
};

type PendingTap={id:number;x:number;y:number;t:number};
type PointerPick={kind:'jelly'|'toy'|'floor';toy:ToyTap|null;hit:{t:number;distance:number}|null};

/** A tap is a short press. clientX/clientY are CSS pixels, so this slop is already in CSS px. */
const TAP_PX=24;
const TAP_MS=600;
/** Near misses within this distance still count. A larger sphere used to cover the whole view. */
const TOY_PROXY_RADIUS=.05;
/** Jelly half-width is about 5 cm, so this reaches a few centimetres past the surface. */
const JELLY_NEAR=.1;

export class Input {
  /** While true, taps still land but the body is not grabbed. */
  bodyControlled:()=>boolean=()=>false;
  menuOpen:()=>boolean=()=>false;
  /** Short tap on empty water. The bath splashes; it does not hop. */
  onTapGround:()=>void=()=>{};
  onTapJelly:()=>void=()=>{};
  readonly toyTaps:ToyTap[]=[];
  readonly controls:OrbitControls;
  private toyDrag:{id:number;toy:ToyTap;x:number;y:number;t:number}|null=null;
  private readonly toyPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  private readonly dragPoint=new THREE.Vector3();
  private grabs=new Map<number,PointerGrab>();
  private raycaster=new THREE.Raycaster();
  private grabBVH:SurfaceBVH;
  private pointer=new THREE.Vector2();
  private temp=new THREE.Vector3();
  /** Fixed orbit center. Bath Time pins this to the tub; tests keep the spawn center. */
  private anchor=new THREE.Vector3();
  private idle=0;
  private orbiting=false;
  private readonly homeSpherical=new THREE.Spherical();
  private readonly scratchSpherical=new THREE.Spherical();
  private readonly scratchOffset=new THREE.Vector3();
  private readonly ndc=new THREE.Vector3();
  private pendingTap:PendingTap|null=null;
  private abort=new AbortController();
  private canvas:HTMLCanvasElement;
  readonly camera:THREE.PerspectiveCamera;
  readonly body:SoftBody;
  readonly mesh:THREE.Mesh;
  readonly rig:Locomotion;
  readonly sound:JellySound;
  constructor(camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement,
    body:SoftBody,mesh:THREE.Mesh,rig:Locomotion,sound:JellySound) {
    this.camera=camera;this.body=body;this.mesh=mesh;this.rig=rig;this.sound=sound;
    this.canvas=canvas;this.grabBVH=new SurfaceBVH(body.surface);
    this.controls=new OrbitControls(camera,canvas);
    const c=this.controls;
    c.target.copy(body.center);this.anchor.copy(c.target);
    c.enablePan=false;c.enableDamping=true;c.dampingFactor=.07;
    c.minDistance=BATH_ORBIT.minDistance;c.maxDistance=BATH_ORBIT.maxDistance;
    c.minPolarAngle=BATH_ORBIT.minPolar;c.maxPolarAngle=BATH_ORBIT.maxPolar;
    c.rotateSpeed=.55;c.zoomSpeed=.5;c.update();
    this.captureHome();
    c.addEventListener('start',()=>{this.orbiting=true;this.idle=0;});
    c.addEventListener('end',()=>{this.orbiting=false;this.idle=0;});
    const signal=this.abort.signal;
    canvas.addEventListener('pointerdown',this.begin,{capture:true,signal});
    canvas.addEventListener('pointermove',this.pointerMove,{capture:true,passive:false,signal});
    // Window-level release is deliberate. Pointer capture should deliver these
    // through the canvas, but this closes the failure mode where a browser/OS
    // transition loses that path and leaves a grip wedged forever.
    window.addEventListener('pointerup',this.end,{capture:true,signal});
    window.addEventListener('pointercancel',this.end,{capture:true,signal});
    canvas.addEventListener('lostpointercapture',this.end,{signal});
    window.addEventListener('keydown',this.keyDown,{signal});
    window.addEventListener('blur',this.clear,{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden) this.clear();},{signal});
  }
  private eventRay(e:PointerEvent) {
    const rect=this.canvas.getBoundingClientRect();
    this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    this.camera.updateMatrixWorld();this.raycaster.setFromCamera(this.pointer,this.camera);
  }
  private captureDragTarget(e:PointerEvent,state:PointerGrab) {
    // The final coalesced sample is the newest physical pointer position. Using
    // it also makes very fast high-polling-rate mouse motion deterministic.
    const samples=e.getCoalescedEvents?.()??[];
    const sample=samples.length?samples[samples.length-1]:e;
    this.eventRay(sample);
    if(projectGrabTarget(this.raycaster.ray,state.plane,this.temp)) {
      state.rawTarget.copy(this.temp);state.commandVersion++;return true;
    }
    return false;
  }
  /** Event time, not the time the handler runs. Slow frames must not fail a quick tap. */
  private eventTime(e:{timeStamp?:number}) {
    return typeof e.timeStamp==='number'&&Number.isFinite(e.timeStamp)?e.timeStamp:performance.now();
  }
  private begin=(e:PointerEvent)=>{
    if(this.menuOpen())return;
    if(e.button!==0)return;
    // The mouse reuses one pointer id. A mash arrives while the last grip is still
    // waiting for physics, and that used to drop every tap after the first.
    if(this.grabs.has(e.pointerId)){
      const prev=this.grabs.get(e.pointerId)!;
      if(!prev.releasePending){
        const moved=Math.hypot(e.clientX-prev.originX,e.clientY-prev.originY);
        prev.jellyTap=moved<TAP_PX&&this.eventTime(e)-prev.originTime<TAP_MS;
        prev.releasePending=true;
      }
      this.finishRelease(e.pointerId);
    }
    if(this.toyDrag?.id===e.pointerId){
      this.toyDrag.toy.drag?.('end',this.dragPoint);this.toyDrag=null;
      this.controls.enabled=this.body.grabs.length===0;
    }
    // Never cancel pointerdown. OrbitControls listens on bubble; a capture
    // stopImmediatePropagation here is what made every drag look dead.
    const pick=this.pickPointer(e);
    if(pick.kind==='jelly'&&pick.hit&&!this.bodyControlled()){
      if(!this.canGrab(e))return;
      const ray=this.raycaster.ray,jelly=pick.hit;
      const ix=this.body.surface.indices,offset=jelly.t*3;
      const face={a:ix[offset],b:ix[offset+1],c:ix[offset+2]};
      const point=ray.at(jelly.distance,new THREE.Vector3());
      void this.sound.unlock().catch(()=>{});
      const grab=surfaceGrab(this.body,face,point);if(!grab){this.armTap(e);return;}
      this.body.grabs.push(grab);this.body.wake();
      this.camera.getWorldDirection(this.temp);
      this.grabs.set(e.pointerId,{
        grab,pointerType:e.pointerType,
        plane:new THREE.Plane().setFromNormalAndCoplanarPoint(this.temp,point),rawTarget:point.clone(),
        releasePending:false,releaseStepsRemaining:0,physicsSteps:0,commandVersion:0,consumedVersion:0,
        originX:e.clientX,originY:e.clientY,originTime:this.eventTime(e),jellyTap:false,
      });
      // Disable before the event reaches OrbitControls on the bubble path.
      this.controls.enabled=false;
      this.canvas.setPointerCapture(e.pointerId);this.canvas.classList.add('grabbing');
      return;
    }
    if(this.grabs.size)return;
    if(pick.kind==='toy'&&pick.toy?.drag){
      // Same rule as a jelly grab: orbit sees enabled=false, and pointerdown is not cancelled.
      this.controls.enabled=false;
      this.toyDrag={id:e.pointerId,toy:pick.toy,x:e.clientX,y:e.clientY,t:this.eventTime(e)};
      this.dragToy(e,pick.toy,'start');
      return;
    }
    this.armTap(e);
  };
  private canGrab(e:PointerEvent) {
    if(this.body.grabs.length>=MAX_GRABS)return false;
    // Only touch can add simultaneous grips; desktop mouse/pen keep one grip.
    if(this.body.grab&&(e.pointerType!=='touch'||[...this.grabs.values()].some(state=>state.pointerType!=='touch')))return false;
    return true;
  }
  private pointerMove=(e:PointerEvent)=>{
    if(this.toyDrag?.id===e.pointerId){
      e.preventDefault();e.stopImmediatePropagation();
      this.dragToy(e,this.toyDrag.toy,'move');
      return;
    }
    const state=this.grabs.get(e.pointerId);
    if(state&&!state.releasePending) {
      if(e.pointerType==='mouse'&&(e.buttons&1)===0) {
        // Recover even if pointerup/lostpointercapture was swallowed externally.
        this.end(e);return;
      }
      e.preventDefault();e.stopImmediatePropagation();this.captureDragTarget(e,state);
    } else if(!this.body.grab&&e.pointerType==='mouse') {
      this.eventRay(e);
      // Hover is only a cursor hint. Pointer-down resolves the exact visible
      // triangle through the refittable BVH, not a 144k-triangle linear scan.
      this.canvas.style.cursor=this.mesh.geometry.boundingBox&&this.raycaster.ray.intersectsBox(this.mesh.geometry.boundingBox)?'grab':'default';
    }
  };
  private end=(e:PointerEvent)=>{
    if(this.toyDrag?.id===e.pointerId){
      const drag=this.toyDrag;this.toyDrag=null;
      const moved=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);
      const tap=e.type==='pointerup'&&moved<TAP_PX&&this.eventTime(e)-drag.t<TAP_MS;
      this.dragToy(e,drag.toy,'end');
      if(tap){void this.sound.unlock().catch(()=>{});drag.toy.use();}
      this.controls.enabled=this.body.grabs.length===0;
      return;
    }
    const state=this.grabs.get(e.pointerId);
    if(!state){
      if(e.type==='pointerup')this.finishPendingTap(e);
      else if(this.pendingTap?.id===e.pointerId)this.pendingTap=null;
      return;
    }
    if(state.releasePending)return;
    // pointerup itself may be the only event carrying an abrupt drag endpoint.
    if(e.type==='pointerup')this.captureDragTarget(e,state);
    const moved=Math.hypot(e.clientX-state.originX,e.clientY-state.originY);
    state.jellyTap=moved<TAP_PX&&this.eventTime(e)-state.originTime<TAP_MS;
    e.preventDefault();e.stopImmediatePropagation();
    // Mark released before releasing capture, which may itself dispatch an event.
    state.releasePending=true;
    state.releaseStepsRemaining=state.physicsSteps===0?2:1;
    if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    this.syncGrabControls();
    // Retain each released grip until physics consumes its final target sample.
  };
  /**
   * A real mesh hit beats a near miss. The sponge yields to the jelly only,
   * so a duck's pad cannot steal a press that lands on the sponge.
   */
  private pickPointer(e:PointerEvent):PointerPick {
    this.eventRay(e);this.grabBVH.refit();
    const ray=this.raycaster.ray;
    const jelly=this.grabBVH.hit([ray.origin.x,ray.origin.y,ray.origin.z],[ray.direction.x,ray.direction.y,ray.direction.z]);
    const jellyDistance=jelly?.distance??Infinity;
    let solid:ToyTap|null=null,solidDistance=Infinity,soft:ToyTap|null=null,softDistance=Infinity;
    let padSolid:ToyTap|null=null,padSolidDistance=Infinity,padSoft:ToyTap|null=null,padSoftDistance=Infinity;
    for(const candidate of this.toyTaps) {
      if(!this.toyVisible(candidate))continue;
      const hit=this.toyHit(candidate);
      if(!hit)continue;
      if(hit.padded){
        if(candidate.yieldsToJelly){if(hit.distance<padSoftDistance){padSoft=candidate;padSoftDistance=hit.distance;}}
        else if(hit.distance<padSolidDistance){padSolid=candidate;padSolidDistance=hit.distance;}
      } else if(candidate.yieldsToJelly){
        if(hit.distance<softDistance){soft=candidate;softDistance=hit.distance;}
      } else if(hit.distance<solidDistance){solid=candidate;solidDistance=hit.distance;}
    }
    const mesh=this.nearer(solid,solidDistance,soft,softDistance);
    if(jelly&&(!mesh.toy||mesh.toy.yieldsToJelly||jellyDistance<=mesh.distance))return {kind:'jelly',toy:null,hit:jelly};
    if(mesh.toy)return {kind:'toy',toy:mesh.toy,hit:null};
    if(this.jellyNear())return {kind:'jelly',toy:null,hit:null};
    const pad=this.nearer(padSolid,padSolidDistance,padSoft,padSoftDistance);
    if(pad.toy)return {kind:'toy',toy:pad.toy,hit:null};
    return {kind:'floor',toy:null,hit:null};
  }
  private nearer(primary:ToyTap|null,primaryDistance:number,secondary:ToyTap|null,secondaryDistance:number) {
    if(primary&&(!secondary||primaryDistance<=secondaryDistance))return {toy:primary,distance:primaryDistance};
    return {toy:secondary,distance:secondaryDistance};
  }
  private toyVisible(toy:ToyTap) {
    let node=toy.object??null;
    while(node){if(node.visible===false)return false;node=node.parent;}
    return true;
  }
  private hitVisible(object:THREE.Object3D) {
    let node:THREE.Object3D|null=object;
    while(node){if(node.visible===false)return false;node=node.parent;}
    return true;
  }
  private toyHit(toy:ToyTap):{distance:number;padded:boolean}|null {
    const pad=Math.min(.08,Math.max(toy.radius,TOY_PROXY_RADIUS));
    if(toy.object) {
      if(!this.toyVisible(toy))return null;
      toy.object.updateWorldMatrix(true,true);
      const hit=this.raycaster.intersectObject(toy.object,true).find(item=>this.hitVisible(item.object));
      if(hit)return {distance:hit.distance,padded:false};
    } else if(this.scratchOffset.copy(toy.center).sub(this.camera.position).length()<=pad+.02) return null;
    const along=this.temp.copy(toy.center).sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction);
    if(along<=.02||this.raycaster.ray.distanceToPoint(toy.center)>pad)return null;
    return {distance:along,padded:true};
  }
  /** About 5 cm past the jelly, and only when the ray missed the mesh. */
  private jellyNear() {
    const along=this.temp.copy(this.body.center).sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction);
    if(along<=.02)return false;
    return this.raycaster.ray.distanceToPoint(this.body.center)<=JELLY_NEAR;
  }
  private dragToy(e:PointerEvent,toy:ToyTap,phase:'start'|'move'|'end') {
    if(!toy.drag)return;
    this.eventRay(e);
    this.toyPlane.constant=-toy.center.y;
    if(!this.raycaster.ray.intersectPlane(this.toyPlane,this.dragPoint))this.dragPoint.copy(toy.center);
    toy.drag(phase,this.dragPoint);
  }
  private armTap(e:PointerEvent) {
    this.pendingTap={id:e.pointerId,x:e.clientX,y:e.clientY,t:this.eventTime(e)};
    this.idle=0;
  }
  private finishPendingTap(e:PointerEvent) {
    const tap=this.pendingTap;
    if(!tap||tap.id!==e.pointerId)return;
    this.pendingTap=null;
    const moved=Math.hypot(e.clientX-tap.x,e.clientY-tap.y);
    if(moved>=TAP_PX||this.eventTime(e)-tap.t>=TAP_MS)return;
    const pick=this.pickPointer(e);
    this.idle=0;
    if(pick.kind==='jelly'){this.onTapJelly();return;}
    if(pick.toy){void this.sound.unlock().catch(()=>{});pick.toy.use();return;}
    this.onTapGround();
  }
  private syncGrabControls() {
    this.controls.enabled=this.body.grabs.length===0;
    this.canvas.classList.toggle('grabbing',[...this.grabs.values()].some(state=>!state.releasePending));
  }
  private finishRelease=(id?:number)=>{
    const ids=id===undefined?[...this.grabs.keys()]:[id];
    for(const pointerId of ids) {
      const state=this.grabs.get(pointerId);if(!state)continue;
      this.grabs.delete(pointerId);
      const index=this.body.grabs.indexOf(state.grab);
      if(index!==-1)this.body.grabs.splice(index,1);
      if(state.jellyTap&&state.releasePending)this.onTapJelly();
      if(this.canvas.hasPointerCapture(pointerId))this.canvas.releasePointerCapture(pointerId);
    }
    if(id===undefined)this.body.grab=null;
    this.body.wake();this.syncGrabControls();
  };
  private keyDown=(e:KeyboardEvent)=>{
    if(this.menuOpen())return;
    if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(e.code==='Space'&&(e.target as HTMLElement)?.closest('button'))return;
    if(e.code==='Space'&&!e.repeat){e.preventDefault();void this.sound.unlock().catch(()=>{});this.onTapGround();}
    if(e.code==='Escape')this.finishRelease();
  };
  clear=()=>{
    if(this.toyDrag){this.toyDrag.toy.drag?.('end',this.dragPoint);this.toyDrag=null;this.controls.enabled=this.body.grabs.length===0;}
    this.finishRelease();this.pendingTap=null;this.rig.move.set(0,0,0);
    document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));
  };
  step(h:number) {
    // The bath does not walk. Muscles stay off so they cannot fight the water.
    this.rig.move.set(0,0,0);
    if(this.menuOpen()||this.bodyControlled())return;
    for(const state of this.grabs.values()) {
      const grab=state.grab;
      advanceGrabTarget(grab.target,state.rawTarget,h,grab.point);
      state.consumedVersion=state.commandVersion;state.physicsSteps++;
    }
  }
  /** Called immediately after body.step() for the same fixed substep. */
  afterPhysicsStep() {
    for(const [id,state] of this.grabs) {
      if(state.releasePending&&state.consumedVersion===state.commandVersion) {
        state.releaseStepsRemaining--;
        if(state.releaseStepsRemaining<=0)this.finishRelease(id);
      }
    }
  }
  update(dt:number) {
    this.controls.maxDistance=BATH_ORBIT.maxDistance;
    this.controls.minDistance=BATH_ORBIT.minDistance;
    this.controls.minPolarAngle=BATH_ORBIT.minPolar;
    this.controls.maxPolarAngle=BATH_ORBIT.maxPolar;
    const busy=this.orbiting||this.pendingTap!==null||this.toyDrag!==null||this.grabs.size>0;
    if(busy)this.idle=0;else this.idle+=dt;
    for(const [id,state] of this.grabs)if(!this.body.grabs.includes(state.grab))this.finishRelease(id);
    if(this.body.grab||this.toyDrag)return;
    // The tub is the orbit center. Following the jelly pans every toy off the screen.
    this.controls.target.copy(this.anchor);
    this.controls.update();
    const offscreen=this.projectedOffscreen();
    if(!busy&&(offscreen||this.idle>3.5))this.easeHome(dt,offscreen?4.5:1.6);
  }
  /** Remember the current view as home. Resize calls this after fitting the tub. */
  captureHome() {
    this.anchor.copy(this.controls.target);
    this.homeSpherical.setFromVector3(this.scratchOffset.copy(this.camera.position).sub(this.controls.target));
  }
  private projectedOffscreen() {
    this.ndc.copy(this.body.center);this.ndc.project(this.camera);
    return this.ndc.z<-1||this.ndc.z>1||Math.abs(this.ndc.x)>.92||Math.abs(this.ndc.y)>.92;
  }
  /** Bring orbit back in front of the jelly so the camera cannot stay lost. */
  private easeHome(dt:number,lambda:number) {
    this.scratchOffset.copy(this.camera.position).sub(this.controls.target);
    this.scratchSpherical.setFromVector3(this.scratchOffset);
    const radius=THREE.MathUtils.clamp(this.homeSpherical.radius,this.controls.minDistance,this.controls.maxDistance);
    const phi=THREE.MathUtils.clamp(this.homeSpherical.phi,this.controls.minPolarAngle,this.controls.maxPolarAngle);
    this.scratchSpherical.radius=THREE.MathUtils.damp(this.scratchSpherical.radius,radius,lambda,dt);
    this.scratchSpherical.phi=THREE.MathUtils.damp(this.scratchSpherical.phi,phi,lambda,dt);
    const delta=Math.atan2(Math.sin(this.rig.yaw-this.scratchSpherical.theta),Math.cos(this.rig.yaw-this.scratchSpherical.theta));
    this.scratchSpherical.theta+=delta*(1-Math.exp(-lambda*dt));
    this.scratchOffset.setFromSpherical(this.scratchSpherical);
    this.camera.position.copy(this.controls.target).add(this.scratchOffset);
    this.controls.update();
  }
  /** Jelly grip or the toy being dragged, for the qc=1 probe. */
  hold():string|null {
    if([...this.grabs.values()].some(state=>!state.releasePending))return 'jelly';
    if(this.toyDrag)return this.toyDrag.toy.label??'toy';
    return null;
  }
  recenter() {this.clear();this.rig.reset();}
  teleport() {
    this.recenter();this.controls.target.copy(this.anchor);this.controls.update();
  }
  dispose() {this.clear();this.abort.abort();this.controls.dispose();}
}
