import * as THREE from 'three';
import { box, cylinder, house } from './models';
import type { City } from './data';

export function stationKit(parent: THREE.Group, city: City, grand: boolean) {
  const g = new THREE.Group();
  g.position.set(city.x, 0, city.z - 4);
  parent.add(g);
  box(g, '#c7b897', 0, 0.35, 1.4, grand ? 16 : 10, 0.7, 2.6);
  box(g, '#526962', 0, 2.9, 1.4, grand ? 15 : 9, 0.17, 3);
  for (let x = -4; x <= 4; x += 2) {
    box(g, '#43564f', x, 1.8, 1.4, 0.13, 2.2, 0.13);
    box(g, '#e5d6b0', x, 2.5, 1.4, 0.6, 0.1, 0.25);
  }
  house(g, 0, -1, city.color, 1, 0);
  for (const x of [-3, 3]) {
    box(g, '#735d48', x, 1, 2, 0.9, 0.12, 0.35);
    box(g, '#735d48', x, 1.25, 2.15, 0.9, 0.45, 0.08);
  }
  box(g, '#2d4945', 0, 2.25, 2.92, 1.8, 0.4, 0.07);
  if (grand) {
    for (const x of [-4.4, 4.4]) house(g, x, -1, city.color, 1.3, 0);
    box(g, '#bca584', 0, 4, -1, 1.6, 4, 1.6);
    cylinder(g, '#ece2c9', 0, 5.3, -0.17, 0.52, 0.08, Math.PI / 2);
    box(g, '#344843', 0, 5.43, -0.11, 0.06, 0.3, 0.03);
    box(g, '#344843', 0.13, 5.3, -0.11, 0.32, 0.06, 0.03);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.45, 1.4, 4),
      new THREE.MeshStandardMaterial({ color: '#47675e', roughness: 0.75 }),
    );
    roof.position.set(0, 6.6, -1);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
  }
}
export function warehouseKit(
  parent: THREE.Group,
  x: number,
  z: number,
  color = '#997a61',
) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  box(g, color, 0, 1.6, 0, 5, 3.2, 4);
  box(g, '#536461', 0, 3.3, 0, 5.5, 0.25, 4.5);
  for (const xx of [-1.4, 1.4]) {
    box(g, '#544b3c', xx, 1.1, 2.02, 1.6, 2.2, 0.06);
    box(g, '#b7a17a', xx, 0.22, 2.65, 1.8, 0.4, 1.2);
  }
  for (let i = 0; i < 3; i++)
    box(g, '#ac8657', 3, 0.4 + i * 0.6, 0.5, 0.7, 0.6, 0.8);
  return g;
}
export function industryKit(parent: THREE.Group, city: City, index: number) {
  const x = city.x - 5,
    z = city.z + 17;
  if (city.cargo === 'Coal') {
    warehouseKit(parent, x, z, '#77756a');
    for (const dx of [-3, 3]) {
      box(parent, '#4c5953', x + dx, 4, z, 0.3, 8, 0.3);
      box(parent, '#4c5953', x + dx, 4, z + 3, 0.3, 8, 0.3);
    }
    box(parent, '#4c5953', x, 7.7, z, 7, 0.3, 1);
    cylinder(parent, '#9b8b64', x, 6.5, z, 0.95, 0.25, Math.PI / 2);
    const coal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2, 1),
      new THREE.MeshStandardMaterial({ color: '#383b36', roughness: 1 }),
    );
    coal.position.set(x + 6, 0.5, z);
    coal.scale.y = 0.6;
    coal.castShadow = true;
    parent.add(coal);
  } else if (city.cargo === 'Timber') {
    warehouseKit(parent, x, z, '#aa9064');
    for (let i = 0; i < 12; i++)
      cylinder(
        parent,
        '#9f784c',
        x + 6 + (i % 3) * 0.55,
        0.35 + Math.floor(i / 3) * 0.5,
        z,
        0.26,
        4,
        Math.PI / 2,
      );
    box(parent, '#624c36', x + 7, 2.8, z, 3, 0.15, 5);
  } else if (city.cargo === 'Grain') {
    warehouseKit(parent, x, z, '#c4ae7a');
    for (let i = 0; i < (index === 6 ? 3 : 2); i++) {
      cylinder(parent, '#d2c6a4', x + 5 + i * 2.1, 2.5, z, 0.95, 5);
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(1, 1, 12),
        new THREE.MeshStandardMaterial({ color: '#7c8775' }),
      );
      cap.position.set(x + 5 + i * 2.1, 5.5, z);
      parent.add(cap);
    }
  } else if (city.cargo === 'Goods') {
    warehouseKit(parent, x, z, '#986c54');
    warehouseKit(parent, x + 6, z, '#b39979');
    cylinder(parent, '#94745a', x - 2, 5.5, z, 0.45, 7);
    box(parent, '#555f56', x + 6, 5.7, z, 0.2, 5, 0.2);
    box(parent, '#555f56', x + 8, 8, z, 4, 0.2, 0.2);
    box(parent, '#555f56', x + 9.7, 7, z, 0.06, 2, 0.06);
  } else {
    house(parent, x, z, index === 1 ? '#c8bfa6' : '#b3836c', 1.5, 0);
    box(parent, '#b7b296', x, 4, z, 1.7, 5, 1.7);
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, index === 1 ? 4 : 2, 4),
      new THREE.MeshStandardMaterial({ color: '#485c55' }),
    );
    spire.position.set(x, index === 1 ? 8 : 7, z);
    spire.rotation.y = Math.PI / 4;
    parent.add(spire);
  }
}
