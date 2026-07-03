/**
 * Buffers items and flushes them as one batch after `flushMs` of the first
 * queued item. Returns { push, flushNow, dispose }.
 */
export function createCoalescer({ flushMs, onFlush }) {
  let buffer = [];
  let timer = null;

  function flush() {
    timer = null;
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    onFlush(batch);
  }

  return {
    push(item) {
      buffer.push(item);
      if (timer === null) timer = setTimeout(flush, flushMs);
    },
    flushNow() {
      if (timer) { clearTimeout(timer); }
      flush();
    },
    dispose() {
      if (timer) { clearTimeout(timer); timer = null; }
      buffer = [];
    },
  };
}
