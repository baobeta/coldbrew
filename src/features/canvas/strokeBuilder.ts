import { applyPressureCurve, isRealPressure } from './pressure';
import type { InkPoint } from './types';

export interface InkSample {
  x: number;
  y: number;
  pressure: number;
}

export function createStrokeBuilder(minDistance: number) {
  const points: InkPoint[] = [];
  let hasRealPressure = false;
  let sentCount = 0;

  function add(sample: InkSample): void {
    hasRealPressure ||= isRealPressure(sample.pressure);
    const last = points.at(-1);
    if (last && Math.hypot(sample.x - last[0], sample.y - last[1]) < minDistance) return;
    points.push([sample.x, sample.y, applyPressureCurve(sample.pressure)]);
  }

  function takeUnsent(): InkPoint[] {
    const unsent = points.slice(sentCount);
    sentCount = points.length;
    return unsent;
  }

  return {
    points,
    add,
    takeUnsent,
    get simulatePressure() {
      return !hasRealPressure;
    },
  };
}
