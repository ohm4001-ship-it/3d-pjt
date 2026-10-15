import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const dimensionColor = 0x6783ad;

function makeWoodTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
  const context = canvas.getContext('2d'); context.fillStyle = '#e2cba7'; context.fillRect(0, 0, 256, 512);
  for(let x=0;x<256;x+=2){
    const shade=186+Math.round(18*Math.sin(x*.33)+9*Math.cos(x*.81));
    context.strokeStyle=`rgba(${shade},${shade-34},${shade-62},.15)`;context.lineWidth=x%10===0?1:.6;context.beginPath();
    for(let y=0;y<=512;y+=8){const offset=Math.sin(y*.009+x*.2)*1.7; if(y===0)context.moveTo(x+offset,y);else context.lineTo(x+offset,y);}context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(2,1);
  return texture;
}

function labelSprite(text) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=110;
  const context=canvas.getContext('2d');context.fillStyle='rgba(239,244,248,.96)';context.beginPath();context.roundRect(48,14,416,80,14);context.fill();
  context.font='500 44px Consolas, monospace';context.textAlign='center';context.textBaseline='middle';context.fillStyle='#4e6d99';context.fillText(text,256,58);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.scale.set(.39,.084,1);sprite.renderOrder=5;return sprite;
}

function disposeGroup(group) {
  group.traverse((item)=>{item.geometry?.dispose();if(item.isSprite){item.material.map?.dispose();item.material.dispose();}else if(item.isLine && !item.isLineSegments && item.material){item.material.dispose();}});
  group.clear();
}

function disposeReferenceGroup(group) {
  const materials = new Set(); const textures = new Set();
  group.traverse((item) => {
    item.geometry?.dispose();
    for (const material of Array.isArray(item.material) ? item.material : item.material ? [item.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  group.clear();
}

export function createShelfViewer(host) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D 진열대. 방향키로 회전, 더하기와 빼기로 확대, Home 키로 시점 초기화');renderer.domElement.dataset.testid='three-canvas';
  host.prepend(renderer.domElement);
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(34,1,.01,100);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.065;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=.6;controls.maxDistance=10;controls.enablePan=true;
  scene.add(new THREE.HemisphereLight(0xf3f6ff,0xc0b7a7,2.3));
  const key=new THREE.DirectionalLight(0xfff4e4,3.7);key.position.set(-3,5,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=3;key.shadow.camera.bottom=-3;key.shadow.normalBias=.015;key.shadow.bias=-.0001;scene.add(key);
  const fill=new THREE.DirectionalLight(0xe4ecff,1.3);fill.position.set(3,2,-2);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({color:0x67778e,opacity:.16}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;floor.receiveShadow=true;scene.add(floor);
  const stage=new THREE.Mesh(new THREE.CircleGeometry(1.08,96),new THREE.MeshStandardMaterial({color:0xe1e8ee,roughness:.95}));stage.rotation.x=-Math.PI/2;stage.position.y=-.004;stage.receiveShadow=true;scene.add(stage);
  const ring=new THREE.Mesh(new THREE.RingGeometry(1.072,1.079,96),new THREE.MeshBasicMaterial({color:0xc7d3df,transparent:true,opacity:.7,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.003;scene.add(ring);
  const grid=new THREE.GridHelper(4,40,0xd1dbe5,0xe0e7ee);grid.position.y=-.009;grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);
  const cadGroup=new THREE.Group();cadGroup.name='Formworks dimensional shelf';scene.add(cadGroup);
  const dimensions=new THREE.Group();scene.add(dimensions);
  const referenceGroup=new THREE.Group();referenceGroup.visible=false;scene.add(referenceGroup);
  const woodTexture=makeWoodTexture();
  const materials={birch:new THREE.MeshStandardMaterial({map:woodTexture,color:0xffffff,roughness:.66,metalness:0}),steel:new THREE.MeshStandardMaterial({color:0x667486,roughness:.42,metalness:.7})};
  const edgeMaterials={birch:new THREE.LineBasicMaterial({color:0x9f8058,transparent:true,opacity:.13}),steel:new THREE.LineBasicMaterial({color:0x405061,transparent:true,opacity:.17})};
  let currentSpec;let mode='cad';let dimensionsVisible=true;let referenceLoaded=false;let referenceSequence=0;

  function box(name,width,height,depth,x,y,z,material){
    const geometry=new THREE.BoxGeometry(width,height,depth);const mesh=new THREE.Mesh(geometry,materials[material]);mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),edgeMaterials[material]);mesh.add(edges);cadGroup.add(mesh);return mesh;
  }
  function dimension(a,b,text,offset){
    const points=[a,b];const vector=new THREE.Vector3().subVectors(b,a).normalize();const side=vector.y>.5?new THREE.Vector3(.035,0,0):new THREE.Vector3(0,.035,0);
    const tickA=[a.clone().sub(side),a.clone().add(side)];const tickB=[b.clone().sub(side),b.clone().add(side)];
    for(const pair of [points,tickA,tickB]){const geometry=new THREE.BufferGeometry().setFromPoints(pair);dimensions.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:dimensionColor,transparent:true,opacity:.72})));}
    const label=labelSprite(text);label.position.copy(a).add(b).multiplyScalar(.5).add(offset);dimensions.add(label);
  }
  function update(spec,geometry={}){
    currentSpec={...spec};disposeGroup(cadGroup);disposeGroup(dimensions);
    const width=spec.widthMm/1000,depth=spec.depthMm/1000,height=spec.heightMm/1000;
    const section=(geometry?.frameSectionMm || 40)/1000,thickness=(geometry?.panelThicknessMm || (spec.material==='steel'?2:18))/1000,bottom=(geometry?.bottomShelfMm || 100)/1000;
    const centers=[-width/2+section/2,width/2-section/2];if(geometry?.centerSupport ?? spec.widthMm>1400)centers.push(0);
    for(const x of centers)for(const z of [-depth/2+section/2,depth/2-section/2])box('Frame upright',section,height,section,x,height/2,z,'steel');
    for(let i=0;i<spec.shelves;i++){
      const y=bottom+i*(height-bottom-thickness)/(spec.shelves-1);
      box(`Shelf ${i+1}`,width-2*section,thickness,depth-2*section,0,y+thickness/2,0,spec.material);
      for(const z of [-depth/2+section/2,depth/2-section/2])box(`Shelf ${i+1} width rail`,width-2*section,section,section,0,y-section/2,z,'steel');
      for(const x of centers)box(`Shelf ${i+1} depth rail`,section,section,depth-2*section,x,y-section/2,0,'steel');
    }
    const front=depth/2+.19;
    dimension(new THREE.Vector3(-width/2,.02,front),new THREE.Vector3(width/2,.02,front),`${spec.widthMm} mm`,new THREE.Vector3(0,.015,.04));
    dimension(new THREE.Vector3(width/2+.2,0,-depth/2),new THREE.Vector3(width/2+.2,height,-depth/2),`${spec.heightMm} mm`,new THREE.Vector3(.015,0,0));
    dimension(new THREE.Vector3(-width/2-.16,.015,-depth/2),new THREE.Vector3(-width/2-.16,.015,depth/2),`${spec.depthMm} mm`,new THREE.Vector3(-.12,.01,0));
    const radius=Math.max(width*.65,depth*.9,.8);stage.scale.setScalar(radius/1.08);ring.scale.setScalar(radius/1.08);
    dimensions.visible=dimensionsVisible && mode==='cad';
    if(mode==='cad')resetCamera();
    cadGroup.userData={spec:currentSpec,geometry,description:'Parametric concept model; dimensions and price require manufacturing review.'};
    renderer.domElement.dataset.shelves=String(spec.shelves);renderer.domElement.dataset.material=spec.material;renderer.domElement.dataset.legCount=String(centers.length*2);
  }
  function resetCamera(){
    if(mode==='reference' && referenceLoaded){camera.position.set(2.1,1.4,2.8);controls.target.set(0,.65,0);controls.update();return;}
    const height=(currentSpec?.heightMm || 1500)/1000,width=(currentSpec?.widthMm || 1200)/1000;const distance=Math.max(height*2.5,width*2.5,2.8);
    camera.position.set(distance*.63,height*.76+distance*.16,distance*.8);controls.target.set(0,height*.49,0);controls.update();
  }
  const observer=new ResizeObserver(()=>{const width=host.clientWidth,height=host.clientHeight;if(width && height){camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);}});observer.observe(host);
  renderer.domElement.addEventListener('keydown',(event)=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key))event.preventDefault();else return;
    if(event.key==='Home'){resetCamera();return;}
    const vector=camera.position.clone().sub(controls.target);const spherical=new THREE.Spherical().setFromVector3(vector);
    if(event.key==='ArrowLeft')spherical.theta-=.12;if(event.key==='ArrowRight')spherical.theta+=.12;
    if(event.key==='ArrowUp')spherical.phi=Math.max(.08,spherical.phi-.1);if(event.key==='ArrowDown')spherical.phi=Math.min(Math.PI*.49,spherical.phi+.1);
    if(event.key==='+' || event.key==='=')spherical.radius=Math.max(.6,spherical.radius*.9);if(event.key==='-')spherical.radius=Math.min(10,spherical.radius*1.1);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();
  });
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});

  return {
    update,resetCamera,
    toggleDimensions(shown){dimensionsVisible=shown;dimensions.visible=shown && mode==='cad';},
    setMode(next){mode=next;cadGroup.visible=next==='cad';referenceGroup.visible=next==='reference';dimensions.visible=dimensionsVisible && next==='cad';resetCamera();},
    clearReference(){++referenceSequence;disposeReferenceGroup(referenceGroup);referenceLoaded=false;},
    async loadReference(url,isCurrent=()=>true){
      const sequence=++referenceSequence;
      const gltf=await new GLTFLoader().loadAsync(url);
      if(sequence!==referenceSequence || !isCurrent()){disposeReferenceGroup(gltf.scene);return false;}
      const bounds=new THREE.Box3().setFromObject(gltf.scene);const size=bounds.getSize(new THREE.Vector3());const center=bounds.getCenter(new THREE.Vector3());const scale=1.5/Math.max(size.x,size.y,size.z);
      if(!Number.isFinite(scale) || scale<=0){disposeReferenceGroup(gltf.scene);throw new Error('3D 모델의 크기를 확인할 수 없습니다.');}
      disposeReferenceGroup(referenceGroup);referenceGroup.add(gltf.scene);
      gltf.scene.position.sub(center);gltf.scene.scale.multiplyScalar(scale);gltf.scene.position.multiplyScalar(scale);gltf.scene.position.y+=size.y*scale/2;
      gltf.scene.traverse((mesh)=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});referenceLoaded=true;return true;
    },
    async exportGlb(){
      const source=mode==='reference'?referenceGroup:cadGroup;
      if(!source.children.length)throw new Error('모델이 아직 준비되지 않았습니다.');
      const copy=source.clone(true);copy.visible=true;
      if(mode==='cad')copy.traverse((item)=>{if(item.isLineSegments)item.visible=false;});
      const result=await new GLTFExporter().parseAsync(copy,{binary:true,onlyVisible:true});const blob=new Blob([result],{type:'model/gltf-binary'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=mode==='reference'?'formworks-reference.glb':`formworks-shelf-${currentSpec.widthMm}x${currentSpec.depthMm}x${currentSpec.heightMm}.glb`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    },
    dispose(){++referenceSequence;observer.disconnect();controls.dispose();renderer.setAnimationLoop(null);disposeReferenceGroup(referenceGroup);disposeGroup(cadGroup);disposeGroup(dimensions);renderer.dispose();woodTexture.dispose();Object.values(materials).forEach((material)=>material.dispose());Object.values(edgeMaterials).forEach((material)=>material.dispose());},
  };
}
