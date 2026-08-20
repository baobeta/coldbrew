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
      if (name.includes('boom')) throw new Error('blocked');
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
    const { persistence } = useDocPersistence(doc, 'room42');
    expect(created).toContain('writeboard-doc-room42');
    expect(persistence).toBeTruthy();
  });

  it('exposes an error ref that is false on success', () => {
    const doc = new Y.Doc();
    const { error } = useDocPersistence(doc, 'roomOk');
    expect(error.value).toBe(false);
  });

  it('sets error ref true when persistence construction throws', () => {
    const doc = new Y.Doc();
    const { error, persistence } = useDocPersistence(doc, 'boom');
    expect(error.value).toBe(true);
    expect(persistence).toBeNull();
  });
});
