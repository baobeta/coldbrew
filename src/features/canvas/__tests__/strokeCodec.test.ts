import { describe, it, expect } from 'vitest';
import { encodePoints, decodePoints } from '../strokeCodec';
import type { InkPoint } from '../types';

function expectClose(actual: InkPoint[], expected: InkPoint[]) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((point, i) => {
    expect(point[0]).toBeCloseTo(expected[i][0], 1);
    expect(point[1]).toBeCloseTo(expected[i][1], 1);
    expect(Math.abs(point[2] - expected[i][2])).toBeLessThan(1 / 255);
  });
}

describe('strokeCodec', () => {
  it('round-trips points within storage precision', () => {
    const points: InkPoint[] = [
      [12.34, 56.78, 0.1],
      [13.04, 55.18, 0.25],
      [20.5, 60.25, 1],
    ];
    expectClose(decodePoints(encodePoints(points)), points);
  });

  it('round-trips an empty stroke', () => {
    expect(decodePoints(encodePoints([]))).toEqual([]);
  });

  it('round-trips a single point', () => {
    const points: InkPoint[] = [[5, 6, 0.5]];
    expectClose(decodePoints(encodePoints(points)), points);
  });

  it('round-trips negative and very large coordinates', () => {
    const points: InkPoint[] = [
      [-5000.5, -2.2, 0],
      [250000000.1, 3, 1],
    ];
    expectClose(decodePoints(encodePoints(points)), points);
  });

  it('clamps pressure outside 0 to 1', () => {
    const [low, high] = decodePoints(
      encodePoints([
        [0, 0, -1],
        [1, 1, 2],
      ]),
    );
    expect(low[2]).toBe(0);
    expect(high[2]).toBe(1);
  });

  it('uses far fewer bytes than JSON', () => {
    const points: InkPoint[] = Array.from({ length: 200 }, (_, i) => [100 + i, 200 + i / 2, 0.4]);
    expect(encodePoints(points).length).toBeLessThan(JSON.stringify(points).length / 3);
  });

  it('throws on an unknown version', () => {
    expect(() => decodePoints(Uint8Array.from([99, 0, 0, 0]))).toThrow(RangeError);
  });

  it('throws on empty bytes', () => {
    expect(() => decodePoints(new Uint8Array())).toThrow(RangeError);
  });

  it('throws on truncated data', () => {
    const bytes = encodePoints([[1000, 2000, 0.5]]);
    expect(() => decodePoints(bytes.slice(0, bytes.length - 1))).toThrow(RangeError);
  });

  it('throws on an unterminated number', () => {
    expect(() => decodePoints(Uint8Array.from([1, 200, 200]))).toThrow(RangeError);
  });
});
