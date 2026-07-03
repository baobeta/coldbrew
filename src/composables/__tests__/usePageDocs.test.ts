import { describe, it, expect, vi } from 'vitest';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

const providers: string[] = [];
vi.mock('y-websocket', () => ({
  WebsocketProvider: class {
    roomname: string;
    awareness = { setLocalStateField() {}, getStates: () => new Map(), on() {}, off() {} };
    constructor(_url: string, room: string) {
      this.roomname = room;
      providers.push(room);
    }
    destroy() {}
    on() {}
    off() {}
  },
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    constructor() {}
    on() {}
    destroy() {}
  },
}));

import { usePageDocs } from '../usePageDocs';

describe('usePageDocs', () => {
  it('opens a page connection on cache miss and returns a fragment', () => {
    const pages = usePageDocs('room1');
    const { ydoc, provider, fragment } = pages.openPage('pageA');
    expect(ydoc).toBeTruthy();
    expect(fragment).toBeTruthy();
    expect(provider).toBeTruthy();
    expect(providers).toContain('writeboard-room1-p-pageA');
  });

  it('reuses the same provider on cache hit (no new connection)', () => {
    providers.length = 0;
    const pages = usePageDocs('room2');
    const first = pages.openPage('p1');
    const second = pages.openPage('p1');
    expect(second.ydoc).toBe(first.ydoc);
    expect(providers.filter((r) => r === 'writeboard-room2-p-p1').length).toBe(1);
  });

  it('evicts the least-recently-used page beyond the cap', () => {
    const pages = usePageDocs('room3');
    ['a', 'b', 'c', 'd', 'e'].forEach((id) => pages.openPage(id));
    expect(pages.__cacheSize()).toBe(4); // cap enforced
    pages.openPage('b'); // touch b (MRU)
    const aAgain = pages.openPage('a'); // 'a' was evicted → new entry
    expect(aAgain).toBeTruthy();
    expect(pages.__cacheSize()).toBe(4);
  });
});
