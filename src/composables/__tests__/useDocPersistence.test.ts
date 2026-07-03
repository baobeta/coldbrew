import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

// happy-dom lacks IndexedDB; mock y-indexeddb to a stub that records construction.
const created: string[] = [];
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    name: string;
    constructor(name: string, _doc: Y.Doc) {
      this.name = name;
      created.push(name);
    }
    on() {}
    destroy() {}
  },
}));

import { useDocPersistence } from '../useLocalStorage';

describe('useDocPersistence', () => {
  it('creates an IndexedDB persistence scoped to the room', () => {
    const doc = new Y.Doc();
    const p = useDocPersistence(doc, 'room42');
    expect(created).toContain('writeboard-doc-room42');
    expect(p).toBeTruthy();
  });
});
