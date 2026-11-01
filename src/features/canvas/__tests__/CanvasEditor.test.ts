import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import * as Y from 'yjs';
import CanvasEditor from '../components/CanvasEditor.vue';
import { decodePoints } from '../strokeCodec';
import type { StrokeRecord } from '../types';

function createContext(canvas: HTMLCanvasElement) {
  return {
    canvas,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    globalAlpha: 1,
    fillStyle: '',
  };
}

function createAwareness() {
  return {
    clientID: 1,
    setLocalStateField: vi.fn(),
    getStates: () => new Map(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

describe('CanvasEditor', () => {
  let strokes: Y.Array<StrokeRecord>;
  let awareness: ReturnType<typeof createAwareness>;
  let wrapper: ReturnType<typeof mount>;

  const surface = () => wrapper.find('[data-test="canvas-surface"]');

  async function draw(points: [number, number][], pressure = 0.2) {
    const [first, ...rest] = points;
    await surface().trigger('pointerdown', {
      button: 0,
      pointerId: 1,
      clientX: first[0],
      clientY: first[1],
      pressure,
    });
    for (const [clientX, clientY] of rest) {
      await surface().trigger('pointermove', {
        buttons: 1,
        pointerId: 1,
        clientX,
        clientY,
        pressure,
      });
    }
    await surface().trigger('pointerup', { button: 0, pointerId: 1 });
  }

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('Path2D', vi.fn());
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return createContext(this) as any;
    });
    strokes = new Y.Doc().getArray('strokes');
    awareness = createAwareness();
    wrapper = mount(CanvasEditor, {
      props: { pageId: 'page', strokes, provider: { awareness } },
      attachTo: document.body,
    });
  });

  afterEach(() => {
    wrapper.unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves one stroke on pointer up, using real pressure from a mouse-type pointer', async () => {
    await draw([
      [10, 10],
      [20, 20],
      [30, 30],
    ]);
    expect(strokes.length).toBe(1);
    const stroke = strokes.get(0);
    expect(stroke.simulatePressure).toBe(false);
    expect(decodePoints(stroke.pts).length).toBe(3);
  });

  it('simulates pressure for a normal mouse', async () => {
    await draw(
      [
        [10, 10],
        [20, 20],
      ],
      0.5,
    );
    expect(strokes.get(0).simulatePressure).toBe(true);
  });

  it('does not write to the document until the stroke ends', async () => {
    await surface().trigger('pointerdown', { button: 0, clientX: 1, clientY: 1, pressure: 0.2 });
    await surface().trigger('pointermove', { buttons: 1, clientX: 9, clientY: 9, pressure: 0.2 });
    expect(strokes.length).toBe(0);
  });

  it('sends live points through awareness and clears them at the end', async () => {
    await draw([
      [10, 10],
      [20, 20],
    ]);
    const calls = awareness.setLocalStateField.mock.calls;
    expect(calls[0][0]).toBe('ink');
    expect(calls[0][1].pts.length).toBeGreaterThan(0);
    expect(calls.at(-1)).toEqual(['ink', null]);
  });

  it('keeps the stroke when the pointer is cancelled', async () => {
    await surface().trigger('pointerdown', { button: 0, clientX: 1, clientY: 1, pressure: 0.2 });
    await surface().trigger('pointercancel');
    expect(strokes.length).toBe(1);
  });

  it('keeps the stroke when the window loses focus', async () => {
    await surface().trigger('pointerdown', { button: 0, clientX: 1, clientY: 1, pressure: 0.2 });
    window.dispatchEvent(new Event('blur'));
    expect(strokes.length).toBe(1);
  });

  it('keeps the stroke when the page changes mid-stroke', async () => {
    const other = mount(CanvasEditor, {
      props: { pageId: 'other', strokes, provider: { awareness } },
      attachTo: document.body,
    });
    await other
      .find('[data-test="canvas-surface"]')
      .trigger('pointerdown', { button: 0, clientX: 1, clientY: 1, pressure: 0.2 });
    other.unmount();
    expect(strokes.length).toBe(1);
  });

  it('ignores the right button', async () => {
    await surface().trigger('pointerdown', { button: 2, clientX: 1, clientY: 1, pressure: 0.2 });
    await surface().trigger('pointerup', { button: 2 });
    expect(strokes.length).toBe(0);
  });

  it('erases a stroke the eraser touches', async () => {
    await draw([
      [10, 10],
      [50, 10],
    ]);
    await wrapper.find('[data-test="tool-eraser"]').trigger('click');
    await draw([[30, 12]]);
    expect(strokes.length).toBe(0);
  });

  it('undoes with the keyboard', async () => {
    await draw([
      [10, 10],
      [50, 10],
    ]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    expect(strokes.length).toBe(0);
  });

  it('pans instead of drawing while space is held', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    await draw([
      [10, 10],
      [50, 40],
    ]);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    expect(strokes.length).toBe(0);
    await wrapper.vm.$nextTick();
    expect(JSON.parse(localStorage.getItem('writeboard-canvas-view-page')!)).toEqual({
      x: 40,
      y: 30,
      zoom: 1,
    });
  });

  it('switches tools from the keyboard', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    await draw([
      [10, 10],
      [50, 10],
    ]);
    expect(strokes.get(0).tool).toBe('highlighter');
  });

  it('does not draw when pressing the toolbar', async () => {
    await wrapper.find('[data-test="canvas-toolbar"]').trigger('pointerdown', { button: 0 });
    await wrapper.find('[data-test="canvas-toolbar"]').trigger('pointerup', { button: 0 });
    expect(strokes.length).toBe(0);
  });

  it('removes its listeners when unmounted', async () => {
    const observed = new Y.Doc().getArray<StrokeRecord>('strokes');
    const unobserve = vi.spyOn(observed, 'unobserve');
    const other = mount(CanvasEditor, {
      props: { pageId: 'other', strokes: observed, provider: { awareness } },
    });
    other.unmount();
    expect(unobserve).toHaveBeenCalledOnce();
    expect(awareness.off).toHaveBeenCalled();
  });
});
