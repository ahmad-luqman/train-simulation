import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { FollowCamera, trainCameraTarget } from './follow-camera';
import { Simulation } from './simulation';

function camera(iso = true) {
  const c = iso
    ? new OrthographicCamera(-120, 120, 90, -90, 0.1, 1800)
    : new PerspectiveCamera(43, 4 / 3, 0.1, 1800);
  c.position.set(336, 372, 420);
  c.lookAt(0, 0, -7);
  c.updateProjectionMatrix();
  return c;
}
void test('queued Alpine Monarch has no follow target; waiting never moves or zooms either camera', () => {
  const sim = new Simulation();
  assert.equal(sim.trains[10].motion.physical.queued, true);
  assert.equal(trainCameraTarget(sim, 10), null);
  assert.equal(trainCameraTarget(sim, 99), null);
  for (const iso of [true, false]) {
    const c = camera(iso),
      focus = new Vector3(0, 0, -7),
      follow = new FollowCamera();
    const position = c.position.clone(),
      initialFocus = focus.clone(),
      zoom = c.zoom;
    follow.request();
    for (let i = 0; i < 600; i++)
      follow.update(c, focus, trainCameraTarget(sim, 10), 1 / 60);
    assert.deepEqual(c.position, position);
    assert.deepEqual(focus, initialFocus);
    assert.equal(c.zoom, zoom);
  }
});
void test('follow automatically acquires the actual locomotive berth when a queued train appears', () => {
  const sim = new Simulation(),
    follow = new FollowCamera(),
    c = camera(),
    focus = new Vector3(0, 0, -7);
  sim.trains.forEach((t) => (t.held = t.id !== 10));
  follow.request();
  follow.update(c, focus, trainCameraTarget(sim, 10), 1 / 60);
  for (let tick = 0; tick < 1000 && !sim.visible(sim.trains[10]); tick++)
    sim.step(0.05);
  assert.equal(sim.visible(sim.trains[10]), true);
  const subject = trainCameraTarget(sim, 10)!;
  const p = sim.vehiclePosition(sim.trains[10], 0).p;
  assert.deepEqual(subject.toArray(), [p.x, p.y, p.z]);
  const station = sim.network.nodes.find((n) => n.id === 0)!;
  assert.ok(
    subject.distanceTo(new Vector3(station.x, station.y, station.z)) > 1,
    'Use the physical berth, not the station placeholder',
  );
  for (let i = 0; i < 180; i++) follow.update(c, focus, subject, 1 / 60);
  c.lookAt(focus);
  c.updateMatrixWorld();
  const screen = subject.clone().project(c);
  assert.ok(
    Math.abs(screen.x) < 0.01 && Math.abs(screen.y) < 0.01,
    'The visible engine is centered on screen',
  );
  assert.ok(c.zoom > 1);
});
void test('switching to a queued train preserves framing, then reacquires its visible position', () => {
  for (const iso of [true, false]) {
    const c = camera(iso),
      focus = new Vector3(),
      follow = new FollowCamera(),
      first = new Vector3(-140, 2, 55),
      next = new Vector3(160, 3, -110);
    for (let i = 0; i < 180; i++) follow.update(c, focus, first, 1 / 60);
    const position = c.position.clone(),
      oldFocus = focus.clone(),
      zoom = c.zoom;
    follow.request();
    for (let i = 0; i < 120; i++) follow.update(c, focus, null, 1 / 60);
    assert.deepEqual(c.position, position);
    assert.deepEqual(focus, oldFocus);
    assert.equal(c.zoom, zoom);
    for (let i = 0; i < 180; i++) follow.update(c, focus, next, 1 / 60);
    c.lookAt(focus);
    c.updateMatrixWorld();
    const screen = next.clone().project(c);
    assert.ok(Math.abs(screen.x) < 0.01 && Math.abs(screen.y) < 0.01);
  }
});
void test('follow zoom is smooth, framing is independent of frame rate, and moving trains retain manual zoom', () => {
  const results = [];
  for (const fps of [30, 60, 120]) {
    const c = camera(),
      focus = new Vector3(),
      follow = new FollowCamera(),
      subject = new Vector3(90, 1, -120);
    follow.update(c, focus, subject, 1 / fps);
    assert.ok(c instanceof OrthographicCamera);
    assert.ok(
      c.zoom > 1 && c.zoom < c.top / 17.2,
      'Do not immediately magnify the previous camera target',
    );
    for (let i = 1; i < 3 * fps; i++) follow.update(c, focus, subject, 1 / fps);
    assert.ok(focus.distanceTo(subject) < 0.001);
    results.push(focus.clone());
    c.zoom = 8;
    const offset = c.position.clone().sub(focus);
    for (let i = 0; i < fps; i++) {
      subject.x += 0.1;
      follow.update(c, focus, subject, 1 / fps);
    }
    assert.equal(c.zoom, 8);
    assert.ok(c.position.clone().sub(focus).distanceTo(offset) < 1e-8);
  }
  assert.ok(results[0].distanceTo(results[2]) < 1e-8);
});
