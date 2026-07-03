import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import { useFileTree } from '../useFileTree';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

function mockProvider() {
  return {
    awareness: { setLocalStateField() {}, getStates: () => new Map(), on() {} },
    on(_e: string, cb: (d: any) => void) {
      cb(true);
    },
  };
}

describe('useFileTree perf', () => {
  let ydoc: Y.Doc;
  let ft: ReturnType<typeof useFileTree>;

  beforeEach(() => {
    ydoc = new Y.Doc();
    ft = useFileTree(ydoc, mockProvider());
  });

  it('exposes a build counter for profiling', () => {
    expect(ft.__stats).toBeDefined();
    expect(typeof ft.__stats.buildCount).toBe('number');
  });

  it('counts node builds during a rename (baseline)', () => {
    const ids = Array.from({ length: 10 }, (_, i) => ft.createPage(`P${i}`));
    const before = ft.__stats.buildCount;
    ft.rename(ids[0], 'Renamed');
    const delta = ft.__stats.buildCount - before;
    expect(delta).toBeGreaterThan(0);
  });
});
