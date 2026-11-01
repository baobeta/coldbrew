import { getStroke } from 'perfect-freehand';
import { decodePoints } from './strokeCodec';
import type { Bounds, InkPoint, StrokeRecord, StrokeStyle, View } from './types';

const HIGHLIGHTER_SIZE_SCALE = 4;
const HIGHLIGHTER_ALPHA = 0.35;

export interface RenderStroke {
  id: string;
  points: InkPoint[];
  path: Path2D;
  bounds: Bounds;
  size: number;
  color: string;
  alpha: number;
}

function drawnSize(style: StrokeStyle): number {
  return style.tool === 'highlighter' ? style.size * HIGHLIGHTER_SIZE_SCALE : style.size;
}

// getStroke returns outline points. perfect-freehand doesn't export the path helper from
// its README, so this is the same quadratic midpoint approach.
function outlineToSvgPath(outline: number[][]): string {
  if (!outline.length) return '';
  const first = outline[0];
  const curves = outline.map((point, i) => {
    const next = outline[(i + 1) % outline.length];
    return `Q${point[0]} ${point[1]} ${(point[0] + next[0]) / 2} ${(point[1] + next[1]) / 2}`;
  });
  return `M${first[0]} ${first[1]} ${curves.join(' ')} Z`;
}

export function strokePath(points: InkPoint[], style: StrokeStyle, last = true): string {
  const isHighlighter = style.tool === 'highlighter';
  return outlineToSvgPath(
    getStroke(points, {
      size: drawnSize(style),
      thinning: isHighlighter ? 0 : 0.6,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: !isHighlighter && style.simulatePressure,
      last,
    }),
  );
}

export function boundsOf(points: InkPoint[], padding: number): Bounds {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs) - padding,
    minY: Math.min(...ys) - padding,
    maxX: Math.max(...xs) + padding,
    maxY: Math.max(...ys) + padding,
  };
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function visibleBounds(view: View, width: number, height: number): Bounds {
  return {
    minX: (0 - view.x) / view.zoom,
    minY: (0 - view.y) / view.zoom,
    maxX: (width - view.x) / view.zoom,
    maxY: (height - view.y) / view.zoom,
  };
}

function distanceToSegment(px: number, py: number, a: InkPoint, b: InkPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / lengthSquared));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

export function hitsStroke(stroke: RenderStroke, x: number, y: number, radius: number): boolean {
  const { minX, minY, maxX, maxY } = stroke.bounds;
  if (x < minX - radius || x > maxX + radius || y < minY - radius || y > maxY + radius) {
    return false;
  }
  const reach = radius + stroke.size / 2;
  const { points } = stroke;
  if (points.length === 1) return Math.hypot(x - points[0][0], y - points[0][1]) <= reach;
  return points.some((point, i) => i > 0 && distanceToSegment(x, y, points[i - 1], point) <= reach);
}

export function buildRenderStroke(
  record: StrokeRecord,
  createPath: (d: string) => Path2D,
): RenderStroke | null {
  try {
    const points = decodePoints(record.pts);
    if (!points.length) return null;
    const size = drawnSize(record);
    return {
      id: record.id,
      points,
      path: createPath(strokePath(points, record)),
      bounds: boundsOf(points, size),
      size,
      color: record.color,
      alpha: record.tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 1,
    };
  } catch (error) {
    console.warn(`Skipping stroke ${record.id}:`, error);
    return null;
  }
}

// Strokes are immutable, so an id is enough to reuse the decoded stroke and its Path2D.
export function createStrokeCache(createPath: (d: string) => Path2D) {
  const cache = new Map<string, RenderStroke | null>();

  function resolve(record: StrokeRecord): RenderStroke | null {
    if (!cache.has(record.id)) cache.set(record.id, buildRenderStroke(record, createPath));
    return cache.get(record.id) ?? null;
  }

  function sync(records: StrokeRecord[]): RenderStroke[] {
    const liveIds = new Set(records.map((record) => record.id));
    for (const id of cache.keys()) {
      if (!liveIds.has(id)) cache.delete(id);
    }
    return records.map(resolve).filter((stroke): stroke is RenderStroke => stroke !== null);
  }

  return { resolve, sync };
}

// Returns how many strokes were added to the end, or 0 if the change needs a full redraw.
export function appendedCount(
  delta: { retain?: number; insert?: unknown; delete?: number }[],
  length: number,
): number {
  const inserted = delta.length ? delta.at(-1)!.insert : null;
  if (!Array.isArray(inserted) || delta.some((change) => change.delete)) return 0;
  const retained = delta.length === 2 ? (delta[0].retain ?? 0) : 0;
  if (delta.length > 2 || retained + inserted.length !== length) return 0;
  return inserted.length;
}

export function applyView(context: CanvasRenderingContext2D, view: View, pixelRatio: number): void {
  context.setTransform(
    pixelRatio * view.zoom,
    0,
    0,
    pixelRatio * view.zoom,
    pixelRatio * view.x,
    pixelRatio * view.y,
  );
}

export function fillStroke(
  context: CanvasRenderingContext2D,
  path: Path2D,
  color: string,
  alpha: number,
): void {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fill(path);
}

export function liveAlpha(style: StrokeStyle): number {
  return style.tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 1;
}
