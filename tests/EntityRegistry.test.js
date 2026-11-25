import { test } from 'node:test';
import assert from 'node:assert/strict';
import EntityRegistry from '../js/sim/EntityRegistry.js';

const entity = (x, y, z, extra = {}) => ({ position: { x, y, z }, ...extra });

test('finds the entities within a radius, across cells and in 3D', () => {
  const registry = new EntityRegistry(2000);
  const near = registry.add(entity(1900, 0, 0));
  const across = registry.add(entity(2100, 0, 0));
  const above = registry.add(entity(0, 5000, 0));
  const far = registry.add(entity(-9000, 0, 9000));
  const found = registry.queryRadius({ x: 2000, y: 0, z: 0 }, 500);
  assert.deepEqual(new Set(found), new Set([near, across]));
  assert.ok(!found.includes(above) && !found.includes(far));
});

test('gives each entity an id and can leave the asking one out', () => {
  const registry = new EntityRegistry(1000);
  const a = registry.add(entity(0, 0, 0));
  const b = registry.add(entity(10, 0, 0));
  assert.notEqual(a.id, b.id);
  assert.deepEqual(registry.queryRadius(a.position, 100, [], a), [b]);
});

test('steps the entities, then reindexes them at their new positions', () => {
  const registry = new EntityRegistry(1000);
  const mover = registry.add(
    entity(0, 0, 0, {
      fixedUpdate(step) {
        this.position.x += 1000 * step;
      },
    }),
  );
  for (let i = 0; i < 10; i++) registry.fixedUpdate(0.5);
  assert.equal(mover.position.x, 5000);
  assert.deepEqual(registry.queryRadius({ x: 5000, y: 0, z: 0 }, 10), [mover]);
  assert.deepEqual(registry.queryRadius({ x: 0, y: 0, z: 0 }, 10), []);
});

test('drops the entities flagged as removed during a step', () => {
  const registry = new EntityRegistry(1000);
  const shortLived = registry.add(
    entity(0, 0, 0, {
      fixedUpdate() {
        this.removed = true;
      },
    }),
  );
  const kept = registry.add(entity(5, 0, 0));
  registry.fixedUpdate(1 / 240);
  assert.deepEqual(registry.entities, [kept]);
  assert.ok(!registry.queryRadius({ x: 0, y: 0, z: 0 }, 100).includes(shortLived));
  registry.remove(kept);
  assert.equal(registry.entities.length, 0);
});

test('handles negative coordinates', () => {
  const registry = new EntityRegistry(2000);
  const e = registry.add(entity(-1, 0, -1));
  assert.deepEqual(registry.queryRadius({ x: 1, y: 0, z: 1 }, 5), [e]);
});
