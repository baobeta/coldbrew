export type InkPoint = [x: number, y: number, pressure: number];
export type InkTool = 'pen' | 'highlighter';
export type CanvasTool = InkTool | 'eraser';

export interface StrokeStyle {
  tool: InkTool;
  color: string;
  size: number;
  simulatePressure: boolean;
}

// Stored as one immutable item in the page's `strokes` Y.Array.
export interface StrokeRecord extends StrokeStyle {
  id: string;
  pts: Uint8Array;
}

// Screen position = canvas position * zoom + (x, y).
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
