import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SaveStore, parseRailway, AUTO_SLOTS } from './save-store';
import { Simulation } from './simulation';
import { advance, sameSave } from './test-helpers';
class MemoryStorage {
  data = new Map<string, string>();
  fail = false;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error('Quota exceeded');
    this.data.set(key, value);
  }
}
void test('manual slots round-trip independently and portable imports preserve physical authority', async () => {
  const storage = new MemoryStorage(),
    store = new SaveStore(storage),
    sim = new Simulation();
  advance(sim, 15);
  await store.write('manual-1', sim.save(), 'First');
  const saved = new Simulation();
  saved.restore((await store.load('manual-1')).state);
  sameSave(sim, saved);
  advance(sim, 10);
  await store.write('manual-2', sim.save(), 'Second');
  assert.notEqual(
    (await store.load('manual-1')).state.elapsed,
    (await store.load('manual-2')).state.elapsed,
  );
  const imported = new Simulation();
  imported.restore(parseRailway(JSON.stringify(sim.save())));
  sameSave(sim, imported);
});
void test('quota/interrupted write retains prior generation and corrupt newest copy recovers', async () => {
  const storage = new MemoryStorage(),
    store = new SaveStore(storage),
    sim = new Simulation();
  await store.write('manual-1', sim.save(), 'Original');
  storage.fail = true;
  advance(sim, 1);
  await assert.rejects(() =>
    store.write('manual-1', sim.save(), 'Interrupted'),
  );
  assert.equal((await store.load('manual-1')).name, 'Original');
  storage.fail = false;
  await store.write('manual-1', sim.save(), 'Newer');
  const newest = [...storage.data.keys()].find((k) => k.endsWith(':1'))!;
  storage.data.set(newest, '{interrupted');
  assert.equal((await store.load('manual-1')).name, 'Original');
  await store.write('manual-1', sim.save(), 'Repaired');
  assert.equal((await store.load('manual-1')).name, 'Repaired');
});
void test('physically invalid latest generation falls back and invalid imports never mutate the live railway', async () => {
  const storage = new MemoryStorage(),
    store = new SaveStore(storage),
    sim = new Simulation();
  await store.write('manual-1', sim.save(), 'Valid');
  const corrupt = sim.save();
  corrupt.treasury = Number.NaN;
  await store.write('manual-1', corrupt, 'Invalid');
  assert.equal((await store.load('manual-1')).name, 'Valid');
  const before = JSON.stringify(sim.save());
  assert.throws(() => parseRailway(JSON.stringify(corrupt)));
  assert.throws(() => parseRailway('{'));
  assert.throws(() => parseRailway(JSON.stringify({ version: 99 })));
  assert.equal(JSON.stringify(sim.save()), before);
});
void test('autosaves rotate without touching manual, recovery or legacy saves', async () => {
  const storage = new MemoryStorage(),
    store = new SaveStore(storage),
    sim = new Simulation();
  const legacy = JSON.stringify(sim.save());
  storage.setItem('steam-atlas-save-v8', legacy);
  await store.write('manual-1', sim.save(), 'Manual');
  await store.write('recovery', sim.save(), 'Before load');
  for (let i = 0; i < 7; i++) {
    advance(sim, 1);
    await store.autosave(sim.save());
  }
  assert.equal(
    (await store.list()).filter((e) =>
      AUTO_SLOTS.includes(e.slot as (typeof AUTO_SLOTS)[number]),
    ).length,
    3,
  );
  assert.equal((await store.load('manual-1')).state.elapsed, 0);
  assert.equal((await store.load('recovery')).state.elapsed, 0);
  assert.equal(storage.getItem('steam-atlas-save-v8'), legacy);
  assert.ok(
    Math.max(
      ...(await Promise.all(
        AUTO_SLOTS.map(async (s) => (await store.load(s)).state.elapsed),
      )),
    ) > 6,
  );
  assert.equal((await store.legacy()).elapsed, 0);
});
void test('legacy fallback skips corrupt newest save and preserves all source bytes', async () => {
  const storage = new MemoryStorage(),
    store = new SaveStore(storage),
    sim = new Simulation();
  storage.setItem('steam-atlas-save-v8', 'broken');
  storage.setItem('steam-atlas-save-v7', JSON.stringify(sim.save()));
  assert.equal((await store.legacy()).version, 8);
  assert.equal(storage.getItem('steam-atlas-save-v8'), 'broken');
});
void test('frozen historical v5–v8 files migrate without moving physical trains or changing cash', async () => {
  for (const version of [5, 6, 7, 8]) {
    const text = gunzipSync(
      readFileSync(
        new URL(`./fixtures/release-v${version}.json.gz`, import.meta.url),
      ),
    ).toString();
    const original = JSON.parse(text);
    assert.equal(original.version, version);
    const migrated = parseRailway(text);
    assert.equal(migrated.version, 8);
    assert.equal(migrated.treasury, original.treasury);
    assert.deepEqual(
      migrated.network,
      version < 7
        ? { ...original.network, baseline: 'valley' }
        : original.network,
    );
    migrated.trains.forEach((train, i) =>
      assert.deepEqual(
        train.motion.physical,
        original.trains[i].motion.physical,
      ),
    );
    const sim = new Simulation();
    sim.restore(migrated);
    advance(sim, 2);
    const store = new SaveStore(new MemoryStorage());
    await store.write('manual-1', sim.save(), `Migrated v${version}`);
    assert.deepEqual((await store.load('manual-1')).state, sim.save());
  }
});
void test('save completion waits for storage commit and asynchronous failure keeps the older copy', async () => {
  const memory = new MemoryStorage();
  let finish: (() => void) | undefined;
  let fail = false;
  const store = new SaveStore({
    getItem: (key) => memory.getItem(key),
    setItem: async (key, value) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      if (fail) throw new Error('Transaction aborted');
      memory.setItem(key, value);
    },
  });
  const sim = new Simulation();
  let completed = false;
  const write = store.write('manual-1', sim.save(), 'Committed').then(() => {
    completed = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal((await store.list()).length, 0);
  finish!();
  await write;
  fail = true;
  const failed = assert.rejects(store.write('manual-1', sim.save(), 'Aborted'));
  await new Promise((resolve) => setImmediate(resolve));
  finish!();
  await failed;
  assert.equal((await store.load('manual-1')).name, 'Committed');
});
void test('legacy layout support still rejects missing protected tracks and unknown baseline markers atomically', () => {
  const original = parseRailway(
    gunzipSync(
      readFileSync(new URL('./fixtures/release-v6.json.gz', import.meta.url)),
    ).toString(),
  );
  const sim = new Simulation();
  const before = sim.save();
  const missing = structuredClone(original);
  missing.network.edges.splice(0, 1);
  assert.throws(() => sim.restore(missing));
  assert.deepEqual(sim.save(), before);
  const unknown = structuredClone(original) as unknown as {
    network: { baseline: string };
  };
  unknown.network.baseline = 'invented';
  assert.throws(() => sim.restore(unknown));
  assert.deepEqual(sim.save(), before);
});
