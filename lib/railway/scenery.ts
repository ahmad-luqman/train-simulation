import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { riverX, height } from './terrain';
export const fields = [
  [-73, 39],
  [-41, 31],
  [60, 65],
  [22, -57],
  [-32, 60],
];
export function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function terrainMaterial(gravel = false) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: !gravel,
    color: gravel ? '#a39b84' : '#ffffff',
    roughness: 0.95,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vTerrain;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTerrain = position;',
      );
    shader.fragmentShader =
      'varying vec3 vTerrain;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float grain = fract(sin(dot(floor(vTerrain.xz * 14.0), vec2(127.1,311.7))) * 43758.5453);
      float patches = sin(vTerrain.x * 0.23) * cos(vTerrain.z * 0.19) * 0.5 + 0.5;
      diffuseColor.rgb *= 0.88 + grain * 0.18;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12,0.95,0.76), patches * 0.3);
    `,
      );
  };
  return mat;
}

// Merge static kits per material: detailed towns cost tens of calls, not thousands.
// Input geometry/material ownership remains with the world resource ledger.
export function batchScenery(
  root: THREE.Object3D,
  exclude: Set<THREE.Object3D>,
) {
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (
      !(o instanceof THREE.Mesh) ||
      o instanceof THREE.InstancedMesh ||
      exclude.has(o) ||
      Array.isArray(o.material) ||
      o.material.transparent
    )
      return;
    const meshes = groups.get(o.material) ?? [];
    meshes.push(o);
    groups.set(o.material, meshes);
  });
  for (const [mat, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((m) => {
      const geo = m.geometry.index
        ? m.geometry.toNonIndexed()
        : m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      // Static kits only need these shared attributes.
      for (const key of Object.keys(geo.attributes))
        if (!['position', 'normal', 'uv'].includes(key))
          geo.deleteAttribute(key);
      return geo;
    });
    const merged = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = true;
    meshes.forEach((m) => m.removeFromParent());
    root.add(mesh);
  }
}
