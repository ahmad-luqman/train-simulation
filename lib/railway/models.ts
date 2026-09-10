import type { Wagon } from './economy';
import * as THREE from 'three';
const mats = new Map<string, THREE.MeshStandardMaterial>();
export function material(color: string) {
  if (!mats.has(color))
    mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  return mats.get(color)!;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
// Shared triangular extrusion keeps every gable centered above its house.
const roofProfile = new THREE.Shape();
roofProfile.moveTo(-1.4, 0);
roofProfile.lineTo(1.4, 0);
roofProfile.lineTo(0, 1.15);
roofProfile.closePath();
const roofGeo = new THREE.ExtrudeGeometry(roofProfile, {
  depth: 3.05,
  bevelEnabled: false,
});
roofGeo.translate(0, 0, -1.525);
export function box(
  parent: THREE.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) {
  const m = new THREE.Mesh(boxGeo, material(color));
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function cylinder(
  parent: THREE.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  rotation = 0,
) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 12),
    material(color),
  );
  m.position.set(x, y, z);
  m.rotation.x = rotation;
  m.castShadow = true;
  parent.add(m);
  return m;
}
export function locomotive(color: string, id = 0) {
  const g = new THREE.Group();
  g.userData.trainId = id;
  box(g, '#292f2e', 0, 0.52, 0, 1.45, 0.25, 3.8);
  cylinder(g, color, 0, 1.18, -0.4, 0.57, 2.5, Math.PI / 2);
  cylinder(g, '#283630', 0, 1.2, -1.71, 0.48, 0.12, Math.PI / 2);
  box(g, color, 0, 1.38, 1.15, 1.42, 1.42, 1.05);
  box(g, '#243f3a', 0, 2.14, 1.15, 1.7, 0.16, 1.3);
  box(g, '#bad1cc', -0.725, 1.62, 1.13, 0.035, 0.5, 0.55);
  box(g, '#bad1cc', 0.725, 1.62, 1.13, 0.035, 0.5, 0.55);
  cylinder(g, '#293832', 0, 2, -1.17, 0.18, 0.9);
  cylinder(g, '#34453c', 0, 2.48, -1.17, 0.25, 0.13);
  cylinder(g, '#cbb173', 0, 1.87, -0.15, 0.2, 0.3);
  cylinder(g, '#e6c774', 0, 1.35, -1.8, 0.14, 0.1, Math.PI / 2);
  const wheels: THREE.Object3D[] = [];
  for (const x of [-0.76, 0.76])
    for (const z of [-1.15, -0.35, 0.45, 1.22]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, 0.5, z);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.16, 12),
        material('#283a34'),
      );
      m.rotation.z = Math.PI / 2;
      wheel.add(m);
      box(wheel, '#bfbc9c', 0, 0, 0, 0.19, 0.055, 0.68);
      box(wheel, '#bfbc9c', 0, 0, 0, 0.19, 0.68, 0.055);
      g.add(wheel);
      wheels.push(wheel);
    }
  for (const x of [-0.87, 0.87]) box(g, '#b2afa0', x, 0.5, 0, 0.06, 0.07, 2.65);
  g.userData.wheels = wheels;
  return g;
}
export function carriage(
  color: string,
  index: number,
  wagon: Wagon = 'coaches',
) {
  const g = new THREE.Group();
  box(g, '#303a33', 0, 0.48, 0, 1.5, 0.2, 2.65);
  if (index === 0) {
    box(g, color, 0, 1.1, 0, 1.4, 1.05, 2.45);
    box(g, '#222e2b', 0, 1.64, 0, 1.2, 0.15, 2.2);
  } else if (wagon === 'flat') {
    box(g, '#8b6247', 0, 0.64, 0, 1.4, 0.15, 2.45);
    for (const x of [-0.65, 0.65])
      for (const z of [-0.95, 0.95])
        box(g, '#616b56', x, 1.0, z, 0.08, 0.65, 0.08);
  } else if (wagon === 'hopper') {
    for (const x of [-0.65, 0.65])
      box(g, '#656e60', x, 1.07, 0, 0.12, 0.85, 2.4);
    for (const z of [-1.14, 1.14])
      box(g, '#656e60', 0, 1.07, z, 1.4, 0.85, 0.12);
    box(g, '#38423a', 0, 0.8, 0, 1.18, 0.22, 2.2);
  } else {
    box(
      g,
      wagon === 'box' ? '#9b663e' : index % 2 ? '#8b6247' : '#8f5340',
      0,
      1.1,
      0,
      1.4,
      1.05,
      2.45,
    );
    box(g, '#4a5147', 0, 1.69, 0, 1.55, 0.19, 2.65);
    for (const x of [-0.715, 0.715]) {
      if (wagon === 'box') box(g, '#71543e', x, 1.1, 0, 0.025, 0.85, 1.0);
      else
        for (const z of [-0.8, 0, 0.8])
          box(g, '#d9c99b', x, 1.25, z, 0.025, 0.39, 0.48);
    }
  }
  g.userData.wagon = wagon;
  for (const x of [-0.77, 0.77])
    for (const z of [-0.85, 0.85]) {
      const m = cylinder(g, '#283a34', x, 0.35, z, 0.29, 0.15);
      m.rotation.z = Math.PI / 2;
    }
  return g;
}
export function house(
  parent: THREE.Object3D,
  x: number,
  z: number,
  color: string,
  scale: number,
  rotation: number,
) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotation;
  g.scale.setScalar(scale);
  box(g, color, 0, 1.25, 0, 2.4, 2.5, 2.8);
  const roof = new THREE.Mesh(roofGeo, material('#825747'));
  roof.position.y = 2.5;
  roof.castShadow = true;
  g.add(roof);
  box(g, '#604b3b', 0, 0.58, 1.41, 0.48, 1.15, 0.025);
  for (const xx of [-0.7, 0.7])
    for (const yy of [1, 1.95])
      box(g, '#e5d8ad', xx, yy, 1.42, 0.42, 0.48, 0.03);
  for (const zz of [-0.8, 0.65])
    box(g, '#c7d7d1', 1.21, 1.8, zz, 0.03, 0.5, 0.5);
  box(g, '#8b7866', 0.65, 3.15, 0, 0.35, 1, 0.4);
  parent.add(g);
  return g;
}
