import { tunnelAt } from './structures';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from './simulation';
import {
  railwayGround,
  groundHeight,
  TERRAIN_COLUMNS,
  TERRAIN_ROWS,
} from './rail-earthworks';
import { height, riverX } from './terrain';
import { sample, BERTH_STOP, type Section } from './topology';
import { MAP } from './map';
import {
  PlaneGeometry,
  Raycaster,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  DoubleSide,
} from 'three';

void test('Coalhaven station rails and all physical alignments clear the actual graded ground triangles', () => {
  const sim = new Simulation(),
    before = sim.save(),
    ground = railwayGround(sim.topology.sections.values());
  const berth = sim.topology.sections.get('platform-16')!;
  const front = sample(berth, BERTH_STOP).p;
  assert.ok(
    height(front.x, front.z) > front.y + 0.13,
    'Reproduce the rail buried beneath the natural terrain',
  );
  assert.ok(
    groundHeight(ground, front.x, front.z) < front.y - 0.17,
    'The whole track bed now clears the ground',
  );
  for (const section of sim.topology.sections.values()) {
    for (let d = 0; d <= section.length; d += 0.75) {
      const { p, angle } = sample(section, d);
      const index = section.cumulative.findIndex((at) => at >= d);
      // Tunnel roof is intentionally retained; clearance applies to every open alignment.
      if (
        tunnelAt(section.points, Math.max(0, index), section.kind === 'running')
      )
        continue;
      for (const offset of [-1.35, 0, 1.35]) {
        const y = groundHeight(
          ground,
          p.x + Math.cos(angle) * offset,
          p.z - Math.sin(angle) * offset,
        );
        assert.ok(
          y <= p.y - 0.29,
          `${section.id} buried at ${d.toFixed(2)}: terrain ${y}, rail base ${p.y}`,
        );
      }
    }
  }
  assert.deepEqual(
    sim.save(),
    before,
    'Earthworks do not move tracks, trains, reservations or save state',
  );
});
void test('grading preserves the river and distant terrain, and removing a track restores its cutting', () => {
  const natural = railwayGround([]);
  const section: Pick<Section, 'points' | 'kind'> = {
    kind: 'running',
    points: [
      { x: -230, y: 0.36, z: -60 },
      { x: -210, y: 0.36, z: -40 },
    ],
  };
  const graded = railwayGround([section]);
  assert.ok(groundHeight(graded, -220, -50) < groundHeight(natural, -220, -50));
  let riverVertices = 0;
  for (let row = 0; row <= TERRAIN_ROWS; row++)
    for (let col = 0; col <= TERRAIN_COLUMNS; col++) {
      const index = row * (TERRAIN_COLUMNS + 1) + col,
        x = (col * 2 * MAP.halfWidth) / TERRAIN_COLUMNS - MAP.halfWidth,
        z = (row * 2 * MAP.halfDepth) / TERRAIN_ROWS - MAP.halfDepth;
      assert.ok(graded[index] <= natural[index]);
      if (Math.abs(x - riverX(z)) < 4.3) {
        assert.equal(graded[index], natural[index]);
        riverVertices++;
      }
    }
  assert.ok(riverVertices > 100);
  assert.equal(groundHeight(graded, 0, 0), groundHeight(natural, 0, 0));
  assert.deepEqual(railwayGround([]), natural);
});
void test('scenery height sampling matches the rendered PlaneGeometry surface', () => {
  const sim = new Simulation(),
    ground = railwayGround(sim.topology.sections.values());
  const geometry = new PlaneGeometry(
    MAP.halfWidth * 2,
    MAP.halfDepth * 2,
    TERRAIN_COLUMNS,
    TERRAIN_ROWS,
  );
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground[i]);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.updateMatrixWorld();
  for (const [x, z] of [
    [-200.2, -45.7],
    [-186.5, -34.2],
    [5.2, 7.8],
    [100.1, -190.4],
  ]) {
    const hits = new Raycaster(
      new Vector3(x, 100, z),
      new Vector3(0, -1, 0),
    ).intersectObject(mesh);
    assert.ok(hits.length);
    assert.ok(Math.abs(hits[0].point.y - groundHeight(ground, x, z)) < 1e-4);
  }
  geometry.dispose();
  mesh.material.dispose();
});
