import * as THREE from 'three';
const mats=new Map<string,THREE.MeshStandardMaterial>();
export function material(color:string){if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness:.85}));return mats.get(color)!;}
const boxGeo=new THREE.BoxGeometry(1,1,1);
export function box(parent:THREE.Object3D,color:string,x:number,y:number,z:number,w:number,h:number,d:number){const m=new THREE.Mesh(boxGeo,material(color));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function cylinder(parent:THREE.Object3D,color:string,x:number,y:number,z:number,r:number,h:number,rotation=0){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),material(color));m.position.set(x,y,z);m.rotation.x=rotation;m.castShadow=true;parent.add(m);return m;}
export function locomotive(color:string,id=0){
  const g=new THREE.Group();g.userData.trainId=id;
  box(g,'#292f2e',0,.52,0,1.45,.25,3.8);
  cylinder(g,color,0,1.18,-.4,.57,2.5,Math.PI/2);
  cylinder(g,'#283630',0,1.2,-1.71,.48,.12,Math.PI/2);
  box(g,color,0,1.38,1.15,1.42,1.42,1.05);box(g,'#243f3a',0,2.14,1.15,1.7,.16,1.3);
  box(g,'#bad1cc',-.725,1.62,1.13,.035,.5,.55);box(g,'#bad1cc',.725,1.62,1.13,.035,.5,.55);
  cylinder(g,'#293832',0,2,-1.17,.18,.9);cylinder(g,'#34453c',0,2.48,-1.17,.25,.13);
  cylinder(g,'#cbb173',0,1.87,-.15,.2,.3);cylinder(g,'#e6c774',0,1.35,-1.8,.14,.1,Math.PI/2);
  const wheels:THREE.Object3D[]=[];
  for(const x of [-.76,.76])for(const z of [-1.15,-.35,.45,1.22]){
    const wheel=new THREE.Group();wheel.position.set(x,.5,z);const m=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.16,12),material('#283a34'));m.rotation.z=Math.PI/2;wheel.add(m);
    box(wheel,'#bfbc9c',0,0,0,.19,.055,.68);box(wheel,'#bfbc9c',0,0,0,.19,.68,.055);g.add(wheel);wheels.push(wheel);
  }
  for(const x of [-.87,.87])box(g,'#b2afa0',x,.5,0,.06,.07,2.65);
  g.userData.wheels=wheels;return g;
}
export function carriage(color:string,index:number){
  const g=new THREE.Group();box(g,'#303a33',0,.48,0,1.5,.2,2.65);
  box(g,index===0?color:index%2?'#8b6247':'#8f5340',0,1.1,0,1.4,1.05,2.45);
  if(index===0){box(g,'#222e2b',0,1.64,0,1.2,.15,2.2);}else{
    box(g,'#4a5147',0,1.69,0,1.55,.19,2.65);
    for(const x of [-.715,.715])for(const z of [-.8,0,.8])box(g,'#d9c99b',x,1.25,z,.025,.39,.48);
  }
  for(const x of [-.77,.77])for(const z of [-.85,.85]){const m=cylinder(g,'#283a34',x,.35,z,.29,.15);m.rotation.z=Math.PI/2;}
  return g;
}
export function house(parent:THREE.Object3D,x:number,z:number,color:string,scale:number,rotation:number){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;g.scale.setScalar(scale);
  box(g,color,0,1.25,0,2.4,2.5,2.8);
  const roof=new THREE.Mesh(new THREE.CylinderGeometry(1.94,1.94,3.05,3),material('#825747'));roof.rotation.set(Math.PI/2,Math.PI/2,0);roof.position.y=2.63;roof.castShadow=true;g.add(roof);
  box(g,'#604b3b',0,.58,1.41,.48,1.15,.025);
  for(const xx of [-.7,.7])for(const yy of [1,1.95])box(g,'#e5d8ad',xx,yy,1.42,.42,.48,.03);
  for(const zz of [-.8,.65])box(g,'#c7d7d1',1.21,1.8,zz,.03,.5,.5);
  box(g,'#8b7866',.65,3.15,0,.35,1,.4);parent.add(g);return g;
}
