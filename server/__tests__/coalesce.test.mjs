import { test } from 'node:test';
import assert from 'node:assert';
import { createCoalescer } from '../coalesce.mjs';

test('coalesces multiple pushes into one flush', async () => {
  const flushed = [];
  const c = createCoalescer({ flushMs: 5, onFlush: (batch) => flushed.push(batch) });
  c.push('a'); c.push('b'); c.push('c');
  await new Promise((r) => setTimeout(r, 15));
  assert.strictEqual(flushed.length, 1);
  assert.deepStrictEqual(flushed[0], ['a', 'b', 'c']);
});

test('separate bursts flush separately', async () => {
  const flushed = [];
  const c = createCoalescer({ flushMs: 5, onFlush: (b) => flushed.push(b) });
  c.push('a');
  await new Promise((r) => setTimeout(r, 15));
  c.push('b');
  await new Promise((r) => setTimeout(r, 15));
  assert.strictEqual(flushed.length, 2);
});

test('dispose cancels pending flush', async () => {
  const flushed = [];
  const c = createCoalescer({ flushMs: 5, onFlush: (b) => flushed.push(b) });
  c.push('a');
  c.dispose();
  await new Promise((r) => setTimeout(r, 15));
  assert.strictEqual(flushed.length, 0);
});
