import * as THREE from 'three';
import { locomotive, carriage } from './models';
import { locomotives } from './data';
let cachedPortraits: string[] | undefined;
export function makePortraits() {
  if (cachedPortraits) return cachedPortraits;
  const geometries = new Set<THREE.BufferGeometry>();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  try {
    renderer.setSize(440, 180);
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight('#fff8e7', 2));
    const light = new THREE.DirectionalLight('#fff8e7', 3);
    light.position.set(7, 9, -8);
    scene.add(light);
    const camera = new THREE.OrthographicCamera(
      -5.3,
      5.3,
      2.17,
      -2.17,
      0.1,
      100,
    );
    camera.position.set(18, 6, -0.8);
    camera.lookAt(0, 1, 1.1);
    const images = locomotives.map((l, i) => {
      const train = locomotive(l.color, i),
        tender = carriage(l.color, 0);
      tender.position.z = 3.5;
      scene.add(train, tender);
      for (const model of [train, tender])
        model.traverse((o) => {
          if (o instanceof THREE.Mesh && o.geometry.type !== 'BoxGeometry')
            geometries.add(o.geometry);
        });
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      scene.remove(train, tender);
      return url;
    });
    cachedPortraits = images;
    return images;
  } finally {
    geometries.forEach((geometry) => geometry.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
