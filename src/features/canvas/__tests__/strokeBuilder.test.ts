import { describe, it, expect } from 'vitest';
import { applyPressureCurve, isRealPressure } from '../pressure';
import { createStrokeBuilder } from '../strokeBuilder';

describe('pressure', () => {
  it('treats the fixed pressed value and zero as simulated', () => {
    expect(isRealPressure(0.5)).toBe(false);
    expect(isRealPressure(0)).toBe(false);
  });

  it('treats any other value as real', () => {
    expect(isRealPressure(0.275)).toBe(true);
    expect(isRealPressure(0.51)).toBe(true);
  });

  it('boosts light pressure without changing the ends', () => {
    expect(applyPressureCurve(0)).toBe(0);
    expect(applyPressureCurve(1)).toBe(1);
    expect(applyPressureCurve(0.275)).toBeGreaterThan(0.45);
  });

  it('clamps out-of-range pressure', () => {
    expect(applyPressureCurve(-1)).toBe(0);
    expect(applyPressureCurve(2)).toBe(1);
  });
});

describe('createStrokeBuilder', () => {
  it('uses real pressure when values vary, even when reported as a mouse', () => {
    const builder = createStrokeBuilder(0.5);
    builder.add({ x: 0, y: 0, pressure: 0 });
    builder.add({ x: 5, y: 0, pressure: 0.2 });
    expect(builder.simulatePressure).toBe(false);
  });

  it('simulates pressure for a normal mouse', () => {
    const builder = createStrokeBuilder(0.5);
    builder.add({ x: 0, y: 0, pressure: 0.5 });
    builder.add({ x: 5, y: 0, pressure: 0.5 });
    expect(builder.simulatePressure).toBe(true);
  });

  it('drops points closer than the minimum distance', () => {
    const builder = createStrokeBuilder(1);
    builder.add({ x: 0, y: 0, pressure: 0.2 });
    builder.add({ x: 0.5, y: 0, pressure: 0.2 });
    builder.add({ x: 2, y: 0, pressure: 0.2 });
    expect(builder.points.map((point) => point[0])).toEqual([0, 2]);
  });

  it('still detects real pressure on a dropped point', () => {
    const builder = createStrokeBuilder(1);
    builder.add({ x: 0, y: 0, pressure: 0.5 });
    builder.add({ x: 0.1, y: 0, pressure: 0.3 });
    expect(builder.simulatePressure).toBe(false);
  });

  it('returns only points that have not been sent', () => {
    const builder = createStrokeBuilder(0.5);
    builder.add({ x: 0, y: 0, pressure: 0.2 });
    builder.add({ x: 5, y: 0, pressure: 0.2 });
    expect(builder.takeUnsent().length).toBe(2);
    builder.add({ x: 10, y: 0, pressure: 0.2 });
    expect(builder.takeUnsent().length).toBe(1);
    expect(builder.takeUnsent()).toEqual([]);
  });
});
