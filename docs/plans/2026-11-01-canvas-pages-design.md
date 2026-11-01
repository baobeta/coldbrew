# Canvas Pages Design

**Status:** Approved design, not yet implemented
**Date:** 2026-11-01

## Goal

Add a canvas page alongside text pages, so a file tree can hold freehand drawings and handwritten notes. Canvas pages sync between users and work offline, like text pages.

## Scope

**First version**

- Pen, highlighter and stroke eraser
- Colors and stroke sizes
- Undo and redo
- Pan and zoom on an infinite canvas
- Live collaboration
- Keyboard shortcuts and pen pressure

**Not in the first version**

- Shapes, text boxes and images
- Handwriting recognition
- Export
- Tilt effects

The main test device is an XP-Pen Deco 640 on macOS. It's a pen tablet with no screen, so the user looks at the monitor while drawing.

## Approach

Build a small editor with `perfect-freehand`, Canvas 2D and the existing Yjs setup.

| Option | Size (gzip) | Needs React | License | Decision |
|---|---|---|---|---|
| `perfect-freehand` + Canvas 2D | 2 KB | No | MIT | **Chosen** |
| Excalidraw | 353 KB main chunk, plus lazy chunks | Yes | MIT | Use only if shapes and text become a requirement |
| tldraw | 552 KB | Yes | Watermark, or a paid business license | Rejected |

`perfect-freehand` only turns points into a stroke outline. The editor handles input, storage and rendering.

## Architecture

### Page model

A canvas page is a normal tree node with `type: 'page'` and a new `kind: 'canvas'` field. A missing `kind` means text, so existing pages need no migration.

Don't add a third `type`. `findFirstPage`, `pageExists` and `TreeNode.vue` all check for `type === 'page'`.

### Changes to existing code

- **`src/shared/types.ts`:** add `kind` to `TreeNode`.
- **`useFileTree.ts`:** let `createPage` accept `kind`, and copy it in `buildTreeNode`.
- **Sidebar and context menu:** add "New canvas" and a canvas page icon.
- **`usePageDocs.ts`:** expose `ydoc.getArray('strokes')`. The room name and IndexedDB persistence don't change.
- **`RoomPage.vue`:** show `CanvasEditor` for canvas pages. Clear `liveEditor` there, because `useVoiceCapture` would otherwise insert into a destroyed editor. Hide the text toolbar, mic and Practice.

The sync server should need no changes, because it only relays Yjs updates.

### New code: `src/features/canvas/`

| File | Responsibility |
|---|---|
| `CanvasEditor.vue` | Hosts the canvas layers and tool picker |
| `useInkInput.ts` | Turns pointer events into stroke points |
| `useStrokes.ts` | Wraps the Yjs array, add and erase, undo and redo |
| `useViewport.ts` | Pan, zoom, and screen-to-canvas conversion |
| `strokeCodec.ts` | Packs points into a `Uint8Array` and unpacks them |
| `renderer.ts` | Draws strokes with `perfect-freehand` and `Path2D` |

## Stroke storage

Each finished stroke is one immutable item in the `strokes` Y.Array:

```ts
{ id, tool, color, size, simulatePressure, pts: Uint8Array }
```

`pts` uses delta encoding and varints, with 0.1 canvas-unit precision and 8-bit pressure. Coordinates are canvas coordinates, not screen coordinates. `simulatePressure` tells other users how to draw the stroke.

Benchmark with 3,000 synthetic strokes of 60 points each, on Yjs 13.6.33:

| Approach | Sent over network | Document size | After erasing 50% | Write time |
|---|---:|---:|---:|---:|
| Live `Y.Array`, one update per point | 8.87 MB | 5.12 MB | 2.58 MB | 957 ms |
| JSON points, one update per stroke | 5.04 MB | 4.98 MB | 2.52 MB | 98 ms |
| Packed `Uint8Array`, one update per stroke | 0.77 MB | 0.71 MB | 0.39 MB | 34 ms |

This was a single run in Node, so use the ratios rather than the exact numbers. Real strokes can be much longer: the Deco 640 is rated at about 220 reports per second.

## Pen input

Tested on Chrome 156 on macOS with the Deco 640:

| Result | Value |
|---|---|
| `pointerType` | `mouse` (not `pen`) |
| Pressure range | 0.000 to 0.275, with 68 distinct values |
| Tilt | Reported |
| Hover | Works |
| Buttons seen | Only `1`, the side button didn't register |
| `getCoalescedEvents` | Available |

The test's speed numbers aren't reliable because they included pauses between strokes. Safari hasn't been tested.

This leads to these rules:

- **Pressure detection:** don't rely on `pointerType`. Treat a fixed 0.5 while pressed as simulated pressure, and any other values as real pressure.
- **Pressure curve:** boost light pressure so normal writing uses the full stroke-width range. Tune it by hand.
- **Hover ring:** show a ring at the brush size for any pointer type.
- **Point capture:** use `getCoalescedEvents()` with a fallback, and drop points almost identical to the previous one.
- **Prediction:** use `getPredictedEvents()` on the live layer only, and never save those points.
- **Touch handling:** set `touch-action: none` on the drawing surface only.
- **Smoothing:** use `perfect-freehand`'s `streamline` option. The tablet's small area maps to a large display, so jitter is magnified.

### Shortcuts

| Key | Action |
|---|---|
| `P` | Pen |
| `H` | Highlighter |
| `E` | Eraser |
| `[` and `]` | Stroke size |
| `⌘Z` and `⇧⌘Z` | Undo and redo |
| `Space` | Pan |

The tablet's shortcut keys can send these through the XP-Pen driver. Erasing doesn't depend on the side button, but the driver can map that button to `E`.

## Data flow

### Drawing a stroke

1. On pointer down, start the stroke on the live canvas layer.
2. On each move, convert points to canvas coordinates and draw immediately, with no Vue reactivity in this path.
3. Send new points through page awareness, at most every 50 ms.
4. On pointer up, pack the stroke, add it to `strokes` in one Yjs update, and move it to the finished layer.

### Receiving strokes

Other users see the awareness preview first. Send only new points, because resending the whole stroke cost about 9× more in testing. The sender writes the finished stroke first, then clears its preview, so a lost preview update fixes itself. Clearing the preview on that signal also means it can't be left behind as a ghost stroke.

### Rendering

- **Finished layer:** cached strokes, redrawn only when needed.
- **Live layer:** the current stroke, using a `desynchronized` 2D context where supported.
- **Caching:** cache each stroke's `Path2D` and bounding box by `id`.
- **Culling:** draw only strokes on screen.
- **Redraws:** new strokes are added on top. Erase, undo, pan and zoom redraw visible strokes, at most once per frame.

### Erasing and undo

The eraser removes a whole stroke on contact, checking the bounding box first and then exact distance.

`Y.UndoManager` is scoped to `strokes` and tracks local changes only. It covers your own strokes and erases, including an erase of someone else's stroke.

### Local state

Tool, color, size and zoom position stay on each device and don't sync.

## Error handling

- **Offline:** strokes save to IndexedDB and sync on reconnect.
- **Local storage blocked:** the existing `persistenceError` banner applies.
- **Interrupted stroke:** on `pointercancel` or window blur, save the points so far as a finished stroke.
- **Bad stroke data:** skip the stroke, log a console warning, and render the rest.
- **Concurrent erase:** Yjs merges this safely. Undoing an erase restores the stroke.
- **Old cached app versions:** these open a canvas page as an empty text page. Typed text goes to a separate `content` field and doesn't affect strokes.

## Testing

### Automated (Vitest)

- **`strokeCodec`:** round trips, empty and single-point strokes, corrupted data
- **`useViewport`:** coordinate conversion at different zoom levels
- **Pressure:** detection and curve, including real pressure with `pointerType` set to `mouse`
- **`useStrokes`:** add, erase, undo, and syncing between two Y.Docs
- **`useFileTree`:** `kind` is kept, missing `kind` means text, canvas pages work with `findFirstPage` and `pageExists`
- **`RoomPage`:** switching to a canvas page clears `liveEditor`

### Manual, before merging

- Stroke feel and pressure curve with the XP-Pen
- Drawing in Chrome and Safari
- Live strokes in a second browser window
- Performance on a page with thousands of strokes

## Open items

- Test Safari with the Deco 640.
- Tune the pressure curve in the real editor.
- Choose final stroke sizes and the color palette during implementation.
