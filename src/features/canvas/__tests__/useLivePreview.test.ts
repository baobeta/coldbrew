import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useLivePreview } from '../composables/useLivePreview';
import type { InkPoint, StrokeStyle } from '../types';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

const style: StrokeStyle = { tool: 'pen', color: '#000000', size: 4, simulatePressure: false };
const point = (x: number): InkPoint => [x, 0, 0.5];

function createAwareness() {
  const states = new Map<number, any>();
  let listener: ((change: any) => void) | null = null;
  return {
    clientID: 1,
    states,
    setLocalStateField: vi.fn(),
    getStates: () => states,
    on: (_event: string, cb: (change: any) => void) => (listener = cb),
    off: vi.fn(),
    remote(clientId: number, ink: unknown) {
      const isNew = !states.has(clientId);
      states.set(clientId, { ink });
      listener?.({ added: isNew ? [clientId] : [], updated: isNew ? [] : [clientId], removed: [] });
    },
    leave(clientId: number) {
      states.delete(clientId);
      listener?.({ added: [], updated: [], removed: [clientId] });
    },
  };
}

describe('useLivePreview', () => {
  let awareness: ReturnType<typeof createAwareness>;
  let onChange: Mock<() => void>;

  beforeEach(() => {
    awareness = createAwareness();
    onChange = vi.fn<() => void>();
  });

  it('accumulates chunks from another user', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(2, { ...style, id: 's1', pts: [point(1)] });
    awareness.remote(2, { ...style, id: 's1', pts: [point(2)] });
    expect(previews.value.get(2)!.points).toEqual([point(1), point(2)]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a chunk when another user changes', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(2, { ...style, id: 's1', pts: [point(1)] });
    awareness.remote(3, null);
    expect(previews.value.get(2)!.points).toEqual([point(1)]);
  });

  it('starts fresh on a new stroke id', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(2, { ...style, id: 's1', pts: [point(1)] });
    awareness.remote(2, { ...style, id: 's2', pts: [point(9)] });
    expect(previews.value.get(2)!.points).toEqual([point(9)]);
  });

  it('removes a preview when the stroke ends or the user leaves', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(2, { ...style, id: 's1', pts: [point(1)] });
    awareness.remote(2, null);
    expect(previews.value.has(2)).toBe(false);
    awareness.remote(3, { ...style, id: 's2', pts: [point(1)] });
    awareness.leave(3);
    expect(previews.value.has(3)).toBe(false);
  });

  it('ignores your own awareness changes', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(1, { ...style, id: 's1', pts: [point(1)] });
    expect(previews.value.size).toBe(0);
  });

  it('sends only new points, at most every 50 ms', () => {
    const { publish } = useLivePreview(awareness, onChange);
    const takeUnsent = vi.fn(() => [point(1)]);
    publish('s1', style, takeUnsent, 1000);
    publish('s1', style, takeUnsent, 1020);
    publish('s1', style, takeUnsent, 1050);
    expect(takeUnsent).toHaveBeenCalledTimes(2);
    expect(awareness.setLocalStateField).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when there are no new points', () => {
    const { publish } = useLivePreview(awareness, onChange);
    publish('s1', style, () => [], 1000);
    expect(awareness.setLocalStateField).not.toHaveBeenCalled();
  });

  it('clears the local preview', () => {
    const { clear } = useLivePreview(awareness, onChange);
    clear();
    expect(awareness.setLocalStateField).toHaveBeenCalledWith('ink', null);
  });
});
