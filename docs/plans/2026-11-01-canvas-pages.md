# Canvas Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a canvas page type to the file tree, with freehand drawing, pressure from the XP-Pen Deco 640, live collaboration and offline support.

**Architecture:** A canvas page is a normal page with `kind: 'canvas'`. It uses the existing per-page Y.Doc, room and IndexedDB persistence, and stores finished strokes in a `strokes` Y.Array. In-progress strokes go through page awareness, and two canvas layers keep rendering separate from Vue reactivity.

**Tech Stack:** Vue 3, Yjs, `perfect-freehand`, Canvas 2D, Pointer Events, Vitest, happy-dom.

**Design:** [2026-11-01-canvas-pages-design.md](2026-11-01-canvas-pages-design.md)

---

## Before you start

- **Branch:** work on `feature/canvas-pages`.
- **Baseline:** 66 tests pass in 8 files, `pnpm type-check` is clean, and `pnpm lint` shows 1 existing warning.
- **Production warning:** `src/app/config.ts` defaults to the production sync server. Never run the app for testing without setting `VITE_SIGNALING_SERVERS` to a local server. Task 14 shows how.
- **Generated files:** `pnpm type-check` changes the tracked `tsconfig.tsbuildinfo`. Restore it before committing: `git checkout -- tsconfig.tsbuildinfo`.
- **Code status:** all the code below was run together in a temporary worktree. It passed 157 tests, type-check, lint, Prettier and the production build, and two windows synced strokes in headless Chrome through a local server. It hasn't been tested with a real pen.

## Changes from the design

- **`simulatePressure` is stored on each stroke.** Without it, other users couldn't tell real pressure from simulated pressure.
- **A live preview is removed when `ink` becomes `null`.** This replaces waiting for the finished stroke. It's simpler, and it can't leave a ghost stroke if the document update arrives first. The sender writes the stroke before clearing `ink`, so any gap should be tiny.
- **More small files.** `pressure.ts`, `strokeBuilder.ts`, `shortcuts.ts`, `useToolSettings.ts`, `useLiveEditor.ts` and `CanvasToolbar.vue` keep logic testable. Vue files sit in `components/` and composables in `composables/`, matching the repo.
- **`useLiveEditor` replaces the `RoomPage` test.** `RoomPage` has too many dependencies to mount cheaply, so the page-change rule moved into a small tested composable.
- **Undo history resets when you leave a canvas page.** `CanvasEditor` remounts per page, and that's fine for the first version.

## Known limits

- `RoomPage` reads the page from the URL only on first load, so changing the hash in an open tab doesn't switch pages. This isn't new.
- Tiptap logs an existing warning about its undo extension. This isn't new.

---

## Tasks

### Task 1: Add the dependency

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Install dependencies**

Run: `pnpm install --frozen-lockfile`

Expected: install finishes without changing the lockfile.

**Step 2: Confirm the baseline**

Run: `pnpm test:run`

Expected: `Test Files  8 passed (8)` and `Tests  66 passed (66)`.

**Step 3: Add perfect-freehand**

Run: `pnpm add perfect-freehand`

Expected: `perfect-freehand 1.2.3` is added to `dependencies`.

**Step 4: Commit**

```bash
git add package.json \
  pnpm-lock.yaml
git commit -m "chore(canvas): add perfect-freehand"
```


### Task 2: Add page kinds to the file tree

Keep `type: 'page'`. `findFirstPage`, `pageExists` and `TreeNode.vue` all depend on it, so a third `type` would hide canvas pages from them.

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/features/file-tree/composables/useFileTree.ts`
- Test: `src/features/file-tree/__tests__/useFileTree.test.ts`

**Step 1: Write the failing test**

```diff
--- a/src/features/file-tree/__tests__/useFileTree.test.ts
+++ b/src/features/file-tree/__tests__/useFileTree.test.ts
@@ -62,4 +62,46 @@ describe('useFileTree', () => {
   });
 
+  it('creates a text page by default', async () => {
+    const id = fileTree.createPage('Notes');
+    await frame();
+    expect(fileTree.tree.value.find((n) => n.id === id)!.kind).toBe('text');
+    expect(fileTree.activePageKind.value).toBe('text');
+  });
+
+  it('creates a canvas page and selects it', async () => {
+    const id = fileTree.createPage('Sketch', null, 'canvas');
+    await frame();
+    const page = fileTree.tree.value.find((n) => n.id === id)!;
+    expect(page.type).toBe('page');
+    expect(page.kind).toBe('canvas');
+    expect(fileTree.activePageId.value).toBe(id);
+    expect(fileTree.activePageKind.value).toBe('canvas');
+  });
+
+  it('treats a page with no kind as text', async () => {
+    const id = fileTree.createPage('Old page');
+    ydoc.getMap<Y.Map<any>>('nodes').get(id)!.delete('kind');
+    await frame();
+    expect(fileTree.tree.value.find((n) => n.id === id)!.kind).toBe('text');
+    expect(fileTree.activePageKind.value).toBe('text');
+  });
+
+  it('opens a canvas page from a deep link', async () => {
+    const id = fileTree.createPage('Sketch', null, 'canvas');
+    const reopened = useFileTree(ydoc, createMockProvider(), id);
+    await frame();
+    expect(reopened.activePageId.value).toBe(id);
+    expect(reopened.activePageKind.value).toBe('canvas');
+  });
+
+  it('falls back to a canvas page when the active page is deleted', () => {
+    const textId = fileTree.activePageId.value!;
+    const canvasId = fileTree.createPage('Sketch', null, 'canvas');
+    fileTree.setActivePage(textId);
+    fileTree.deleteNode(textId);
+    expect(fileTree.activePageId.value).toBe(canvasId);
+    expect(fileTree.activePageKind.value).toBe('canvas');
+  });
+
   it('creates a folder at root', async () => {
     const id = fileTree.createFolder('My Folder');
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/file-tree/__tests__/useFileTree.test.ts`

Expected: the 5 new tests fail, because `kind` and `activePageKind` are undefined.

**Step 3: Write the implementation**

```diff
--- a/src/features/file-tree/composables/useFileTree.ts
+++ b/src/features/file-tree/composables/useFileTree.ts
@@ -1,6 +1,6 @@
-import { ref, reactive, onUnmounted } from 'vue';
+import { ref, reactive, computed, onUnmounted } from 'vue';
 import * as Y from 'yjs';
 import { nanoid } from 'nanoid';
-import type { TreeNode } from '@/shared/types';
+import type { PageKind, TreeNode } from '@/shared/types';
 
 /**
@@ -8,5 +8,6 @@ import type { TreeNode } from '@/shared/types';
  *
  * Y.Map('nodes') — flat map of all nodes keyed by ID. Each node is a Y.Map:
- *   { id, type ('page'|'folder'), title, parentId (string|null) }
+ *   { id, type ('page'|'folder'), kind ('text'|'canvas', pages only), title, parentId (string|null) }
+ *   A page with no kind is a text page, so pages created before canvas support still work.
  *
  * Y.Array('rootChildren') — ordered IDs of top-level nodes
@@ -36,4 +37,9 @@ export function useFileTree(
   const activePageId = ref<string | null>(null);
   const expandedFolders = ref<Set<string>>(new Set());
+  // A page's kind never changes, so this only needs to follow activePageId.
+  const activePageKind = computed<PageKind>(() => {
+    const nodeMap = activePageId.value ? nodesMap.get(activePageId.value) : undefined;
+    return nodeMap ? pageKind(nodeMap) : 'text';
+  });
 
   const nodesMap: Y.Map<Y.Map<any>> = ydoc.getMap('nodes');
@@ -50,4 +56,8 @@ export function useFileTree(
   }
 
+  function pageKind(nodeMap: Y.Map<any>): PageKind {
+    return (nodeMap.get('kind') as PageKind | undefined) ?? 'text';
+  }
+
   function buildTreeNode(nodeId: string): TreeNode | null {
     stats.buildCount++;
@@ -61,4 +71,6 @@ export function useFileTree(
     }) as TreeNode;
 
+    if (node.type === 'page') node.kind = pageKind(nodeMap);
+
     if (node.type === 'folder') {
       const childArr = getChildrenArray(nodeId);
@@ -88,5 +100,9 @@ export function useFileTree(
   }
 
-  function createPage(title = 'Untitled', parentId: string | null = null): string {
+  function createPage(
+    title = 'Untitled',
+    parentId: string | null = null,
+    kind: PageKind = 'text',
+  ): string {
     const id = nanoid(8);
 
@@ -95,4 +111,5 @@ export function useFileTree(
       nodeMap.set('id', id);
       nodeMap.set('type', 'page');
+      nodeMap.set('kind', kind);
       nodeMap.set('title', title);
       nodeMap.set('parentId', parentId);
@@ -333,4 +350,5 @@ export function useFileTree(
     tree,
     activePageId,
+    activePageKind,
     expandedFolders,
     createPage,
--- a/src/shared/types.ts
+++ b/src/shared/types.ts
@@ -2,7 +2,10 @@ import type { Doc } from 'yjs';
 import type { Ref } from 'vue';
 
+export type PageKind = 'text' | 'canvas';
+
 export interface TreeNode {
   id: string;
   type: 'page' | 'folder';
+  kind?: PageKind;
   title: string;
   children?: TreeNode[];
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/file-tree/__tests__/useFileTree.test.ts`

Expected: all 20 tests pass.

**Step 5: Commit**

```bash
git add src/shared/types.ts \
  src/features/file-tree/composables/useFileTree.ts \
  src/features/file-tree/__tests__/useFileTree.test.ts
git commit -m "feat(canvas): add page kind to the file tree"
```


### Task 3: Expose strokes from page docs

**Files:**
- Create: `src/features/canvas/types.ts`
- Modify: `src/features/documents/usePageDocs.ts`
- Test: `src/features/documents/__tests__/usePageDocs.test.ts`

**Step 1: Write the failing test**

```diff
--- a/src/features/documents/__tests__/usePageDocs.test.ts
+++ b/src/features/documents/__tests__/usePageDocs.test.ts
@@ -39,4 +39,10 @@ describe('usePageDocs', () => {
   });
 
+  it('exposes the strokes array from the page doc', () => {
+    const pages = usePageDocs('room4');
+    const { ydoc, strokes } = pages.openPage('pageA');
+    expect(strokes).toBe(ydoc.getArray('strokes'));
+  });
+
   it('reuses the same provider on cache hit (no new connection)', () => {
     providers.length = 0;
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/documents/__tests__/usePageDocs.test.ts`

Expected: the new test fails, because `strokes` is undefined.

**Step 3: Write the implementation**

`src/features/canvas/types.ts`:

```ts
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
```

```diff
--- a/src/features/documents/usePageDocs.ts
+++ b/src/features/documents/usePageDocs.ts
@@ -4,4 +4,5 @@ import { WebsocketProvider } from 'y-websocket';
 import { IndexeddbPersistence } from 'y-indexeddb';
 import { config } from '@/app/config';
+import type { StrokeRecord } from '@/features/canvas/types';
 
 export interface PageDocHandle {
@@ -9,4 +10,5 @@ export interface PageDocHandle {
   provider: WebsocketProvider;
   fragment: Y.XmlFragment;
+  strokes: Y.Array<StrokeRecord>;
 }
 
@@ -33,5 +35,6 @@ export function usePageDocs(roomId: string) {
     const indexeddb = new IndexeddbPersistence(`writeboard-doc-${roomId}--page--${pageId}`, ydoc);
     const fragment = ydoc.getXmlFragment('content');
-    const entry: Entry = { ydoc, provider, indexeddb, fragment, lastUsed: ++clock };
+    const strokes = ydoc.getArray<StrokeRecord>('strokes');
+    const entry: Entry = { ydoc, provider, indexeddb, fragment, strokes, lastUsed: ++clock };
     cache.set(pageId, entry);
     evictIfNeeded();
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/documents/__tests__/usePageDocs.test.ts`

Expected: all 4 tests pass.

**Step 5: Commit**

```bash
git add src/features/canvas/types.ts \
  src/features/documents/usePageDocs.ts \
  src/features/documents/__tests__/usePageDocs.test.ts
git commit -m "feat(canvas): expose strokes from page docs"
```


### Task 4: Add the stroke codec

The benchmark in the design showed packed bytes are about 7× smaller than JSON. The first byte is a format version, because stroke data is stored permanently.

**Files:**
- Create: `src/features/canvas/strokeCodec.ts`
- Test: `src/features/canvas/__tests__/strokeCodec.test.ts`

**Step 1: Write the failing test**

`src/features/canvas/__tests__/strokeCodec.test.ts`:

```ts
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
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/canvas/__tests__/strokeCodec.test.ts`

Expected: FAIL, because `../strokeCodec` doesn't exist.

**Step 3: Write the implementation**

`src/features/canvas/strokeCodec.ts`:

```ts
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
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/canvas/__tests__/strokeCodec.test.ts`

Expected: all 10 tests pass.

**Step 5: Commit**

```bash
git add src/features/canvas/strokeCodec.ts \
  src/features/canvas/__tests__/strokeCodec.test.ts
git commit -m "feat(canvas): add packed stroke storage"
```


### Task 5: Add pressure handling and the stroke builder

Chrome on macOS reports the XP-Pen as `pointerType: "mouse"`, so detection must use the pressure values. The curve is applied when a point is captured, so changing it later never alters existing strokes.

**Files:**
- Create: `src/features/canvas/pressure.ts`
- Create: `src/features/canvas/strokeBuilder.ts`
- Test: `src/features/canvas/__tests__/strokeBuilder.test.ts`

**Step 1: Write the failing test**

`src/features/canvas/__tests__/strokeBuilder.test.ts`:

```ts
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
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/canvas/__tests__/strokeBuilder.test.ts`

Expected: FAIL, because `../pressure` doesn't exist.

**Step 3: Write the implementation**

`src/features/canvas/pressure.ts`:

```ts
// A device with no pressure sensor reports exactly this while pressed.
const SIMULATED_PRESSED_VALUE = 0.5;
// Below 1 lifts light pressure. The XP-Pen Deco 640 peaked at 0.275 in testing.
const PRESSURE_CURVE = 0.55;

// Don't use pointerType here: Chrome on macOS reports the XP-Pen as `mouse`.
export function isRealPressure(pressure: number): boolean {
  return pressure > 0 && pressure !== SIMULATED_PRESSED_VALUE;
}

export function applyPressureCurve(pressure: number): number {
  return Math.pow(Math.min(1, Math.max(0, pressure)), PRESSURE_CURVE);
}
```

`src/features/canvas/strokeBuilder.ts`:

```ts
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
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/canvas/__tests__/strokeBuilder.test.ts`

Expected: all 9 tests pass.

**Step 5: Commit**

```bash
git add src/features/canvas/pressure.ts \
  src/features/canvas/strokeBuilder.ts \
  src/features/canvas/__tests__/strokeBuilder.test.ts
git commit -m "feat(canvas): detect real pen pressure"
```


### Task 6: Add the viewport

**Files:**
- Create: `src/features/canvas/composables/useViewport.ts`
- Test: `src/features/canvas/__tests__/useViewport.test.ts`

**Step 1: Write the failing test**

`src/features/canvas/__tests__/useViewport.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  canvasToScreen,
  loadView,
  panBy,
  screenToCanvas,
  useViewport,
  zoomAt,
} from '../composables/useViewport';
import { nextTick } from 'vue';

describe('viewport maths', () => {
  it('converts screen to canvas and back at any zoom', () => {
    for (const view of [
      { x: 0, y: 0, zoom: 1 },
      { x: 30, y: -40, zoom: 2.5 },
      { x: -100, y: 7, zoom: 0.25 },
    ]) {
      const [canvasX, canvasY] = screenToCanvas(view, 120, 80);
      const [screenX, screenY] = canvasToScreen(view, canvasX, canvasY);
      expect(screenX).toBeCloseTo(120);
      expect(screenY).toBeCloseTo(80);
    }
  });

  it('pans without changing zoom', () => {
    expect(panBy({ x: 1, y: 2, zoom: 3 }, 10, 20)).toEqual({ x: 11, y: 22, zoom: 3 });
  });

  it('keeps the point under the pointer fixed while zooming', () => {
    const before = { x: 20, y: 30, zoom: 1.5 };
    const after = zoomAt(before, 200, 150, 2);
    expect(after.zoom).toBe(3);
    const [beforeX, beforeY] = screenToCanvas(before, 200, 150);
    const [afterX, afterY] = screenToCanvas(after, 200, 150);
    expect(afterX).toBeCloseTo(beforeX);
    expect(afterY).toBeCloseTo(beforeY);
  });

  it('limits zoom', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 100).zoom).toBe(8);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 0.001).zoom).toBe(0.1);
  });
});

describe('saved view', () => {
  beforeEach(() => localStorage.clear());

  it('saves the view per page and restores it', async () => {
    const { pan } = useViewport('page-a');
    pan(10, 20);
    await nextTick();
    expect(loadView('page-a')).toEqual({ x: 10, y: 20, zoom: 1 });
    expect(loadView('page-b')).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('falls back to the default view on bad saved data', () => {
    localStorage.setItem('writeboard-canvas-view-page-a', '{not json');
    expect(loadView('page-a')).toEqual({ x: 0, y: 0, zoom: 1 });
    localStorage.setItem('writeboard-canvas-view-page-a', '{"x":1,"y":2,"zoom":0}');
    expect(loadView('page-a')).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/canvas/__tests__/useViewport.test.ts`

Expected: FAIL, because `../composables/useViewport` doesn't exist.

**Step 3: Write the implementation**

`src/features/canvas/composables/useViewport.ts`:

```ts
import { shallowRef, watch } from 'vue';
import type { View } from '../types';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const DEFAULT_VIEW: View = { x: 0, y: 0, zoom: 1 };

export function screenToCanvas(view: View, x: number, y: number): [number, number] {
  return [(x - view.x) / view.zoom, (y - view.y) / view.zoom];
}

export function canvasToScreen(view: View, x: number, y: number): [number, number] {
  return [x * view.zoom + view.x, y * view.zoom + view.y];
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

// Keeps the canvas point under the screen point in place, so zoom follows the pointer.
export function zoomAt(view: View, screenX: number, screenY: number, factor: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const [canvasX, canvasY] = screenToCanvas(view, screenX, screenY);
  return { zoom, x: screenX - canvasX * zoom, y: screenY - canvasY * zoom };
}

function storageKey(pageId: string): string {
  return `writeboard-canvas-view-${pageId}`;
}

export function loadView(pageId: string): View {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(pageId)) ?? 'null');
    const valid = [saved?.x, saved?.y, saved?.zoom].every(Number.isFinite) && saved.zoom > 0;
    return valid ? saved : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

function saveView(pageId: string, view: View): void {
  try {
    localStorage.setItem(storageKey(pageId), JSON.stringify(view));
  } catch {
    // Losing the saved view is harmless, and storage can be blocked in private mode.
  }
}

export function useViewport(pageId: string) {
  const view = shallowRef<View>(loadView(pageId));
  watch(view, (next) => saveView(pageId, next));

  return {
    view,
    pan: (dx: number, dy: number) => {
      view.value = panBy(view.value, dx, dy);
    },
    zoom: (screenX: number, screenY: number, factor: number) => {
      view.value = zoomAt(view.value, screenX, screenY, factor);
    },
  };
}
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/canvas/__tests__/useViewport.test.ts`

Expected: all 6 tests pass.

**Step 5: Commit**

```bash
git add src/features/canvas/composables/useViewport.ts \
  src/features/canvas/__tests__/useViewport.test.ts
git commit -m "feat(canvas): add pan and zoom maths"
```


### Task 7: Add stroke storage and undo

**Files:**
- Create: `src/features/canvas/composables/useStrokes.ts`
- Test: `src/features/canvas/__tests__/useStrokes.test.ts`

**Step 1: Write the failing test**

`src/features/canvas/__tests__/useStrokes.test.ts`:

```ts
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
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/canvas/__tests__/useStrokes.test.ts`

Expected: FAIL, because `../composables/useStrokes` doesn't exist.

**Step 3: Write the implementation**

`src/features/canvas/composables/useStrokes.ts`:

```ts
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
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/canvas/__tests__/useStrokes.test.ts`

Expected: all 9 tests pass.

**Step 5: Commit**

```bash
git add src/features/canvas/composables/useStrokes.ts \
  src/features/canvas/__tests__/useStrokes.test.ts
git commit -m "feat(canvas): store strokes with undo"
```


### Task 8: Add the live preview

**Files:**
- Create: `src/features/canvas/composables/useLivePreview.ts`
- Test: `src/features/canvas/__tests__/useLivePreview.test.ts`

**Step 1: Write the failing test**

`src/features/canvas/__tests__/useLivePreview.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useLivePreview } from '../composables/useLivePreview';
import type { InkPoint, StrokeStyle } from '../types';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

const style: StrokeStyle = { tool: 'pen', color: '#000000', size: 4, simulatePressure: false };
const point = (x: number): InkPoint => [x, 0, 0.5];

function createAwareness() {
  const states = new Map<number, any>();
  let listener: ((change: any) => void) | null = null;
  return {
    clientID: 1,
    states,
    setLocalStateField: vi.fn(),
    getStates: () => states,
    on: (_event: string, cb: (change: any) => void) => (listener = cb),
    off: vi.fn(),
    remote(clientId: number, ink: unknown) {
      const isNew = !states.has(clientId);
      states.set(clientId, { ink });
      listener?.({ added: isNew ? [clientId] : [], updated: isNew ? [] : [clientId], removed: [] });
    },
    leave(clientId: number) {
      states.delete(clientId);
      listener?.({ added: [], updated: [], removed: [clientId] });
    },
  };
}

describe('useLivePreview', () => {
  let awareness: ReturnType<typeof createAwareness>;
  let onChange: Mock<() => void>;

  beforeEach(() => {
    awareness = createAwareness();
    onChange = vi.fn<() => void>();
  });

  it('accumulates chunks from another user', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(2, { ...style, id: 's1', pts: [point(1)] });
    awareness.remote(2, { ...style, id: 's1', pts: [point(2)] });
    expect(previews.value.get(2)!.points).toEqual([point(1), point(2)]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a chunk when another user changes', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(2, { ...style, id: 's1', pts: [point(1)] });
    awareness.remote(3, null);
    expect(previews.value.get(2)!.points).toEqual([point(1)]);
  });

  it('starts fresh on a new stroke id', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(2, { ...style, id: 's1', pts: [point(1)] });
    awareness.remote(2, { ...style, id: 's2', pts: [point(9)] });
    expect(previews.value.get(2)!.points).toEqual([point(9)]);
  });

  it('removes a preview when the stroke ends or the user leaves', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(2, { ...style, id: 's1', pts: [point(1)] });
    awareness.remote(2, null);
    expect(previews.value.has(2)).toBe(false);
    awareness.remote(3, { ...style, id: 's2', pts: [point(1)] });
    awareness.leave(3);
    expect(previews.value.has(3)).toBe(false);
  });

  it('ignores your own awareness changes', () => {
    const { previews } = useLivePreview(awareness, onChange);
    awareness.remote(1, { ...style, id: 's1', pts: [point(1)] });
    expect(previews.value.size).toBe(0);
  });

  it('sends only new points, at most every 50 ms', () => {
    const { publish } = useLivePreview(awareness, onChange);
    const takeUnsent = vi.fn(() => [point(1)]);
    publish('s1', style, takeUnsent, 1000);
    publish('s1', style, takeUnsent, 1020);
    publish('s1', style, takeUnsent, 1050);
    expect(takeUnsent).toHaveBeenCalledTimes(2);
    expect(awareness.setLocalStateField).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when there are no new points', () => {
    const { publish } = useLivePreview(awareness, onChange);
    publish('s1', style, () => [], 1000);
    expect(awareness.setLocalStateField).not.toHaveBeenCalled();
  });

  it('clears the local preview', () => {
    const { clear } = useLivePreview(awareness, onChange);
    clear();
    expect(awareness.setLocalStateField).toHaveBeenCalledWith('ink', null);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/canvas/__tests__/useLivePreview.test.ts`

Expected: FAIL, because `../composables/useLivePreview` doesn't exist.

**Step 3: Write the implementation**

`src/features/canvas/composables/useLivePreview.ts`:

```ts
import { onUnmounted, shallowRef } from 'vue';
import type { InkPoint, StrokeStyle } from '../types';

const SEND_INTERVAL_MS = 50;

export interface InkUpdate extends StrokeStyle {
  id: string;
  pts: InkPoint[];
}

export interface LivePreview extends StrokeStyle {
  id: string;
  points: InkPoint[];
}

export function useLivePreview(awareness: any, onChange: () => void) {
  const previews = shallowRef(new Map<number, LivePreview>());
  let lastSentAt = -Infinity;

  function receive(clientId: number, update: InkUpdate | null | undefined): void {
    const current = previews.value.get(clientId);
    if (!update) previews.value.delete(clientId);
    else if (current?.id === update.id) current.points.push(...update.pts);
    else previews.value.set(clientId, { ...update, points: [...update.pts] });
  }

  // Only `added` and `updated` clients are read. Reading every client would append
  // their last chunk again whenever anyone else's awareness changes.
  function onAwarenessChange({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }): void {
    const states = awareness.getStates();
    for (const clientId of [...added, ...updated]) {
      if (clientId !== awareness.clientID) receive(clientId, states.get(clientId)?.ink);
    }
    for (const clientId of removed) previews.value.delete(clientId);
    onChange();
  }

  // Sends only new points, so a long stroke costs the same per update as a short one.
  function publish(
    id: string,
    style: StrokeStyle,
    takeUnsent: () => InkPoint[],
    now: number,
  ): void {
    if (now - lastSentAt < SEND_INTERVAL_MS) return;
    const pts = takeUnsent();
    if (!pts.length) return;
    lastSentAt = now;
    awareness.setLocalStateField('ink', { ...style, id, pts });
  }

  function clear(): void {
    lastSentAt = -Infinity;
    awareness.setLocalStateField('ink', null);
  }

  awareness.on('change', onAwarenessChange);
  onUnmounted(() => {
    awareness.off('change', onAwarenessChange);
    clear();
  });

  return { previews, publish, clear };
}
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/canvas/__tests__/useLivePreview.test.ts`

Expected: all 8 tests pass.

**Step 5: Commit**

```bash
git add src/features/canvas/composables/useLivePreview.ts \
  src/features/canvas/__tests__/useLivePreview.test.ts
git commit -m "feat(canvas): preview strokes through awareness"
```


### Task 9: Add the renderer

`perfect-freehand` doesn't export the `getSvgPathFromStroke` helper from its README, so `outlineToSvgPath` provides it. `createPath` is passed in because happy-dom has no `Path2D`.

**Files:**
- Create: `src/features/canvas/renderer.ts`
- Test: `src/features/canvas/__tests__/renderer.test.ts`

**Step 1: Write the failing test**

`src/features/canvas/__tests__/renderer.test.ts`:

```ts
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
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/canvas/__tests__/renderer.test.ts`

Expected: FAIL, because `../renderer` doesn't exist.

**Step 3: Write the implementation**

`src/features/canvas/renderer.ts`:

```ts
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
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/canvas/__tests__/renderer.test.ts`

Expected: all 15 tests pass.

**Step 5: Commit**

```bash
git add src/features/canvas/renderer.ts \
  src/features/canvas/__tests__/renderer.test.ts
git commit -m "feat(canvas): render strokes and hit test"
```


### Task 10: Add shortcuts and tool settings

**Files:**
- Create: `src/features/canvas/shortcuts.ts`
- Create: `src/features/canvas/composables/useToolSettings.ts`
- Test: `src/features/canvas/__tests__/shortcuts.test.ts`
- Test: `src/features/canvas/__tests__/useToolSettings.test.ts`

**Step 1: Write the failing test**

`src/features/canvas/__tests__/shortcuts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { commandForKey, isTypingTarget } from '../shortcuts';

const key = (value: string, modifiers = {}) => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe('commandForKey', () => {
  it('maps tool and size keys', () => {
    expect(commandForKey(key('p'))).toBe('pen');
    expect(commandForKey(key('H'))).toBe('highlighter');
    expect(commandForKey(key('e'))).toBe('eraser');
    expect(commandForKey(key('['))).toBe('size-down');
    expect(commandForKey(key(']'))).toBe('size-up');
  });

  it('maps undo and redo on both platforms', () => {
    expect(commandForKey(key('z', { metaKey: true }))).toBe('undo');
    expect(commandForKey(key('z', { ctrlKey: true }))).toBe('undo');
    expect(commandForKey(key('Z', { metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('leaves browser shortcuts alone', () => {
    expect(commandForKey(key('p', { metaKey: true }))).toBe(null);
    expect(commandForKey(key('e', { altKey: true }))).toBe(null);
  });

  it('ignores other keys', () => {
    expect(commandForKey(key('x'))).toBe(null);
  });
});

describe('isTypingTarget', () => {
  it('detects inputs and editable elements', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isTypingTarget(editable)).toBe(true);
  });

  it('allows other elements', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
```

`src/features/canvas/__tests__/useToolSettings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { STROKE_COLORS, useToolSettings } from '../composables/useToolSettings';

describe('useToolSettings', () => {
  beforeEach(() => localStorage.clear());

  it('starts with the pen', () => {
    const { tool, color, size } = useToolSettings();
    expect(tool.value).toBe('pen');
    expect(color.value).toBe(STROKE_COLORS[0]);
    expect(size.value).toBe(4);
  });

  it('remembers settings on this device', async () => {
    const first = useToolSettings();
    first.tool.value = 'highlighter';
    first.color.value = STROKE_COLORS[2];
    await nextTick();
    const second = useToolSettings();
    expect(second.tool.value).toBe('highlighter');
    expect(second.color.value).toBe(STROKE_COLORS[2]);
  });

  it('steps through sizes and stops at each end', () => {
    const { size, stepSize } = useToolSettings();
    stepSize(1);
    expect(size.value).toBe(8);
    stepSize(1);
    stepSize(1);
    expect(size.value).toBe(16);
    stepSize(-1);
    stepSize(-1);
    stepSize(-1);
    stepSize(-1);
    expect(size.value).toBe(2);
  });

  it('ignores bad saved settings', () => {
    localStorage.setItem('writeboard-canvas-tools', '{"tool":"laser","color":"red","size":999}');
    const { tool, color, size } = useToolSettings();
    expect(tool.value).toBe('pen');
    expect(color.value).toBe(STROKE_COLORS[0]);
    expect(size.value).toBe(4);
  });

  it('falls back on broken saved settings', () => {
    localStorage.setItem('writeboard-canvas-tools', '{not json');
    expect(useToolSettings().tool.value).toBe('pen');
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/canvas/__tests__/shortcuts.test.ts src/features/canvas/__tests__/useToolSettings.test.ts`

Expected: FAIL, because neither module exists.

**Step 3: Write the implementation**

`src/features/canvas/shortcuts.ts`:

```ts
export type CanvasCommand =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'size-down'
  | 'size-up'
  | 'undo'
  | 'redo';

const KEY_COMMANDS: Record<string, CanvasCommand> = {
  p: 'pen',
  h: 'highlighter',
  e: 'eraser',
  '[': 'size-down',
  ']': 'size-up',
};

type Shortcut = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

export function commandForKey(event: Shortcut): CanvasCommand | null {
  const key = event.key.toLowerCase();
  if (event.metaKey || event.ctrlKey) {
    if (key !== 'z' || event.altKey) return null;
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (event.altKey) return null;
  return KEY_COMMANDS[key] ?? null;
}

// Shortcuts must not fire while someone types, such as when renaming a page.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
```

`src/features/canvas/composables/useToolSettings.ts`:

```ts
import { ref, watch } from 'vue';
import type { CanvasTool } from '../types';

const STORAGE_KEY = 'writeboard-canvas-tools';

export const STROKE_SIZES = [2, 4, 8, 16];
export const STROKE_COLORS = ['#1c1917', '#2563eb', '#dc2626', '#16a34a'];

interface ToolSettings {
  tool: CanvasTool;
  color: string;
  size: number;
}

const DEFAULTS: ToolSettings = { tool: 'pen', color: STROKE_COLORS[0], size: STROKE_SIZES[1] };

function loadSettings(): ToolSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      tool: ['pen', 'highlighter', 'eraser'].includes(saved.tool) ? saved.tool : DEFAULTS.tool,
      color: STROKE_COLORS.includes(saved.color) ? saved.color : DEFAULTS.color,
      size: STROKE_SIZES.includes(saved.size) ? saved.size : DEFAULTS.size,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useToolSettings() {
  const saved = loadSettings();
  const tool = ref(saved.tool);
  const color = ref(saved.color);
  const size = ref(saved.size);

  watch([tool, color, size], () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ tool: tool.value, color: color.value, size: size.value }),
      );
    } catch {
      // Losing tool settings is harmless, and storage can be blocked in private mode.
    }
  });

  function stepSize(direction: 1 | -1): void {
    const index = STROKE_SIZES.indexOf(size.value) + direction;
    size.value = STROKE_SIZES[Math.min(STROKE_SIZES.length - 1, Math.max(0, index))];
  }

  return { tool, color, size, stepSize };
}
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/canvas/__tests__/shortcuts.test.ts src/features/canvas/__tests__/useToolSettings.test.ts`

Expected: all 11 tests pass.

**Step 5: Commit**

```bash
git add src/features/canvas/shortcuts.ts \
  src/features/canvas/composables/useToolSettings.ts \
  src/features/canvas/__tests__/shortcuts.test.ts \
  src/features/canvas/__tests__/useToolSettings.test.ts
git commit -m "feat(canvas): add shortcuts and tool settings"
```


### Task 11: Clear the editor on page changes

**Files:**
- Create: `src/features/editor/composables/useLiveEditor.ts`
- Test: `src/features/editor/__tests__/useLiveEditor.test.ts`

**Step 1: Write the failing test**

`src/features/editor/__tests__/useLiveEditor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useLiveEditor } from '../composables/useLiveEditor';

describe('useLiveEditor', () => {
  it('clears the editor as soon as the page changes', () => {
    const activePageId = ref<string | null>('text-page');
    const liveEditor = useLiveEditor(activePageId);
    liveEditor.value = { destroyed: false };
    activePageId.value = 'canvas-page';
    expect(liveEditor.value).toBe(null);
  });

  it('keeps an editor that registers after the page changes', () => {
    const activePageId = ref<string | null>('a');
    const liveEditor = useLiveEditor(activePageId);
    activePageId.value = 'b';
    const editor = { destroyed: false };
    liveEditor.value = editor;
    expect(liveEditor.value).toBe(editor);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/editor/__tests__/useLiveEditor.test.ts`

Expected: FAIL, because `../composables/useLiveEditor` doesn't exist.

**Step 3: Write the implementation**

`src/features/editor/composables/useLiveEditor.ts`:

```ts
import { shallowRef, watch, type Ref } from 'vue';

// TiptapEditor is re-created for each page and canvas pages have none, so a page change
// must drop the old editor. Otherwise dictation inserts into a destroyed editor.
export function useLiveEditor(activePageId: Ref<string | null>) {
  const liveEditor = shallowRef<any>(null);
  watch(
    activePageId,
    () => {
      liveEditor.value = null;
    },
    { flush: 'sync' },
  );
  return liveEditor;
}
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/editor/__tests__/useLiveEditor.test.ts`

Expected: both tests pass.

**Step 5: Commit**

```bash
git add src/features/editor/composables/useLiveEditor.ts \
  src/features/editor/__tests__/useLiveEditor.test.ts
git commit -m "fix(editor): drop the live editor when the page changes"
```


### Task 12: Add canvas actions to the sidebar

**Files:**
- Modify: `src/features/file-tree/components/TreeNode.vue`
- Modify: `src/features/file-tree/components/FileTree.vue`
- Modify: `src/features/file-tree/components/Sidebar.vue`
- Test: `src/features/file-tree/__tests__/FileTree.contextmenu.test.ts`

**Step 1: Write the failing test**

```diff
--- a/src/features/file-tree/__tests__/FileTree.contextmenu.test.ts
+++ b/src/features/file-tree/__tests__/FileTree.contextmenu.test.ts
@@ -41,3 +41,17 @@ describe('FileTree context menu', () => {
     wrapper.unmount();
   });
+
+  it('creates a canvas inside a folder from the context menu', async () => {
+    const wrapper = mount(FileTree, {
+      props: { tree, activePageId: null, expandedFolders: new Set(['a']) },
+      attachTo: document.body,
+    });
+    await forceVirtualListRender(wrapper);
+
+    await wrapper.find('[data-test="tree-row"]').trigger('contextmenu');
+    await wrapper.find('[data-test="new-canvas"]').trigger('click');
+
+    expect(wrapper.emitted('create-canvas')).toEqual([['a']]);
+    wrapper.unmount();
+  });
 });
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/file-tree/__tests__/FileTree.contextmenu.test.ts`

Expected: the new test fails, because `[data-test="new-canvas"]` doesn't exist.

**Step 3: Write the implementation**

```diff
--- a/src/features/file-tree/components/FileTree.vue
+++ b/src/features/file-tree/components/FileTree.vue
@@ -23,4 +23,5 @@
           @delete="$emit('delete', $event)"
           @create-page="$emit('create-page', $event)"
+          @create-canvas="$emit('create-canvas', $event)"
           @create-folder="$emit('create-folder', $event)"
           @open-context-menu="contextMenu = $event"
@@ -66,4 +67,27 @@
         New Page
       </button>
+      <button
+        v-if="contextMenu.node.type === 'folder'"
+        data-test="new-canvas"
+        class="flex items-center gap-2 w-full px-2.5 py-1.5 border-none bg-transparent text-[0.82rem] font-ui text-text text-left cursor-pointer rounded hover:bg-black/5"
+        @click="onContextAction('new-canvas')"
+      >
+        <svg
+          class="shrink-0 text-text-muted"
+          width="14"
+          height="14"
+          viewBox="0 0 16 16"
+          fill="none"
+        >
+          <path
+            d="M11.5 2.5l2 2-8 8H3.5v-2z"
+            stroke="currentColor"
+            stroke-width="1.2"
+            fill="none"
+            stroke-linejoin="round"
+          />
+        </svg>
+        New Canvas
+      </button>
       <button
         v-if="contextMenu.node.type === 'folder'"
@@ -147,4 +171,5 @@ const emit = defineEmits([
   'delete',
   'create-page',
+  'create-canvas',
   'create-folder',
 ]);
@@ -187,4 +212,6 @@ function onContextAction(action) {
   } else if (action === 'new-page') {
     emit('create-page', node.id);
+  } else if (action === 'new-canvas') {
+    emit('create-canvas', node.id);
   } else if (action === 'new-folder') {
     emit('create-folder', node.id);
--- a/src/features/file-tree/components/Sidebar.vue
+++ b/src/features/file-tree/components/Sidebar.vue
@@ -45,4 +45,20 @@
             </svg>
           </button>
+          <button
+            data-test="new-canvas-button"
+            class="w-[26px] h-[26px] flex items-center justify-center border-none rounded bg-transparent text-text-muted cursor-pointer transition-all hover:bg-black/5 hover:text-text"
+            @click="$emit('create-canvas', null)"
+            title="New canvas"
+          >
+            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
+              <path
+                d="M11.5 2.5l2 2-8 8H3.5v-2z"
+                stroke="currentColor"
+                stroke-width="1.2"
+                fill="none"
+                stroke-linejoin="round"
+              />
+            </svg>
+          </button>
           <button
             class="w-[26px] h-[26px] flex items-center justify-center border-none rounded bg-transparent text-text-muted cursor-pointer transition-all hover:bg-black/5 hover:text-text"
@@ -77,4 +93,5 @@
         @delete="$emit('delete', $event)"
         @create-page="$emit('create-page', $event)"
+        @create-canvas="$emit('create-canvas', $event)"
         @create-folder="$emit('create-folder', $event)"
       />
@@ -95,4 +112,12 @@ defineProps({
 });
 
-defineEmits(['create-page', 'create-folder', 'select-page', 'toggle-folder', 'rename', 'delete']);
+defineEmits([
+  'create-page',
+  'create-canvas',
+  'create-folder',
+  'select-page',
+  'toggle-folder',
+  'rename',
+  'delete',
+]);
 </script>
--- a/src/features/file-tree/components/TreeNode.vue
+++ b/src/features/file-tree/components/TreeNode.vue
@@ -62,4 +62,20 @@
           />
         </svg>
+        <svg
+          v-else-if="node.kind === 'canvas'"
+          data-test="canvas-icon"
+          width="16"
+          height="16"
+          viewBox="0 0 16 16"
+          fill="none"
+        >
+          <path
+            d="M11.5 2.5l2 2-8 8H3.5v-2z"
+            stroke="#94a3b8"
+            stroke-width="1.2"
+            fill="#f1f5f9"
+            stroke-linejoin="round"
+          />
+        </svg>
         <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
           <path
@@ -113,4 +129,5 @@
         @delete="$emit('delete', $event)"
         @create-page="$emit('create-page', $event)"
+        @create-canvas="$emit('create-canvas', $event)"
         @create-folder="$emit('create-folder', $event)"
         @open-context-menu="$emit('open-context-menu', $event)"
@@ -138,4 +155,5 @@ const emit = defineEmits([
   'delete',
   'create-page',
+  'create-canvas',
   'create-folder',
   'open-context-menu',
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/file-tree/__tests__/FileTree.contextmenu.test.ts`

Expected: both tests pass.

**Step 5: Commit**

```bash
git add src/features/file-tree/components/TreeNode.vue \
  src/features/file-tree/components/FileTree.vue \
  src/features/file-tree/components/Sidebar.vue \
  src/features/file-tree/__tests__/FileTree.contextmenu.test.ts
git commit -m "feat(canvas): add new canvas actions to the sidebar"
```


### Task 13: Build the canvas editor

Strokes are drawn outside Vue reactivity on purpose, so a pen at about 220 reports per second never triggers component updates.

**Files:**
- Create: `src/features/canvas/components/CanvasToolbar.vue`
- Create: `src/features/canvas/components/CanvasEditor.vue`
- Test: `src/features/canvas/__tests__/CanvasEditor.test.ts`

**Step 1: Write the failing test**

`src/features/canvas/__tests__/CanvasEditor.test.ts`:

```ts
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
```

**Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/canvas/__tests__/CanvasEditor.test.ts`

Expected: FAIL, because `../components/CanvasEditor.vue` doesn't exist.

**Step 3: Write the implementation**

`src/features/canvas/components/CanvasToolbar.vue`:

```vue
<template>
  <div
    data-test="canvas-toolbar"
    class="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 p-1 bg-white border border-border rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] cursor-default"
    @pointerdown.stop
    @wheel.stop
  >
    <button
      v-for="option in TOOLS"
      :key="option.id"
      :data-test="`tool-${option.id}`"
      :class="[buttonClass, { 'bg-black/10': tool === option.id }]"
      :title="option.title"
      :aria-pressed="tool === option.id"
      @click="$emit('update:tool', option.id)"
    >
      {{ option.label }}
    </button>
    <span class="w-px h-5 bg-border mx-1"></span>
    <button
      v-for="option in STROKE_COLORS"
      :key="option"
      :data-test="`color-${option}`"
      class="w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer hover:bg-black/5"
      :class="{ 'bg-black/10': color === option }"
      :title="`Color ${option}`"
      :aria-pressed="color === option"
      @click="$emit('update:color', option)"
    >
      <span class="w-4 h-4 rounded-full" :style="{ background: option }"></span>
    </button>
    <span class="w-px h-5 bg-border mx-1"></span>
    <button :class="buttonClass" title="Smaller ( [ )" @click="$emit('step-size', -1)">−</button>
    <span class="w-6 text-center text-xs text-text-muted" title="Stroke size">{{ size }}</span>
    <button :class="buttonClass" title="Larger ( ] )" @click="$emit('step-size', 1)">+</button>
    <span class="w-px h-5 bg-border mx-1"></span>
    <button :class="buttonClass" :title="`Undo (${mod}Z)`" @click="$emit('undo')">↶</button>
    <button :class="buttonClass" :title="`Redo (⇧${mod}Z)`" @click="$emit('redo')">↷</button>
    <span class="w-px h-5 bg-border mx-1"></span>
    <button :class="buttonClass" title="Zoom out" @click="$emit('zoom', 0.8)">−</button>
    <span class="w-10 text-center text-xs text-text-muted">{{ zoomPercent }}%</span>
    <button :class="buttonClass" title="Zoom in" @click="$emit('zoom', 1.25)">+</button>
  </div>
</template>

<script setup>
import { STROKE_COLORS } from '@/features/canvas/composables/useToolSettings';

defineProps({
  tool: { type: String, required: true },
  color: { type: String, required: true },
  size: { type: Number, required: true },
  zoomPercent: { type: Number, required: true },
});

defineEmits(['update:tool', 'update:color', 'step-size', 'undo', 'redo', 'zoom']);

const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';
const buttonClass =
  'min-w-7 h-7 px-1 flex items-center justify-center border-none rounded bg-transparent text-sm text-text cursor-pointer hover:bg-black/5';
const TOOLS = [
  { id: 'pen', label: '✎', title: 'Pen (P)' },
  { id: 'highlighter', label: '▰', title: 'Highlighter (H)' },
  { id: 'eraser', label: '⌫', title: 'Eraser (E)' },
];
</script>
```

`src/features/canvas/components/CanvasEditor.vue`:

```vue
<template>
  <div
    ref="surface"
    data-test="canvas-surface"
    class="relative overflow-hidden bg-white"
    :class="surfaceCursor"
    style="touch-action: none"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @pointerleave="ringVisible = false"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
  >
    <canvas ref="inkCanvas" class="absolute inset-0 w-full h-full"></canvas>
    <canvas ref="liveCanvas" class="absolute inset-0 w-full h-full"></canvas>
    <div
      v-show="ringVisible && !isPanning"
      ref="ring"
      data-test="hover-ring"
      class="absolute top-0 left-0 rounded-full border border-black/50 pointer-events-none"
    ></div>
    <CanvasToolbar
      v-model:tool="tool"
      v-model:color="color"
      :size="size"
      :zoom-percent="Math.round(view.zoom * 100)"
      @step-size="stepSize"
      @undo="undo"
      @redo="redo"
      @zoom="zoomFromCenter"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useEventListener, useResizeObserver } from '@vueuse/core';
import { nanoid } from 'nanoid';
import CanvasToolbar from './CanvasToolbar.vue';
import { useLivePreview } from '@/features/canvas/composables/useLivePreview';
import { useStrokes } from '@/features/canvas/composables/useStrokes';
import { useToolSettings } from '@/features/canvas/composables/useToolSettings';
import { screenToCanvas, useViewport } from '@/features/canvas/composables/useViewport';
import {
  appendedCount,
  applyView,
  createStrokeCache,
  fillStroke,
  hitsStroke,
  intersects,
  liveAlpha,
  strokePath,
  visibleBounds,
} from '@/features/canvas/renderer';
import { commandForKey, isTypingTarget } from '@/features/canvas/shortcuts';
import { encodePoints } from '@/features/canvas/strokeCodec';
import { createStrokeBuilder } from '@/features/canvas/strokeBuilder';

const HIGHLIGHTER_RING_SCALE = 4;
const ERASER_RADIUS = 10; // screen pixels
const MIN_POINT_DISTANCE = 0.5; // screen pixels
const WHEEL_ZOOM_SPEED = 0.01;

const props = defineProps({
  pageId: { type: String, required: true },
  strokes: { type: Object, required: true },
  provider: { type: Object, required: true },
});

const surface = ref(null);
const inkCanvas = ref(null);
const liveCanvas = ref(null);
const ring = ref(null);
const ringVisible = ref(false);
const isPanning = ref(false);
const spaceHeld = ref(false);

const { tool, color, size, stepSize } = useToolSettings();
const { view, pan, zoom } = useViewport(props.pageId);
const { add, erase, undo, redo } = useStrokes(props.strokes);
const { previews, publish, clear } = useLivePreview(props.provider.awareness, scheduleLive);
const cache = createStrokeCache((d) => new Path2D(d));

const surfaceCursor = computed(() => {
  if (isPanning.value) return 'cursor-grabbing';
  return spaceHeld.value ? 'cursor-grab' : 'cursor-none';
});

let inkContext = null;
let liveContext = null;
let rect = { left: 0, top: 0, width: 0, height: 0 };
let pixelRatio = 1;
let inkFrame = 0;
let liveFrame = 0;
let activeStroke = null;
let predictedPoints = [];
let isErasing = false;
let lastPan = null;

function clearContext(context) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  applyView(context, view.value, pixelRatio);
}

function drawRenderStroke(stroke) {
  fillStroke(inkContext, stroke.path, stroke.color, stroke.alpha);
}

function redrawInk() {
  inkFrame = 0;
  if (!inkContext) return;
  clearContext(inkContext);
  const visible = visibleBounds(view.value, rect.width, rect.height);
  for (const stroke of cache.sync(props.strokes.toArray())) {
    if (intersects(stroke.bounds, visible)) drawRenderStroke(stroke);
  }
}

function scheduleInk() {
  inkFrame ||= requestAnimationFrame(redrawInk);
}

function drawLiveStroke(points, style, last) {
  if (!points.length) return;
  fillStroke(
    liveContext,
    new Path2D(strokePath(points, style, last)),
    style.color,
    liveAlpha(style),
  );
}

function redrawLive() {
  liveFrame = 0;
  if (!liveContext) return;
  clearContext(liveContext);
  for (const preview of previews.value.values()) drawLiveStroke(preview.points, preview, false);
  if (activeStroke) {
    const style = {
      ...activeStroke.style,
      simulatePressure: activeStroke.builder.simulatePressure,
    };
    drawLiveStroke([...activeStroke.builder.points, ...predictedPoints], style, false);
  }
}

function scheduleLive() {
  liveFrame ||= requestAnimationFrame(redrawLive);
}

function onStrokesChanged(event) {
  const count = appendedCount(event.changes.delta, props.strokes.length);
  if (!count || !inkContext || inkFrame) return scheduleInk();
  const records = props.strokes.toArray();
  cache.sync(records);
  for (const record of records.slice(-count)) {
    const stroke = cache.resolve(record);
    if (stroke) drawRenderStroke(stroke);
  }
}

function resize() {
  rect = surface.value.getBoundingClientRect();
  pixelRatio = window.devicePixelRatio || 1;
  for (const canvas of [inkCanvas.value, liveCanvas.value]) {
    canvas.width = Math.round(rect.width * pixelRatio);
    canvas.height = Math.round(rect.height * pixelRatio);
  }
  redrawInk();
  redrawLive();
}

function toCanvasSample(event) {
  const [x, y] = screenToCanvas(view.value, event.clientX - rect.left, event.clientY - rect.top);
  return { x, y, pressure: event.pressure };
}

function samplesFrom(event) {
  const coalesced = event.getCoalescedEvents?.() ?? [];
  return (coalesced.length ? coalesced : [event]).map(toCanvasSample);
}

function eraseAt(sample) {
  const radius = ERASER_RADIUS / view.value.zoom;
  for (const stroke of cache.sync(props.strokes.toArray())) {
    if (hitsStroke(stroke, sample.x, sample.y, radius)) erase(stroke.id);
  }
}

function startStroke(sample) {
  const builder = createStrokeBuilder(MIN_POINT_DISTANCE / view.value.zoom);
  activeStroke = {
    id: nanoid(8),
    builder,
    style: { tool: tool.value, color: color.value, size: size.value, simulatePressure: true },
  };
  builder.add(sample);
  scheduleLive();
}

function finishStroke() {
  if (!activeStroke) return;
  const { id, builder, style } = activeStroke;
  activeStroke = null;
  predictedPoints = [];
  add({
    ...style,
    id,
    simulatePressure: builder.simulatePressure,
    pts: encodePoints(builder.points),
  });
  clear();
  scheduleLive();
}

function updateRing(event) {
  const diameter =
    tool.value === 'eraser'
      ? ERASER_RADIUS * 2
      : size.value * view.value.zoom * (tool.value === 'highlighter' ? HIGHLIGHTER_RING_SCALE : 1);
  const x = event.clientX - rect.left - diameter / 2;
  const y = event.clientY - rect.top - diameter / 2;
  ring.value.style.width = `${diameter}px`;
  ring.value.style.height = `${diameter}px`;
  ring.value.style.transform = `translate(${x}px, ${y}px)`;
  ringVisible.value = true;
}

function onPointerDown(event) {
  rect = surface.value.getBoundingClientRect();
  surface.value.setPointerCapture?.(event.pointerId);
  if (event.button === 1 || (event.button === 0 && spaceHeld.value)) {
    isPanning.value = true;
    lastPan = [event.clientX, event.clientY];
  } else if (event.button === 0 && tool.value === 'eraser') {
    isErasing = true;
    eraseAt(toCanvasSample(event));
  } else if (event.button === 0) {
    startStroke(toCanvasSample(event));
  }
}

function onPointerMove(event) {
  updateRing(event);
  if (isPanning.value) {
    pan(event.clientX - lastPan[0], event.clientY - lastPan[1]);
    lastPan = [event.clientX, event.clientY];
  } else if (isErasing) {
    samplesFrom(event).forEach(eraseAt);
  } else if (activeStroke) {
    samplesFrom(event).forEach(activeStroke.builder.add);
    predictedPoints = (event.getPredictedEvents?.() ?? [])
      .map(toCanvasSample)
      .map(({ x, y, pressure }) => [x, y, pressure]);
    const { id, builder, style } = activeStroke;
    publish(
      id,
      { ...style, simulatePressure: builder.simulatePressure },
      builder.takeUnsent,
      event.timeStamp,
    );
    scheduleLive();
  }
}

function onPointerEnd() {
  isPanning.value = false;
  isErasing = false;
  finishStroke();
}

function onWheel(event) {
  if (event.ctrlKey || event.metaKey) {
    const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);
    zoom(event.clientX - rect.left, event.clientY - rect.top, factor);
  } else {
    pan(-event.deltaX, -event.deltaY);
  }
}

function zoomFromCenter(factor) {
  zoom(rect.width / 2, rect.height / 2, factor);
}

const commands = {
  pen: () => (tool.value = 'pen'),
  highlighter: () => (tool.value = 'highlighter'),
  eraser: () => (tool.value = 'eraser'),
  'size-down': () => stepSize(-1),
  'size-up': () => stepSize(1),
  undo,
  redo,
};

function onKeyDown(event) {
  if (isTypingTarget(event.target)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    spaceHeld.value = true;
    return;
  }
  const command = commandForKey(event);
  if (!command) return;
  event.preventDefault();
  commands[command]();
}

function onKeyUp(event) {
  if (event.code === 'Space') spaceHeld.value = false;
}

useEventListener(window, 'keydown', onKeyDown);
useEventListener(window, 'keyup', onKeyUp);
useEventListener(window, 'blur', onPointerEnd);
useResizeObserver(surface, resize);

watch(view, () => {
  scheduleInk();
  scheduleLive();
});

onMounted(() => {
  inkContext = inkCanvas.value.getContext('2d');
  liveContext = liveCanvas.value.getContext('2d', { desynchronized: true });
  resize();
  props.strokes.observe(onStrokesChanged);
});

onBeforeUnmount(() => {
  finishStroke();
  props.strokes.unobserve(onStrokesChanged);
  cancelAnimationFrame(inkFrame);
  cancelAnimationFrame(liveFrame);
});
</script>
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/canvas/__tests__/CanvasEditor.test.ts`

Expected: all 14 tests pass.

**Step 5: Commit**

```bash
git add src/features/canvas/components/CanvasToolbar.vue \
  src/features/canvas/components/CanvasEditor.vue \
  src/features/canvas/__tests__/CanvasEditor.test.ts
git commit -m "feat(canvas): add the canvas editor"
```


### Task 14: Wire canvas pages into the room

**Files:**
- Modify: `src/features/rooms/RoomPage.vue`
- Modify: `src/auto-imports.d.ts`
- Modify: `src/components.d.ts`

**Step 1: Update RoomPage**

```diff
--- a/src/features/rooms/RoomPage.vue
+++ b/src/features/rooms/RoomPage.vue
@@ -8,4 +8,5 @@
       :participants="participants"
       @create-page="createPage('Untitled', $event)"
+      @create-canvas="createPage('Untitled', $event, 'canvas')"
       @create-folder="createFolder('New Folder', $event)"
       @select-page="setActivePage"
@@ -31,4 +32,5 @@
           <template #right>
             <MicButton
+              v-if="!isCanvasPage"
               :is-listening="isListening"
               :is-supported="isSupported"
@@ -55,5 +57,13 @@
         </div>
       </div>
-      <div class="flex-1 overflow-y-auto">
+      <CanvasEditor
+        v-if="activePageId && isCanvasPage"
+        :key="activePageId"
+        class="flex-1 min-h-0"
+        :page-id="activePageId"
+        :strokes="currentPage?.strokes"
+        :provider="currentPage?.provider"
+      />
+      <div v-else class="flex-1 overflow-y-auto">
         <TiptapEditor
           v-if="activePageId"
@@ -101,5 +111,5 @@
 
 <script setup>
-import { ref, computed, onMounted, onUnmounted } from 'vue';
+import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
 
 const SPEED_OPTIONS = [0.5, 0.75, 1];
@@ -111,4 +121,5 @@ function cycleSpeed() {
   speedIndex.value = (speedIndex.value + 1) % SPEED_OPTIONS.length;
 }
+import CanvasEditor from '@/features/canvas/components/CanvasEditor.vue';
 import TiptapEditor from '@/features/editor/components/TiptapEditor.vue';
 import Toolbar from '@/features/editor/components/Toolbar.vue';
@@ -122,4 +133,5 @@ import { useFileTree } from '@/features/file-tree/composables/useFileTree';
 import { usePageDocs } from '@/features/documents/usePageDocs';
 import { useVoiceCapture } from '@/features/editor/composables/useVoiceCapture';
+import { useLiveEditor } from '@/features/editor/composables/useLiveEditor';
 import { usePractice } from '@/features/editor/composables/usePractice';
 import { usePiperTTS } from '@/features/editor/composables/usePiperTTS';
@@ -131,5 +143,4 @@ const props = defineProps({
 
 const sidebarOpen = ref(window.innerWidth >= 768);
-const liveEditor = ref(null);
 
 const {
@@ -146,4 +157,5 @@ const {
   tree,
   activePageId,
+  activePageKind,
   expandedFolders,
   createPage,
@@ -156,4 +168,7 @@ const {
 } = useFileTree(ydoc, provider, props.initialPageId);
 
+const isCanvasPage = computed(() => activePageKind.value === 'canvas');
+const liveEditor = useLiveEditor(activePageId);
+
 const pageDocs = usePageDocs(props.roomId);
 
@@ -218,5 +233,5 @@ const statusText = computed(() => {
 function handleKeydown(e) {
   const mod = e.metaKey || e.ctrlKey;
-  if (mod && e.key === 'm') {
+  if (mod && e.key === 'm' && !isCanvasPage.value) {
     e.preventDefault();
     toggleListening();
@@ -228,4 +243,11 @@ function handleKeydown(e) {
 }
 
+// Canvas pages have no text to dictate into or practice with.
+watch(isCanvasPage, (isCanvas) => {
+  if (!isCanvas) return;
+  if (isListening.value) toggleListening();
+  closePractice();
+});
+
 onMounted(() => document.addEventListener('keydown', handleKeydown));
 onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
```

**Step 2: Run every automated check**

Run: `pnpm test:run`

Expected: `Test Files  18 passed (18)` and `Tests  157 passed (157)`.

Run: `pnpm type-check && git checkout -- tsconfig.tsbuildinfo`

Expected: no type errors.

Run: `pnpm lint`

Expected: `Found 1 warning and 0 errors`, the existing warning.

Run: `pnpm format:check`

Expected: `All matched files use Prettier code style!`

Run: `pnpm build`

Expected: the build succeeds and regenerates `src/auto-imports.d.ts` and `src/components.d.ts`. The chunk size warning is expected.

**Step 3: Commit**

```bash
git add src/features/rooms/RoomPage.vue \
  src/auto-imports.d.ts \
  src/components.d.ts
git commit -m "feat(canvas): open canvas pages in the room"
```

**Step 4: Start a local sync server**

In one terminal:

```bash
cd server && npm install && PORT=4455 LEVELDB_PATH=/tmp/coldbrew-canvas-test node main.mjs
```

Then restore the lockfile `npm install` may change:

```bash
git checkout -- server/package-lock.json
```

**Step 5: Start the app against it**

In a second terminal:

```bash
VITE_SIGNALING_SERVERS=ws://localhost:4455 pnpm dev
```

Open `http://localhost:5173/#room=canvastest` and confirm the status shows `Connected`.

**Step 6: Run the manual checks**

These need a person and the XP-Pen. Open the room in Chrome, then copy the URL to a second window.

- [ ] "New canvas" creates a page with a pencil icon, and it opens.
- [ ] The hover ring follows the pen before it touches the tablet.
- [ ] Light and hard pressure give clearly different stroke widths. If not, tune `PRESSURE_CURVE` in `pressure.ts`.
- [ ] Handwriting looks smooth and feels responsive. If it's jittery, adjust `streamline` in `renderer.ts`.
- [ ] `P`, `H`, `E`, `[`, `]`, `⌘Z`, `⇧⌘Z` and `Space` all work, and none fire while renaming a page.
- [ ] The second window shows strokes while they're drawn, then keeps the finished stroke.
- [ ] Strokes survive a reload.
- [ ] Drawing while the local sync server is stopped works, and strokes sync after it restarts.
- [ ] Wheel pans, and `⌘` + wheel zooms around the pointer.
- [ ] Text pages still work, and the mic and text toolbar come back.
- [ ] Repeat the pen checks in Safari.
- [ ] A page with thousands of strokes still pans smoothly.

