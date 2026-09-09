import { assertModelEnvelope } from './model-envelope';
import { ENGINE, TENDER, WAGON } from './safety';
import { locomotive, carriage } from './models';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadShowcase, disposeModel } from './assets';
import { daylight, qualitySettings, createRiver } from './atmosphere';
import { SteamEffects } from './effects';
import { height, riverX } from './scenery';

class FileLoader extends GLTFLoader {
  override async loadAsync(url: string) {
    const buffer = await readFile(
      new URL('../../public' + url, import.meta.url),
    );
    return this.parseAsync(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
      '',
    );
  }
}
void test('shipped Blender assets load through GLTFLoader with rig, anchors, dimensions and decreasing LOD complexity', async () => {
  const asset = await loadShowcase(new FileLoader());
  const triangles: number[] = [];
  for (let i = 0; i < 3; i++) {
    const engine = asset.engines[i],
      tender = asset.tenders[i];
    engine.updateMatrixWorld(true);
    tender.updateMatrixWorld(true);
    assertModelEnvelope(engine, ENGINE);
    assertModelEnvelope(tender, TENDER);
    const bounds = new THREE.Box3()
      .setFromObject(engine)
      .getSize(new THREE.Vector3());
    assert.ok(bounds.x > 1.5 && bounds.x < 2.3, `width ${bounds.x}`);
    assert.ok(bounds.y > 2 && bounds.y < 3, `height ${bounds.y}`);
    assert.ok(bounds.z > 4 && bounds.z < 5, `length ${bounds.z}`);
    assert.equal(engine.userData.wheels.length, 14);
    assert.equal(tender.userData.wheels.length, 4);
    assert.equal(engine.userData.rods.length, 2);
    let count = 0,
      emitter: THREE.Object3D | undefined;
    engine.traverse((o) => {
      if (o.name.startsWith('smoke_emitter')) emitter = o;
      if (o instanceof THREE.Mesh)
        count +=
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    });
    assert.ok(emitter);
    assert.ok(emitter!.getWorldPosition(new THREE.Vector3()).y > 2.4);
    triangles.push(count);
    disposeModel(engine);
    disposeModel(tender);
  }
  assert.ok(triangles[0] > triangles[1] && triangles[1] > triangles[2]);
});
void test('a failed LOD releases successful loads and rejects the whole replacement', async () => {
  let disposed = 0;
  class BrokenLoader extends GLTFLoader {
    override async loadAsync(url: string) {
      if (url.includes('lod1')) throw new Error('404');
      const scene = new THREE.Group();
      const geo = new THREE.BoxGeometry();
      geo.addEventListener('dispose', () => disposed++);
      scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
      return {
        scene,
        scenes: [scene],
        animations: [],
        cameras: [],
        asset: { version: '2.0' },
        parser: undefined,
        userData: {},
      } as unknown as Awaited<ReturnType<GLTFLoader['loadAsync']>>;
    }
  }
  await assert.rejects(loadShowcase(new BrokenLoader()), /procedural/);
  assert.equal(disposed, 2);
});
void test('particle storage is bounded across all presets and pause freezes matrices', () => {
  const scene = new THREE.Scene(),
    effects = new SteamEffects(scene);
  for (const quality of ['high', 'balanced', 'low'] as const) {
    effects.setQuality(quality);
    for (let i = 0; i < 1000; i++)
      effects.emit(new THREE.Vector3(i, 2, 0), 0.8);
    assert.ok(effects.activeCount <= qualitySettings[quality].particles);
    effects.update(0.2);
    const before = effects.mesh.instanceMatrix.array.slice();
    effects.update(0);
    assert.deepEqual(effects.mesh.instanceMatrix.array, before);
    assert.equal(scene.children.length, 1);
  }
  effects.update(10);
  assert.equal(effects.activeCount, 0);
  disposeModel(scene);
});
void test('night stays lit, daylight is periodic, and riverbanks rise smoothly out of the channel', () => {
  assert.equal(daylight(0).day, 0);
  assert.equal(daylight(12).day, 1);
  assert.ok(Math.abs(daylight(0).sun - daylight(24).sun) < 1e-9);
  const z = 0,
    x = riverX(z);
  assert.equal(height(x, z), -1.7);
  assert.ok(height(x + 5, z) < 0 && height(x + 5, z) > -1.7);
  assert.equal(height(x + 7, z), 0);
  const river = createRiver();
  assert.ok(river.geometry.attributes.position.count > 1000);
  disposeModel(river);
});

void test('all procedural vehicle variants and wheel phases fit the shared physical envelopes', () => {
  for (let id = 0; id < 12; id++) {
    const model = locomotive('#456f60', id);
    for (let phase = 0; phase < Math.PI * 2; phase += Math.PI / 8) {
      for (const wheel of model.userData.wheels as THREE.Object3D[])
        wheel.rotation.x = phase;
      assertModelEnvelope(model, ENGINE);
    }
    disposeModel(model);
  }
  for (let index = 0; index <= 6; index++) {
    const model = carriage('#456f60', index);
    assertModelEnvelope(model, index === 0 ? TENDER : WAGON);
    disposeModel(model);
  }
});
