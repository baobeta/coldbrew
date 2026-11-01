import { describe, it, expect, beforeEach } from 'vitest';
import {
  canvasToScreen,
  loadView,
  panBy,
  screenToCanvas,
  useViewport,
  zoomAt,
} from '../composables/useViewport';
import { nextTick } from 'vue';

describe('viewport maths', () => {
  it('converts screen to canvas and back at any zoom', () => {
    for (const view of [
      { x: 0, y: 0, zoom: 1 },
      { x: 30, y: -40, zoom: 2.5 },
      { x: -100, y: 7, zoom: 0.25 },
    ]) {
      const [canvasX, canvasY] = screenToCanvas(view, 120, 80);
      const [screenX, screenY] = canvasToScreen(view, canvasX, canvasY);
      expect(screenX).toBeCloseTo(120);
      expect(screenY).toBeCloseTo(80);
    }
  });

  it('pans without changing zoom', () => {
    expect(panBy({ x: 1, y: 2, zoom: 3 }, 10, 20)).toEqual({ x: 11, y: 22, zoom: 3 });
  });

  it('keeps the point under the pointer fixed while zooming', () => {
    const before = { x: 20, y: 30, zoom: 1.5 };
    const after = zoomAt(before, 200, 150, 2);
    expect(after.zoom).toBe(3);
    const [beforeX, beforeY] = screenToCanvas(before, 200, 150);
    const [afterX, afterY] = screenToCanvas(after, 200, 150);
    expect(afterX).toBeCloseTo(beforeX);
    expect(afterY).toBeCloseTo(beforeY);
  });

  it('limits zoom', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 100).zoom).toBe(8);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 0.001).zoom).toBe(0.1);
  });
});

describe('saved view', () => {
  beforeEach(() => localStorage.clear());

  it('saves the view per page and restores it', async () => {
    const { pan } = useViewport('page-a');
    pan(10, 20);
    await nextTick();
    expect(loadView('page-a')).toEqual({ x: 10, y: 20, zoom: 1 });
    expect(loadView('page-b')).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('falls back to the default view on bad saved data', () => {
    localStorage.setItem('writeboard-canvas-view-page-a', '{not json');
    expect(loadView('page-a')).toEqual({ x: 0, y: 0, zoom: 1 });
    localStorage.setItem('writeboard-canvas-view-page-a', '{"x":1,"y":2,"zoom":0}');
    expect(loadView('page-a')).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
