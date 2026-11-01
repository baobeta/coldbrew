import { describe, it, expect, vi } from 'vitest';
import {
  appendedCount,
  boundsOf,
  buildRenderStroke,
  createStrokeCache,
  hitsStroke,
  intersects,
  strokePath,
  visibleBounds,
} from '../renderer';
import { encodePoints } from '../strokeCodec';
import type { InkPoint, StrokeRecord, StrokeStyle } from '../types';

const style: StrokeStyle = { tool: 'pen', color: '#000000', size: 4, simulatePressure: false };
const line: InkPoint[] = [
  [0, 0, 0.5],
  [50, 0, 0.5],
  [100, 0, 0.5],
];
const createPath = (d: string) => ({ d }) as unknown as Path2D;

function record(id: string, points: InkPoint[] = line): StrokeRecord {
  return { ...style, id, pts: encodePoints(points) };
}

describe('strokePath', () => {
  it('builds a closed SVG path', () => {
    const path = strokePath(line, style);
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).not.toContain('NaN');
  });

  it('draws a dot for a single point', () => {
    expect(strokePath([[5, 5, 0.5]], style)).toContain('Q');
  });

  it('makes harder strokes wider', () => {
    const height = (pressure: number) => {
      const points: InkPoint[] = line.map(([x, y]) => [x, y, pressure]);
      const numbers = strokePath(points, style)
        .match(/-?\d+\.?\d*(e-?\d+)?/g)!
        .map(Number);
      const ys = numbers.filter((_, i) => i % 2 === 1);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height(0.9)).toBeGreaterThan(height(0.2));
  });
});

describe('bounds', () => {
  it('pads bounds', () => {
    expect(boundsOf(line, 2)).toEqual({ minX: -2, minY: -2, maxX: 102, maxY: 2 });
  });

  it('detects overlap', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(intersects(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true);
    expect(intersects(a, { minX: 11, minY: 0, maxX: 15, maxY: 10 })).toBe(false);
  });

  it('computes the visible canvas area', () => {
    expect(visibleBounds({ x: 100, y: 0, zoom: 2 }, 400, 200)).toEqual({
      minX: -50,
      minY: 0,
      maxX: 150,
      maxY: 100,
    });
  });
});

describe('hitsStroke', () => {
  const stroke = buildRenderStroke(record('a'), createPath)!;

  it('hits a point on the stroke between samples', () => {
    expect(hitsStroke(stroke, 25, 3, 2)).toBe(true);
  });

  it('misses a point beyond the eraser reach', () => {
    expect(hitsStroke(stroke, 25, 9, 2)).toBe(false);
    expect(hitsStroke(stroke, 500, 0, 2)).toBe(false);
  });

  it('hits a single-point stroke', () => {
    const dot = buildRenderStroke(record('b', [[10, 10, 0.5]]), createPath)!;
    expect(hitsStroke(dot, 11, 10, 2)).toBe(true);
  });
});

describe('createStrokeCache', () => {
  it('builds each stroke once', () => {
    const counted = vi.fn(createPath);
    const cache = createStrokeCache(counted);
    cache.sync([record('a')]);
    cache.sync([record('a'), record('b')]);
    expect(counted).toHaveBeenCalledTimes(2);
  });

  it('skips bad strokes and keeps the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cache = createStrokeCache(createPath);
    const bad = { ...record('bad'), pts: Uint8Array.from([99]) };
    expect(cache.sync([bad, record('good')]).map((stroke) => stroke.id)).toEqual(['good']);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('drops erased strokes', () => {
    const counted = vi.fn(createPath);
    const cache = createStrokeCache(counted);
    cache.sync([record('a')]);
    cache.sync([]);
    cache.sync([record('a')]);
    expect(counted).toHaveBeenCalledTimes(2);
  });
});

describe('appendedCount', () => {
  it('detects strokes added to the end', () => {
    expect(appendedCount([{ insert: [1] }], 1)).toBe(1);
    expect(appendedCount([{ retain: 3 }, { insert: [1, 2] }], 5)).toBe(2);
  });

  it('needs a redraw for an insert before the end', () => {
    expect(appendedCount([{ retain: 1 }, { insert: [1] }], 5)).toBe(0);
    expect(appendedCount([{ insert: [1] }, { retain: 2 }], 3)).toBe(0);
  });

  it('needs a redraw for a delete', () => {
    expect(appendedCount([{ retain: 1 }, { delete: 1 }], 1)).toBe(0);
    expect(appendedCount([{ delete: 1 }, { insert: [1] }], 1)).toBe(0);
  });
});
