import * as THREE from 'three/webgpu';
import { attribute } from 'three/tsl';
import { BabyFace } from './baby-face.ts';
import type { SoftBody } from '../../physics/soft-body.js';
import { DEFAULT_JELLY_FLAVOR, JELLY_FLAVORS, type JellyFlavorName } from './jelly-flavors.ts';

export const ABSORPTION=JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].absorption;

export class Baby {
  readonly mesh:THREE.Mesh;
  readonly group=new THREE.Group();
  private readonly face:BabyFace;
  private readonly jellyMaterial:THREE.MeshPhysicalNodeMaterial;
  readonly body:SoftBody;
  constructor(body:SoftBody) {
    this.body=body;
    const material=new THREE.MeshPhysicalNodeMaterial({
      color:JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].surface,roughness:.02,metalness:0,transmission:1,thickness:.035,
      ior:1.34,dispersion:.03,attenuationDistance:.035,specularIntensity:1.55,
      clearcoat:1,clearcoatRoughness:.015,envMapIntensity:1.35,
      transparent:false,side:THREE.FrontSide,flatShading:false,
    });
    this.jellyMaterial=material;
    this.setFlavor(DEFAULT_JELLY_FLAVOR);
    material.thicknessNode=attribute('opticalThickness','float');
    this.mesh=new THREE.Mesh(body.surface.geometry,material);
    this.mesh.renderOrder=1;
    this.mesh.frustumCulled=false;this.group.add(this.mesh);
    this.face=new BabyFace(body,this.group);
    this.update();
  }
  setReflectionMap(texture:THREE.Texture|null,intensity:number) {
    if(this.jellyMaterial.envMap!==texture){this.jellyMaterial.envMap=texture;this.jellyMaterial.needsUpdate=true;}
    this.jellyMaterial.envMapIntensity=intensity*1.45;
  }
  setFlavor(flavor:JellyFlavorName) {
    const look=JELLY_FLAVORS[flavor],distance=this.jellyMaterial.attenuationDistance;
    this.jellyMaterial.color.set(look.surface);
    this.jellyMaterial.attenuationColor.setRGB(
      Math.exp(-look.absorption[0]*distance),Math.exp(-look.absorption[1]*distance),Math.exp(-look.absorption[2]*distance),
      THREE.LinearSRGBColorSpace,
    );
  }
  update(dt=0,playing=false,sleeping=false,crying=false) { this.face.update(dt,playing,sleeping,crying); }
  cheer() { this.face.cheer(); }
  resetFace() { this.face.reset(); }
  dispose() {
    this.group.traverse(object=>{
      if(object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        materials.forEach(m=>m.dispose());
      }
    });
  }
}
