import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import { useStrokes } from '../composables/useStrokes';
import { encodePoints, decodePoints } from '../strokeCodec';
import type { StrokeRecord } from '../types';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

function stroke(id: string): StrokeRecord {
  return {
    id,
    tool: 'pen',
    color: '#000000',
    size: 4,
    simulatePressure: false,
    pts: encodePoints([[1, 2, 0.5]]),
  };
}

function connect(a: Y.Doc, b: Y.Doc) {
  a.on('update', (update, origin) => {
    if (origin !== b) Y.applyUpdate(b, update, a);
  });
  b.on('update', (update, origin) => {
    if (origin !== a) Y.applyUpdate(a, update, b);
  });
}

const ids = (array: Y.Array<StrokeRecord>) => array.toArray().map((item) => item.id);

describe('useStrokes', () => {
  let doc: Y.Doc;
  let array: Y.Array<StrokeRecord>;

  beforeEach(() => {
    doc = new Y.Doc();
    array = doc.getArray('strokes');
  });

  it('adds strokes in order', () => {
    const { add } = useStrokes(array);
    add(stroke('a'));
    add(stroke('b'));
    expect(ids(array)).toEqual(['a', 'b']);
  });

  it('erases a stroke by id', () => {
    const { add, erase } = useStrokes(array);
    add(stroke('a'));
    add(stroke('b'));
    erase('a');
    expect(ids(array)).toEqual(['b']);
  });

  it('ignores erasing an unknown id', () => {
    const { add, erase } = useStrokes(array);
    add(stroke('a'));
    erase('missing');
    expect(ids(array)).toEqual(['a']);
  });

  it('undoes and redoes one stroke at a time', () => {
    const { add, undo, redo } = useStrokes(array);
    add(stroke('a'));
    add(stroke('b'));
    undo();
    expect(ids(array)).toEqual(['a']);
    redo();
    expect(ids(array)).toEqual(['a', 'b']);
  });

  it('restores an erased stroke with its points on undo', () => {
    const { add, erase, undo } = useStrokes(array);
    add(stroke('a'));
    erase('a');
    undo();
    expect(ids(array)).toEqual(['a']);
    expect(decodePoints(array.get(0).pts)).toEqual(decodePoints(stroke('a').pts));
  });

  it('syncs strokes between docs and keeps points as bytes', () => {
    const other = new Y.Doc();
    connect(doc, other);
    useStrokes(array).add(stroke('a'));
    const received = other.getArray<StrokeRecord>('strokes').get(0);
    expect(received.pts).toBeInstanceOf(Uint8Array);
    expect(decodePoints(received.pts)).toEqual(decodePoints(stroke('a').pts));
  });

  it('only undoes your own changes', () => {
    const other = new Y.Doc();
    connect(doc, other);
    const mine = useStrokes(array);
    const theirs = useStrokes(other.getArray<StrokeRecord>('strokes'));
    theirs.add(stroke('theirs'));
    mine.add(stroke('mine'));
    mine.undo();
    expect(ids(array)).toEqual(['theirs']);
  });

  it('lets you undo your erase of someone else’s stroke', () => {
    const other = new Y.Doc();
    connect(doc, other);
    const mine = useStrokes(array);
    const theirs = useStrokes(other.getArray<StrokeRecord>('strokes'));
    theirs.add(stroke('theirs'));
    mine.erase('theirs');
    expect(ids(array)).toEqual([]);
    mine.undo();
    expect(ids(array)).toEqual(['theirs']);
  });

  it('is safe when both users erase the same stroke', () => {
    const other = new Y.Doc();
    const otherArray = other.getArray<StrokeRecord>('strokes');
    const mine = useStrokes(array);
    const theirs = useStrokes(otherArray);
    mine.add(stroke('a'));
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    mine.erase('a');
    theirs.erase('a');
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other));
    expect(ids(array)).toEqual([]);
    expect(ids(otherArray)).toEqual([]);
  });
});
