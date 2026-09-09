import * as THREE from 'three';
import { rng } from './scenery';
import { qualitySettings, type Quality } from './atmosphere';

export class SteamEffects {
  private random = rng(409);
  private cursor = 0;
  limit = 144;
  readonly capacity = 240;
  private particles = Array.from({ length: this.capacity }, () => ({
    age: 10,
    life: 3,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    steam: false,
  }));
  private alpha = new THREE.InstancedBufferAttribute(
    new Float32Array(this.capacity),
    1,
  );
  private dummy = new THREE.Object3D();
  mesh: THREE.InstancedMesh;
  constructor(scene: THREE.Scene) {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    geometry.setAttribute('particleAlpha', this.alpha);
    const material = new THREE.MeshLambertMaterial({
      color: '#e6e4dc',
      transparent: true,
      depthWrite: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'attribute float particleAlpha; varying float vAlpha;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvAlpha = particleAlpha;',
        );
      shader.fragmentShader =
        'varying float vAlpha;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.a *= vAlpha;',
        );
    };
    this.mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.update(0);
  }
  setQuality(quality: Quality) {
    this.limit = qualitySettings[quality].particles;
    this.particles.forEach((p, i) => {
      if (i >= this.limit) p.age = p.life;
    });
    this.update(0);
  }
  emit(position: THREE.Vector3, effort: number, steam = false) {
    const p = this.particles[this.cursor++ % this.limit];
    p.position.copy(position);
    p.age = 0;
    p.life = steam ? 1.2 : 2.6 + effort;
    p.steam = steam;
    p.velocity.set(
      0.35 + this.random() * 0.4,
      steam ? 0.6 : 1.1 + effort,
      steam ? (this.random() - 0.5) * 2 : 0.2,
    );
  }
  update(delta: number) {
    this.particles.forEach((p, i) => {
      p.age += delta;
      const active = p.age < p.life && i < this.limit;
      if (active) p.position.addScaledVector(p.velocity, delta);
      this.dummy.position.copy(p.position);
      this.dummy.scale.setScalar(
        active ? 0.16 + p.age * (p.steam ? 0.5 : 0.45) : 0.0001,
      );
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.alpha.setX(
        i,
        active ? (p.steam ? 0.3 : 0.38) * (1 - p.age / p.life) : 0,
      );
    });
    this.alpha.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  get activeCount() {
    return this.particles.filter((p) => p.age < p.life).length;
  }
}
