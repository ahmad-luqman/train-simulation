import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cities, corridors, locomotives } from './data';
import { Simulation, edgeKey } from './simulation';
import { box, cylinder, material, house, locomotive, carriage } from './models';
export type CameraMode='iso'|'3d';
const riverX=(z:number)=>36+13*Math.sin(z*.038)+4*Math.cos(z*.07);
function height(x:number,z:number){
  const mountain=Math.max(0,(-z-59)/31);
  const ridge=(Math.sin(x*.1)*.35+.7)*mountain*mountain*21;
  const edge=Math.max(0,(Math.abs(x)-78)/17)*3;
  const river=Math.abs(x-riverX(z));
  return river<4.3?-1.7:ridge+edge+(river<6?-1.7*(6-river)/1.7:0);
}
function rng(seed:number){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
export class RailwayWorld {
  scene=new THREE.Scene();renderer:THREE.WebGLRenderer;camera:THREE.PerspectiveCamera|THREE.OrthographicCamera;controls:OrbitControls;
  sim:Simulation;mode:CameraMode='iso';selected=10;following=false;labelsVisible=true;fps=60;
  curves=new Map<string,THREE.CatmullRomCurve3>(); trains:THREE.Group[]=[];cars:THREE.Group[][]=[];
  labels:{element:HTMLDivElement;position:THREE.Vector3}[]=[];
  smoke: {mesh:THREE.Mesh;age:number;life:number;velocity:THREE.Vector3}[]=[];
  private smokeGeo=new THREE.IcosahedronGeometry(1,1);private smokeTimer=0;private frame=0;private previous=0;private disposed=false;
  private resizeObserver:ResizeObserver;private raycaster=new THREE.Raycaster();private pointer=new THREE.Vector2();private down={x:0,y:0};private onSelect:(id:number)=>void;
  private selectionRing:THREE.Mesh;private water:THREE.Mesh;private sunlight:THREE.DirectionalLight;private signalLights:{key:string;mesh:THREE.Mesh}[]=[];
  constructor(public host:HTMLDivElement,sim:Simulation,onSelect:(id:number)=>void){
    this.sim=sim;this.onSelect=onSelect;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    host.appendChild(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','Interactive 3D railway map. Drag to move the camera, scroll to zoom, or click a train to select it.');
    this.scene.background=new THREE.Color('#cbd5d4');this.scene.fog=new THREE.Fog('#cbd5d4',250,540);
    this.scene.add(new THREE.HemisphereLight('#f8f0d9','#617164',2));
    this.sunlight=new THREE.DirectionalLight('#fff2cb',3.2);this.sunlight.position.set(-65,110,35);this.sunlight.castShadow=true;
    const sh=this.sunlight.shadow;sh.mapSize.set(2048,2048);sh.camera.left=-130;sh.camera.right=130;sh.camera.top=130;sh.camera.bottom=-130;sh.camera.far=300;sh.normalBias=.2;sh.bias=-.0002;this.scene.add(this.sunlight);
    this.camera=new THREE.OrthographicCamera(-90,90,90,-90,.1,800);this.camera.position.set(140,155,175);
    this.controls=this.makeControls();this.controls.target.set(0,0,-7);this.controls.update();
    this.terrain();this.water=this.river();this.railways();this.towns();this.nature();
    for(let i=0;i<locomotives.length;i++){const g=locomotive(locomotives[i].color,i);this.scene.add(g);this.trains.push(g);this.cars.push([]);this.syncCars(i);}
    this.selectionRing=new THREE.Mesh(new THREE.RingGeometry(2.6,2.82,48),new THREE.MeshBasicMaterial({color:'#f5dfaa',transparent:true,opacity:.85,side:THREE.DoubleSide}));this.selectionRing.rotation.x=-Math.PI/2;this.scene.add(this.selectionRing);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
    host.addEventListener('pointerdown',this.pointerDown);host.addEventListener('pointerup',this.pointerUp);
    this.frame=requestAnimationFrame(this.animate);
  }
  private makeControls(){const c=new OrbitControls(this.camera,this.renderer.domElement);c.enableDamping=true;c.dampingFactor=.08;c.minDistance=10;c.maxDistance=320;c.minZoom=.55;c.maxZoom=9;c.maxPolarAngle=Math.PI*.47;c.screenSpacePanning=false;c.enableRotate=this.mode==='3d';c.mouseButtons.LEFT=this.mode==='iso'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;c.mouseButtons.RIGHT=THREE.MOUSE.PAN;return c;}
  private terrain(){
    const geo=new THREE.PlaneGeometry(190,180,140,140);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position;const colors=[];const random=rng(17);
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),y=height(x,z);pos.setY(i,y);const col=new THREE.Color(y>12?'#899082':y>5?'#7f8e69':'#839965');col.multiplyScalar(.92+random()*.14);colors.push(col.r,col.g,col.b);}
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const ground=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));ground.receiveShadow=true;this.scene.add(ground);
    box(this.scene,'#ac9976',0,-3.1,0,190,3,180);box(this.scene,'#d5ccb7',0,-5,0,190,.8,180);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),material('#cbd5d4'));floor.rotation.x=-Math.PI/2;floor.position.y=-6;floor.receiveShadow=true;this.scene.add(floor);
  }
  private river(){
    const verts:number[]=[],indices:number[]=[];
    for(let i=0;i<=180;i++){const z=-90+i,x=riverX(z);verts.push(x-4.5,-.95,z,x+4.5,-.95,z);if(i<180){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(indices);geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#71b5b1',roughness:.32,metalness:.25,transparent:true,opacity:.88}));this.scene.add(m);
    const random=rng(56);for(let i=0;i<105;i++){const z=random()*178-89,x=riverX(z)+(random()-.5)*7;box(this.scene,'#b1d6c8',x,-.91,z,.035,.01,.6+random()*1.7).rotation.y=.2;}
    return m;
  }
  private railways(){
    const ties:{p:THREE.Vector3;angle:number}[]=[];const bridges:{p:THREE.Vector3;angle:number}[]=[];
    for(const [a,b] of corridors){
      const start=new THREE.Vector3(cities[a].x,.36,cities[a].z),end=new THREE.Vector3(cities[b].x,.36,cities[b].z);const d=end.clone().sub(start),normal=new THREE.Vector3(-d.z,0,d.x).normalize();
      const curve=new THREE.CatmullRomCurve3([start,start.clone().lerp(end,.22).addScaledVector(normal,2.2),start.clone().lerp(end,.78).addScaledVector(normal,2.2),end]);
      const key=edgeKey(a,b);this.curves.set(key,curve);const length=curve.getLength();this.sim.lengths.set(key,length);
      const points=curve.getSpacedPoints(Math.ceil(length*2));
      // A broad ballast strip beneath the sleepers, and two continuous steel rails.
      for(const side of [-1,0,1]){
        const vs:number[]=[],ix:number[]=[];const width=side===0?1.35:.07;
        points.forEach((p,i)=>{const tangent=curve.getTangentAt(i/(points.length-1)),n=new THREE.Vector3(-tangent.z,0,tangent.x);const offset=side*.58;const center=p.clone().addScaledVector(n,offset);center.y+=side===0?-.17:.13;vs.push(center.x+n.x*width,center.y,center.z+n.z*width,center.x-n.x*width,center.y,center.z-n.z*width);if(i<points.length-1){const j=i*2;ix.push(j,j+1,j+2,j+1,j+3,j+2);}});
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));geo.setIndex(ix);geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:side===0?'#a7a18b':'#d4d2bd',roughness:side===0?1:.42,side:THREE.DoubleSide}));mesh.receiveShadow=true;this.scene.add(mesh);
      }
      for(let n=0;n<length;n+=.85){const p=curve.getPointAt(n/length),t=curve.getTangentAt(n/length),angle=Math.atan2(t.x,t.z);ties.push({p,angle});if(Math.abs(p.x-riverX(p.z))<6.1)bridges.push({p,angle});}
      for(const t of [.09,.91]){const p=curve.getPointAt(t),tan=curve.getTangentAt(t);p.x+=tan.z*2;p.z-=tan.x*2;box(this.scene,'#515e4b',p.x,1.3,p.z,.13,2.6,.13);const lamp=new THREE.Mesh(new THREE.SphereGeometry(.25,8,6),new THREE.MeshBasicMaterial({color:'#79a867'}));lamp.position.set(p.x,2.6,p.z);this.scene.add(lamp);this.signalLights.push({key,mesh:lamp});}
    }
    const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(1.8,.13,.23),material('#716451'),ties.length);const obj=new THREE.Object3D();ties.forEach(({p,angle},i)=>{obj.position.copy(p);obj.rotation.set(0,angle,0);obj.updateMatrix();inst.setMatrixAt(i,obj.matrix);});inst.receiveShadow=true;this.scene.add(inst);
    for(let i=0;i<bridges.length;i++){const {p,angle}=bridges[i];const g=new THREE.Group();g.position.copy(p);g.rotation.y=angle;box(g,'#746d58',0,-.23,0,2.7,.35,1);for(const x of [-1.35,1.35]){box(g,'#495e54',x,.65,0,.11,.11,1.05);if(i%2===0){box(g,'#495e54',x,.3,0,.12,.8,.12);const brace=box(g,'#495e54',x,.35,0,.1,.1,2);brace.rotation.x=.42;}}if(i%5===0)box(g,'#aaa48b',0,-1.6,0,1.7,2.8,1);this.scene.add(g);}
  }
  private towns(){
    const random=rng(903);
    cities.forEach((city,index)=>{
      const urban=new THREE.Group();this.scene.add(urban);
      for(let i=0;i<(index===4?22:12);i++){
        const col=i%4,row=Math.floor(i/4);const x=city.x-10+col*3.4,z=city.z+5+row*4;
        if(Math.abs(x-riverX(z))<7)continue;
        const s=.68+random()*.4;house(urban,x,z,city.color,s,random()>.6?Math.PI:0);
      }
      box(urban,'#b7b39a',city.x,0,city.z+4,20,.07,1.25);box(urban,'#b7b39a',city.x-2,.01,city.z+10,1.2,.08,13);
      box(urban,'#d4c6a4',city.x,.5,city.z-2.7,9,.8,2.6);box(urban,'#6f7f6a',city.x,2.3,city.z-2.7,8,.18,3);
      for(const x of [-3,0,3])box(urban,'#6b725b',city.x+x,1.5,city.z-2.7,.16,1.6,.16);
      house(urban,city.x+5,city.z-4,'#cbad85',.85,Math.PI/2);
      if(index===0||index===4){for(let j=0;j<3;j++){box(urban,'#916752',city.x-9+j*4,2.2,city.z+18,3.4,4.4,4);cylinder(urban,'#9d8062',city.x-9+j*4,5.2,city.z+18,.35,4);}}
      const el=document.createElement('div');el.className='city-label';el.innerHTML=`<strong>${city.name}</strong><span>${city.cargo}</span>`;this.host.appendChild(el);this.labels.push({element:el,position:new THREE.Vector3(city.x,5,city.z-3)});
    });
    // Golden fields and neatly spaced planted rows around agricultural towns.
    for(const [x,z] of [[-73,39],[-41,31],[60,65],[22,-57],[-32,60]]){
      box(this.scene,'#b5a369',x,.07,z,11,.1,7);
      for(let i=0;i<15;i++)box(this.scene,i%2?'#c7b379':'#9f925c',x-5+i*.7,.17,z,.2,.16,6.8);
    }
    for(const [x,z] of [[-77,-30],[5,-58]]){cylinder(this.scene,'#847a61',x,2.3,z,1.1,4);cylinder(this.scene,'#697467',x,4.7,z,1.7,1.7);}
  }
  private nature(){
    const random=rng(731);const positions:{x:number;y:number;z:number;s:number}[]=[];
    for(let i=0;i<1600;i++){
      const x=random()*184-92,z=random()*174-87;
      if(Math.abs(x-riverX(z))<7||cities.some(c=>Math.hypot(x-c.x,z-c.z)<16))continue;
      if(corridors.some(([a,b])=>{const c=cities[a],d=cities[b];const dx=d.x-c.x,dz=d.z-c.z,t=Math.max(0,Math.min(1,((x-c.x)*dx+(z-c.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-c.x-t*dx,z-c.z-t*dz)<4;}))continue;
      positions.push({x,z,y:height(x,z),s:.65+random()*.9});
    }
    const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.23,1.6,5),material('#685c40'),positions.length);
    const foliage=new THREE.InstancedMesh(new THREE.ConeGeometry(1,3.5,6),material('#45694b'),positions.length*2);const o=new THREE.Object3D();
    positions.forEach((p,i)=>{o.position.set(p.x,p.y+.8*p.s,p.z);o.scale.setScalar(p.s);o.updateMatrix();trunk.setMatrixAt(i,o.matrix);for(let j=0;j<2;j++){o.position.y=p.y+(2.2+j*.85)*p.s;o.scale.set(p.s*(1-j*.26),p.s*(1-j*.2),p.s*(1-j*.26));o.updateMatrix();foliage.setMatrixAt(i*2+j,o.matrix);foliage.setColorAt(i*2+j,new THREE.Color().setHSL(.27+random()*.055,.21+random()*.13,.23+random()*.12));}});
    trunk.castShadow=true;foliage.castShadow=true;this.scene.add(trunk,foliage);
    const rockGeo=new THREE.IcosahedronGeometry(1,0);const rocks=new THREE.InstancedMesh(rockGeo,material('#939789'),100);
    for(let i=0;i<100;i++){const x=random()*180-90,z=-68-random()*19;o.position.set(x,height(x,z),z);o.scale.set(1+random()*1.5,.8+random(),1+random());o.rotation.set(random(),random(),random());o.updateMatrix();rocks.setMatrixAt(i,o.matrix);}rocks.castShadow=true;this.scene.add(rocks);
  }
  private syncCars(id:number){const count=this.sim.trains[id].cars+1;while(this.cars[id].length<count){const c=carriage(locomotives[id].color,this.cars[id].length);c.userData.trainId=id;this.scene.add(c);this.cars[id].push(c);}while(this.cars[id].length>count){this.scene.remove(this.cars[id].pop()!);}}
  private positionOnRoute(id:number,distance:number){
    const train=this.sim.trains[id];let [a,b]=this.sim.endpoints(train);let key=edgeKey(a,b),length=this.sim.lengths.get(key)!;
    if(distance<0){[a,b]=this.sim.endpoints(train,-1);key=edgeKey(a,b);length=this.sim.lengths.get(key)!;distance+=length;}
    const curve=this.curves.get(key)!;const forward=a<b;const t=THREE.MathUtils.clamp(distance/length,0,1);const u=forward?t:1-t;
    const p=curve.getPointAt(u),tangent=curve.getTangentAt(u).multiplyScalar(forward?1:-1);return {p,angle:Math.atan2(-tangent.x,-tangent.z)};
  }
  private animate=(now:number)=>{
    if(this.disposed)return;this.frame=requestAnimationFrame(this.animate);const delta=this.previous?Math.min((now-this.previous)/1000,.1):.016;this.previous=now;this.fps=this.fps*.95+Math.min(120,1/delta)*.05;this.sim.step(delta);
    this.sim.trains.forEach((t,i)=>{this.syncCars(i);const {p,angle}=this.positionOnRoute(i,t.distance);this.trains[i].position.copy(p);this.trains[i].rotation.y=angle;
      if(t.status==='Running'&&!this.sim.paused)for(const w of this.trains[i].userData.wheels)w.rotation.x-=delta*this.sim.speed*6;
      this.cars[i].forEach((car,j)=>{const at=this.positionOnRoute(i,t.distance-3.8-j*3);car.position.copy(at.p);car.rotation.y=at.angle;});
    });
    const target=this.trains[this.selected].position;this.selectionRing.position.set(target.x,.55,target.z);
    if(this.following){const movement=target.clone().sub(this.controls.target);this.camera.position.add(movement);this.controls.target.copy(target);}
    this.controls.update();
    this.smokeTimer+=delta;
    if(this.smokeTimer>.17&&!this.sim.paused){this.smokeTimer=0;this.sim.trains.forEach((t,i)=>{if(t.status!=='Running')return;const m=new THREE.Mesh(this.smokeGeo,new THREE.MeshStandardMaterial({color:'#ebe8d9',transparent:true,opacity:.45,depthWrite:false,roughness:1}));m.position.copy(this.trains[i].localToWorld(new THREE.Vector3(0,2.5,-1.2)));m.scale.setScalar(.28);this.scene.add(m);this.smoke.push({mesh:m,age:0,life:3.4,velocity:new THREE.Vector3(.6,1.7,.25)});});}
    if(!this.sim.paused)for(let i=this.smoke.length-1;i>=0;i--){const s=this.smoke[i];s.age+=delta;s.mesh.position.addScaledVector(s.velocity,delta);s.mesh.scale.setScalar(.28+s.age*.7);(s.mesh.material as THREE.MeshStandardMaterial).opacity=.42*(1-s.age/s.life);if(s.age>=s.life){this.scene.remove(s.mesh);(s.mesh.material as THREE.Material).dispose();this.smoke.splice(i,1);}}
    (this.water.material as THREE.MeshStandardMaterial).roughness=.32+Math.sin(now*.0004)*.05;
    for(const signal of this.signalLights)(signal.mesh.material as THREE.MeshBasicMaterial).color.set(this.sim.occupied.has(signal.key)?'#bd694f':'#83b478');
    this.renderer.render(this.scene,this.camera);
    const w=this.host.clientWidth,h=this.host.clientHeight;
    for(const label of this.labels){const p=label.position.clone().project(this.camera);label.element.style.display=this.labelsVisible&&p.z>-1&&p.z<1&&Math.abs(p.x)<1.05&&Math.abs(p.y)<1.05?'':'none';label.element.style.transform=`translate(-50%, -100%) translate(${(p.x*.5+.5)*w}px,${(-p.y*.5+.5)*h}px)`;}
  };
  setMode(mode:CameraMode){if(this.mode===mode)return;const target=this.controls.target.clone(),position=this.camera.position.clone();this.controls.dispose();this.mode=mode;
    if(mode==='iso'){this.camera=new THREE.OrthographicCamera(-90,90,90,-90,.1,800);this.camera.position.copy(target).add(new THREE.Vector3(140,155,175));if(this.following)this.camera.zoom=4;}
    else{this.camera=new THREE.PerspectiveCamera(43,1,.1,800);this.camera.position.copy(position);}
    this.controls=this.makeControls();this.controls.target.copy(target);this.controls.update();this.resize();
  }
  follow(id:number){this.selected=id;this.following=true;const p=this.trains[id].position;this.controls.target.copy(p);this.camera.position.copy(p).add(new THREE.Vector3(19,15,23));if(this.camera instanceof THREE.OrthographicCamera){this.camera.zoom=5;this.camera.position.copy(p).add(new THREE.Vector3(140,155,175));this.camera.updateProjectionMatrix();}this.controls.update();}
  overview(){this.following=false;this.controls.target.set(0,0,-7);this.camera.position.set(140,155,175);if(this.camera instanceof THREE.OrthographicCamera){this.camera.zoom=1;this.camera.updateProjectionMatrix();}this.controls.update();}
  zoom(direction:number){if(this.camera instanceof THREE.OrthographicCamera){this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom*(direction>0?1.25:.8),.55,9);this.camera.updateProjectionMatrix();}else{this.camera.position.sub(this.controls.target).multiplyScalar(direction>0?.8:1.25).add(this.controls.target);}this.controls.update();}
  setEvening(enabled:boolean){this.sunlight.color.set(enabled?'#ffc089':'#fff2cb');this.sunlight.intensity=enabled?2:3.2;this.scene.background=new THREE.Color(enabled?'#b7bfcc':'#cbd5d4');}
  private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);if(this.camera instanceof THREE.PerspectiveCamera)this.camera.aspect=w/h;else{const half=86;this.camera.left=-half*w/h;this.camera.right=half*w/h;this.camera.top=half;this.camera.bottom=-half;}this.camera.updateProjectionMatrix();}
  private pointerDown=(e:PointerEvent)=>{this.down={x:e.clientX,y:e.clientY};};
  private pointerUp=(e:PointerEvent)=>{if(Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)>5)return;const r=this.host.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hits=this.raycaster.intersectObjects([...this.trains,...this.cars.flat()],true);if(hits.length){let o:THREE.Object3D|null=hits[0].object;while(o&&o.userData.trainId===undefined)o=o.parent;if(o){this.selected=o.userData.trainId;this.onSelect(this.selected);}}};
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.controls.dispose();this.host.removeEventListener('pointerdown',this.pointerDown);this.host.removeEventListener('pointerup',this.pointerUp);this.labels.forEach(l=>l.element.remove());const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();this.scene.traverse(o=>{if(o instanceof THREE.Mesh){geos.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());this.smokeGeo.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
