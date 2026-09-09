import { assertModelEnvelope } from './model-envelope';
import { ENGINE, TENDER } from './safety';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        materials.add(m),
      );
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
export function rigModel(root: THREE.Object3D) {
  const wheels: THREE.Object3D[] = [],
    rods: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) && o.name.startsWith('wheel_'))
      wheels.push(o);
    if (o.name.startsWith('rod_')) {
      rods.push(o);
      o.userData.baseY = o.position.y;
      o.userData.baseZ = o.position.z;
    }
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  root.userData.wheels = wheels;
  root.userData.rods = rods;
  return root;
}
export async function loadShowcase(loader = new GLTFLoader()) {
  // Install only a complete set. A bad/missing LOD leaves the procedural train intact.
  const results = await Promise.allSettled(
    [0, 1, 2].map((i) =>
      loader.loadAsync(`/models/alpine-monarch-lod${i}.glb`),
    ),
  );
  if (results.some((r) => r.status === 'rejected')) {
    results.forEach((r) => {
      if (r.status === 'fulfilled') disposeModel(r.value.scene);
    });
    throw new Error('Showcase unavailable; using procedural locomotive.');
  }
  const engines: THREE.Object3D[] = [],
    tenders: THREE.Object3D[] = [];
  try {
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const scene = result.value.scene;
      const engine = scene.children.find((o) =>
        /^engine(?:[_.]|\d|$)/.test(o.name),
      );
      const tender = scene.children.find((o) =>
        /^tender(?:[_.]|\d|$)/.test(o.name),
      );
      if (
        !engine ||
        !tender ||
        (!engine.getObjectByName('smoke_emitter') &&
          !engine.children.some((o) => o.name.startsWith('smoke_emitter')))
      )
        throw new Error('Invalid showcase asset contract');
      assertModelEnvelope(engine, ENGINE);
      assertModelEnvelope(tender, TENDER);
      engines.push(rigModel(engine));
      tenders.push(rigModel(tender));
    }
  } catch (error) {
    results.forEach((r) => {
      if (r.status === 'fulfilled') disposeModel(r.value.scene);
    });
    throw error;
  }
  return { engines, tenders };
}
