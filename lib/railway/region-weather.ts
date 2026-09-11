import * as THREE from 'three';
import type { conditions } from './region';

// Fixed geometry budget, deterministic positions, no allocation or random state per frame.
export class RegionWeather {
  group = new THREE.Group();
  rain: THREE.LineSegments;
  snow: THREE.Points;
  private rainPositions = new Float32Array(240 * 6);
  private snowPositions = new Float32Array(240 * 3);
  constructor() {
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3),
    );
    this.rain = new THREE.LineSegments(
      rainGeometry,
      new THREE.LineBasicMaterial({
        color: '#a9c6d2',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.snowPositions, 3),
    );
    this.snow = new THREE.Points(
      snowGeometry,
      new THREE.PointsMaterial({
        color: '#eef4f6',
        size: 0.3,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.snow.frustumCulled = false;
    this.group.add(this.rain, this.snow);
  }
  update(
    sky: ReturnType<typeof conditions>,
    elapsed: number,
    target: THREE.Vector3,
    low: boolean,
  ) {
    this.group.position.copy(target);
    this.rain.visible = sky.weather === 'rain';
    this.snow.visible = sky.weather === 'snow';
    if (!this.rain.visible && !this.snow.visible) return;
    const count = low ? 80 : 240;
    for (let i = 0; i < count; i++) {
      const x = ((i * 31.73) % 100) - 50,
        z = ((i * 19.37) % 100) - 50;
      const y =
        (((i * 11.71 - elapsed * (this.snow.visible ? 1.3 : 19)) % 42) + 42) %
        42;
      this.rainPositions.set([x, y, z, x - 0.3, y + 1.8, z], i * 6);
      this.snowPositions.set([x + Math.sin(elapsed * 0.4 + i), y, z], i * 3);
    }
    this.rain.geometry.setDrawRange(0, count * 2);
    this.snow.geometry.setDrawRange(0, count);
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.snow.geometry.attributes.position.needsUpdate = true;
  }
}
