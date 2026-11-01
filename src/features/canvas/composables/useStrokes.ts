import { onUnmounted } from 'vue';
import * as Y from 'yjs';
import type { StrokeRecord } from '../types';

export function useStrokes(strokes: Y.Array<StrokeRecord>) {
  const localOrigin = Symbol('local-ink');
  // captureTimeout 0 keeps each stroke as its own undo step.
  const undoManager = new Y.UndoManager(strokes, {
    trackedOrigins: new Set([localOrigin]),
    captureTimeout: 0,
  });

  function add(stroke: StrokeRecord): void {
    strokes.doc!.transact(() => strokes.push([stroke]), localOrigin);
  }

  function erase(id: string): void {
    const index = strokes.toArray().findIndex((stroke) => stroke.id === id);
    if (index < 0) return;
    strokes.doc!.transact(() => strokes.delete(index, 1), localOrigin);
  }

  onUnmounted(() => undoManager.destroy());

  return {
    add,
    erase,
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
  };
}
