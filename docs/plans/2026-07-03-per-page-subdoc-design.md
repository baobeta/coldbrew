# Per-Page Document Sync — Design

**Status:** Validated via brainstorming, ready for implementation planning.
**Date:** 2026-07-03

## Problem

WriteBoard stores an entire room (the file tree + the text of *every* page) in a single
`Y.Doc`. Page text lives in `page-<id>` `Y.XmlFragment`s inside that one doc.

- **Per-keystroke sync is already fine** — a Yjs update is scoped to the edited fragment (~tens of bytes).
- **The real cost is initial sync + memory.** Joining a room sends `writeSyncStep2` = the FULL
  room state (all pages). Server RAM per room and each client's IndexedDB hold the whole room.
  With many/large pages this is expensive even to *view one page*.

## Goal

Load and hold **only the file tree + the currently-open page(s)**, not the whole workspace.

## Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Topology | **One tree doc + one doc per page**, each its own websocket room | Lazy load per page; reuses existing per-room server |
| Subdoc transport | **Room-per-page** (`writeboard-<roomId>-p-<pageId>`) | `y-websocket@3.0.0` has NO subdocument sync — verified. Room-per-page reuses the stock provider AND server unchanged |
| Tree→page reference | **Derived room name** (`writeboard-<roomId>-p-<id>`) — no stored handle | Tree stays tiny; no Y.Doc handle to serialize |
| Unload policy | **Small LRU** of loaded page docs (cap ~4) | Instant back-and-forth, bounded memory |
| Migration | **Server-side, lazy on first room load**, guarded by a flag | Authoritative, once, no client races |
| Old data on migrate | **Verify-then-delete** (force-flush + read-back before deleting source) | Real production data exists; durability gate prevents irreversible loss |

### Key finding that shaped the design
`y-websocket@3.0.0` does not sync Yjs *subdocuments* — the provider syncs one doc per
connection. So the design uses **flat per-page rooms** (functionally per-page top-level docs),
NOT nested `Y.Doc` subdocuments. The tree node references a page by a derived room-name string.

## Architecture

### Data model

**Tree doc** — room `writeboard-<roomId>` (name unchanged → workspace presence stays here):
- `nodes` (Y.Map), `rootChildren` / `children:<id>` (Y.Arrays) — structure only.
- `meta` (Y.Map) — holds `subdocsMigrated: boolean`.
- **No `page-<id>` fragments** after migration.

**Page doc** — room `writeboard-<roomId>-p-<pageId>`, one per page, lazily connected:
- A single `Y.XmlFragment 'content'` that TipTap binds to.

### Client

**New composable `usePageDocs(roomId)`** — owns an LRU (cap ~4) of page connections:
```
Map<pageId, { ydoc, provider, indexeddb, fragment, lastUsed }>
openPage(pageId):
  hit  -> touch lastUsed, return existing
  miss -> new Y.Doc + WebsocketProvider(`writeboard-<roomId>-p-<pageId>`)
          + IndexeddbPersistence(`writeboard-doc-<roomId>-p-<pageId>`)
          -> if size > cap, evict LRU (destroy provider + doc)
onUnmounted -> destroy all
```

**Wiring changes:**
- `useCollaboration.ts` — stays the **tree** connection; workspace presence/participant list here. No longer carries page text.
- `useFileTree.ts` — `getFragment(id)` **removed**; the tree doc holds no page fragments. Its job is pure structure (already optimized by the incremental-sync branch).
- `RoomPage.vue` — `currentFragment` becomes `usePageDocs.openPage(activePageId)` → `{ ydoc, provider, fragment }`.
- `TiptapEditor.vue` — binds to the **page's** ydoc/provider/fragment. Existing `:key="activePageId"` remounts the editor per page (clean rebind). `CollaborationCursor` binds to the **page provider's** awareness (cursors scoped per page); tree awareness drives the participant list.

### Server (`main.mjs`)

Page rooms need **no new sync code** — they are ordinary rooms; the existing per-room doc,
LevelDB persistence, LRU eviction, coalescing, and backpressure all apply.

**Only new logic: migration hook** in the tree room's load path:
```
onTreeRoomLoad(roomId, treeDoc):
  if treeDoc.getMap('meta').get('subdocsMigrated'): return
  allVerified = true
  for each page-node id in treeDoc nodes:
    old = treeDoc.getXmlFragment(`page-${id}`)
    if old has content:
      pageRoom = getOrCreateRoom(`writeboard-${roomId}-p-${id}`); await pageRoom.loaded
      copy old content -> pageRoom.doc 'content'      (encodeStateAsUpdate on temp doc -> applyUpdate)
      await storeRoom(pageRoom); await flushDocument(pageRoom)   // force durable
      readBack = fresh loadRoom(pageRoom) ; if content matches:
        treeDoc.delete(`page-${id}`)                 // verify-then-delete
      else: allVerified = false; console.error(...)  // KEEP source, will retry next load
  if allVerified: treeDoc.getMap('meta').set('subdocsMigrated', true)
```

**Idempotency:** re-running skips already-migrated pages (old fragment now empty). A crash
mid-migration is recoverable — source is only deleted after a durable read-back verify.

**Client fallback:** opening a page whose room is empty (not yet migrated / brand new) yields an
empty editor that works; it populates once the server migration runs and the client resyncs.
No hard ordering dependency.

### Rollout ordering
Deploy the **server migration before/with the client**. A new client against an un-migrated
server finds empty page rooms (degraded: empty editor until server catches up), not broken.

## Testing

- **Migration (node:test):** seed tree with N `page-<id>` fragments of known text → migrate →
  assert each page room has that text, old fragments deleted, flag set. **Failure-injection:**
  force one page's read-back verify to fail → assert its source fragment is KEPT and flag unset.
- **`usePageDocs` (vitest):** LRU eviction (open > cap → oldest provider destroyed), cache-hit
  reuses provider, `openPage` returns a working fragment. Mock provider per existing test style.
- **End-to-end (extended load harness):** open tree room + a page room, edit page, second client
  on that page room converges; assert tree room carries no page text.

## Out of scope (YAGNI)
- Nested Yjs subdocuments / custom multiplexed provider (rejected — room-per-page is simpler).
- Migrating page *history* (only current content is preserved; Yjs history in old fragments is dropped).
- Cross-page search that would require all page content loaded (would defeat lazy loading).

## Risks
- **Migration data loss** — mitigated by verify-then-delete + keeping source until durable read-back.
- **Connection count** — bounded by the LRU cap (1 tree + ≤4 page rooms per user).
- **Awareness split** — cursors move to page rooms; ensure participant list still reads tree awareness.
