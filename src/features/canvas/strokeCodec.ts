import type { InkPoint } from './types';

const FORMAT_VERSION = 1;
const COORDINATE_SCALE = 10; // 0.1 canvas-unit precision
const PRESSURE_SCALE = 255;
const MAX_VARINT_BYTES = 8;

function writeVarint(out: number[], value: number): void {
  // Zigzag with arithmetic, because bit shifts overflow at 32 bits on a large canvas.
  let n = value < 0 ? -value * 2 - 1 : value * 2;
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

function readVarint(bytes: Uint8Array, start: number): [value: number, next: number] {
  let n = 0;
  let multiplier = 1;
  for (let i = start; i < bytes.length && i - start < MAX_VARINT_BYTES; i++) {
    const byte = bytes[i];
    n += (byte & 127) * multiplier;
    if (byte < 128) return [n % 2 === 0 ? n / 2 : -(n + 1) / 2, i + 1];
    multiplier *= 128;
  }
  throw new RangeError('Invalid stroke data: unterminated number');
}

export function encodePoints(points: InkPoint[]): Uint8Array {
  const out: number[] = [FORMAT_VERSION];
  let previousX = 0;
  let previousY = 0;
  for (const [x, y, pressure] of points) {
    const scaledX = Math.round(x * COORDINATE_SCALE);
    const scaledY = Math.round(y * COORDINATE_SCALE);
    writeVarint(out, scaledX - previousX);
    writeVarint(out, scaledY - previousY);
    out.push(Math.round(Math.min(1, Math.max(0, pressure)) * PRESSURE_SCALE));
    previousX = scaledX;
    previousY = scaledY;
  }
  return Uint8Array.from(out);
}

export function decodePoints(bytes: Uint8Array): InkPoint[] {
  if (bytes[0] !== FORMAT_VERSION) {
    throw new RangeError(`Invalid stroke data: unknown version ${bytes[0]}`);
  }
  const points: InkPoint[] = [];
  let index = 1;
  let x = 0;
  let y = 0;
  while (index < bytes.length) {
    const [deltaX, afterX] = readVarint(bytes, index);
    const [deltaY, afterY] = readVarint(bytes, afterX);
    if (afterY >= bytes.length) throw new RangeError('Invalid stroke data: missing pressure');
    x += deltaX;
    y += deltaY;
    points.push([x / COORDINATE_SCALE, y / COORDINATE_SCALE, bytes[afterY] / PRESSURE_SCALE]);
    index = afterY + 1;
  }
  return points;
}
