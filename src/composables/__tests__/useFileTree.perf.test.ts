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

  it('rename does zero forest rebuilds (surgical path)', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => ft.createPage(`P${i}`));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const before = ft.__stats.buildCount;
    ft.rename(ids[0], 'Renamed');
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const delta = ft.__stats.buildCount - before;
    // Surgical in-place update: rename fires zero buildTreeNode calls
    expect(delta).toBe(0);
  });

  it('coalesces multiple edits in one tick into a single rebuild', async () => {
    const before = ft.__stats.syncCount ?? 0;
    ydoc.transact(() => {
      ft.createPage('X');
      ft.createPage('Y');
      ft.createPage('Z');
    });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const delta = (ft.__stats.syncCount ?? 0) - before;
    expect(delta).toBe(1); // one coalesced rebuild, not three
  });

  it('rename touches far fewer nodes than the forest size', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => ft.createPage(`P${i}`));
    await new Promise((r) => requestAnimationFrame(() => r(null))); // let creates settle
    const before = ft.__stats.buildCount;
    ft.rename(ids[50], 'Renamed');
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const delta = ft.__stats.buildCount - before;
    expect(delta).toBeLessThan(10); // was ~100 (full forest) before this task
    expect(ft.tree.value.find((n) => n.id === ids[50])!.title).toBe('Renamed');
  });
});
