// Set LEVELDB_PATH BEFORE importing persistence.mjs (module singleton keyed off env).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { test, after } from 'node:test';
import assert from 'node:assert';
import * as Y from 'yjs';

const TEST_DB = join(tmpdir(), `.test-db-persist-${process.pid}`);
process.env.LEVELDB_PATH = TEST_DB;

// Dynamic import AFTER setting env so the singleton picks up the test path.
const { loadRoom, storeRoom, closePersistence } = await import('../persistence.mjs');

after(async () => {
  await closePersistence();
  await rm(TEST_DB, { recursive: true, force: true });
});

test('round-trip: store Y.Text content and reload into a fresh doc', async () => {
  const docA = new Y.Doc();
  docA.getText('content').insert(0, 'hello');

  await storeRoom('test-room', docA);

  const docB = new Y.Doc();
  await loadRoom('test-room', docB);

  assert.strictEqual(docB.getText('content').toString(), 'hello');
});

test('round-trip: multiple stores accumulate correctly', async () => {
  const docA = new Y.Doc();
  docA.getText('notes').insert(0, 'world');
  await storeRoom('room-multi', docA);

  docA.getText('notes').insert(5, '!');
  await storeRoom('room-multi', docA);

  const docB = new Y.Doc();
  await loadRoom('room-multi', docB);

  assert.strictEqual(docB.getText('notes').toString(), 'world!');
});

test('loadRoom on missing room is a no-op (empty doc stays empty)', async () => {
  const doc = new Y.Doc();
  await loadRoom('nonexistent-room-xyz', doc);
  assert.strictEqual(doc.getText('x').toString(), '');
});

test('compaction: >100 stores still round-trip correctly', async () => {
  // Trigger the COMPACT_EVERY=100 flush threshold and confirm data integrity.
  const docA = new Y.Doc();
  docA.getText('log').insert(0, 'start');

  // Store 105 times to cross the compaction threshold (100) at least once.
  for (let i = 0; i < 105; i++) {
    docA.getText('log').insert(docA.getText('log').length, `${i}`);
    await storeRoom('room-compact', docA);
  }

  const docB = new Y.Doc();
  await loadRoom('room-compact', docB);

  // The loaded doc should match the final state of docA exactly.
  assert.strictEqual(docB.getText('log').toString(), docA.getText('log').toString());
});
