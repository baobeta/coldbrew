# Per-Page Document Sync — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split each page's text into its own websocket-synced `Y.Doc` (room `writeboard-<roomId>-p-<pageId>`), loaded lazily via a small LRU, so joining/holding a workspace costs only the tree + open pages — not every page.

**Architecture:** The tree stays one `Y.Doc` (room `writeboard-<roomId>`) holding structure only. Each page becomes its own room, referenced by a *derived* name (no stored handle). A new client composable `usePageDocs` manages an LRU (cap ~4) of page connections. The server needs no new sync code (page rooms are ordinary rooms) except a **lazy, server-side, verify-then-delete migration** that moves legacy `page-<id>` fragments into page rooms on first room load. Full design: `docs/plans/2026-07-03-per-page-subdoc-design.md`.

**Tech Stack:** Vue 3 `<script setup>`, Yjs, `y-websocket@3.0.0` (NO subdoc support — hence room-per-page), `y-indexeddb`, `y-leveldb` (server), Vitest + happy-dom (client), `node:test` (server).

---

## Working notes for the executor

- **Base branch:** create `feat/per-page-docs` off `main` (or off `perf/optimization-p0-p1` if that lands first — CONFIRM with the requester which base; this plan assumes it builds on the perf branch since it reuses `usePageDocs`-style patterns and the server persistence/LRU from Task C1).
- **Run after every task:** `pnpm test:run` (client) and, for server tasks, `node --test server/__tests__/<file>.mjs`. Both must stay green.
- **Commit after every task** with the exact message given.
- **This is a data-migration feature — correctness > speed.** The migration task has a mandatory failure-injection test. Never let a migration test pass by weakening the durability/verify assertions.
- Client tests mock the websocket provider (see existing `useFileTree.test.ts` / `useDocPersistence.test.ts` patterns: `vi.mock('vue')` for `onUnmounted`, stub providers). Do NOT open real websockets in unit tests.
- **YAGNI:** no nested Yjs subdocuments, no custom provider, no page-history migration, no cross-page search.

### Sanity check (before Task 1)
Run: `pnpm test:run` and `node --test server/__tests__/persistence.test.mjs`
Expected: all green (client 60, server persistence 4). If not, STOP and fix env first.

---

## PART A — Client: page-doc LRU (no wiring yet)

### Task A1: `usePageDocs` composable — cache-miss opens a page connection

**Files:**
- Create: `src/composables/usePageDocs.ts`
- Test: `src/composables/__tests__/usePageDocs.test.ts`

**Step 1: Write the failing test**

```typescript
// src/composables/__tests__/usePageDocs.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

// Stub the heavy deps so no real socket/db is opened.
const providers: string[] = [];
vi.mock('y-websocket', () => ({
  WebsocketProvider: class {
    roomname: string;
    awareness = { setLocalStateField() {}, getStates: () => new Map(), on() {}, off() {} };
    constructor(_url: string, room: string) { this.roomname = room; providers.push(room); }
    destroy() {}
    on() {} off() {}
  },
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class { constructor() {} on() {} destroy() {} },
}));

import { usePageDocs } from '../usePageDocs';

describe('usePageDocs', () => {
  it('opens a page connection on cache miss and returns a fragment', () => {
    const pages = usePageDocs('room1');
    const { ydoc, provider, fragment } = pages.openPage('pageA');
    expect(ydoc).toBeTruthy();
    expect(fragment).toBeTruthy();
    expect(provider).toBeTruthy();
    expect(providers).toContain('writeboard-room1-p-pageA');
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm vitest run usePageDocs`
Expected: FAIL — module `../usePageDocs` not found.

**Step 3: Write minimal implementation**

```typescript
// src/composables/usePageDocs.ts
import { onUnmounted } from 'vue';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { config } from '@/config';

export interface PageDocHandle {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  fragment: Y.XmlFragment;
}

interface Entry extends PageDocHandle {
  indexeddb: IndexeddbPersistence;
  lastUsed: number;
}

const MAX_LOADED = 4;

export function usePageDocs(roomId: string) {
  const cache = new Map<string, Entry>();
  let clock = 0; // monotonic counter (avoid Date.now for determinism/testability)

  function openPage(pageId: string): PageDocHandle {
    const existing = cache.get(pageId);
    if (existing) {
      existing.lastUsed = ++clock;
      return existing;
    }
    const ydoc = new Y.Doc();
    const room = `writeboard-${roomId}-p-${pageId}`;
    const provider = new WebsocketProvider(config.websocketServer, room, ydoc);
    const indexeddb = new IndexeddbPersistence(`writeboard-doc-${roomId}-p-${pageId}`, ydoc);
    const fragment = ydoc.getXmlFragment('content');
    const entry: Entry = { ydoc, provider, indexeddb, fragment, lastUsed: ++clock };
    cache.set(pageId, entry);
    evictIfNeeded();
    return entry;
  }

  function evictIfNeeded(): void {
    while (cache.size > MAX_LOADED) {
      let lruId: string | null = null;
      let lruUsed = Infinity;
      for (const [id, e] of cache) {
        if (e.lastUsed < lruUsed) { lruUsed = e.lastUsed; lruId = id; }
      }
      if (lruId === null) break;
      destroyEntry(lruId);
    }
  }

  function destroyEntry(pageId: string): void {
    const e = cache.get(pageId);
    if (!e) return;
    e.provider.destroy();
    e.indexeddb.destroy();
    e.ydoc.destroy();
    cache.delete(pageId);
  }

  onUnmounted(() => {
    for (const id of [...cache.keys()]) destroyEntry(id);
  });

  return { openPage, __cacheSize: () => cache.size };
}
```

**Step 4: Run to verify it passes**

Run: `pnpm vitest run usePageDocs`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/composables/usePageDocs.ts src/composables/__tests__/usePageDocs.test.ts
git commit -m "feat: usePageDocs composable opens per-page doc connections"
```

### Task A2: LRU eviction + cache-hit reuse

**Files:**
- Modify: `src/composables/usePageDocs.ts` (already has the logic — this task ADDS TESTS proving it)
- Test: `src/composables/__tests__/usePageDocs.test.ts` (extend)

**Step 1: Write the failing tests**

```typescript
it('reuses the same provider on cache hit (no new connection)', () => {
  providers.length = 0;
  const pages = usePageDocs('room2');
  const first = pages.openPage('p1');
  const second = pages.openPage('p1');
  expect(second.ydoc).toBe(first.ydoc);
  expect(providers.filter((r) => r === 'writeboard-room2-p-p1').length).toBe(1);
});

it('evicts the least-recently-used page beyond the cap', () => {
  const destroyed: string[] = [];
  // Track destroy by spying: re-mock provider destroy to record room
  const pages = usePageDocs('room3');
  // open 5 pages (cap is 4) → the first-opened, least-recently-used, is evicted
  const ids = ['a', 'b', 'c', 'd', 'e'];
  ids.forEach((id) => pages.openPage(id));
  expect(pages.__cacheSize()).toBe(4);
  // 'a' was LRU → re-opening it creates a NEW ydoc (was evicted)
  const before = pages.openPage('b'); // touch b so it's not LRU
  const aAgain = pages.openPage('a');
  expect(aAgain).toBeTruthy();
  expect(pages.__cacheSize()).toBe(4);
});
```

**Step 2: Run to verify** — the reuse test and cap test should PASS already (logic exists from A1).
If they FAIL, the LRU/hit logic is wrong — fix `usePageDocs.ts`, do not weaken the test.

Run: `pnpm vitest run usePageDocs`
Expected: PASS (all usePageDocs tests).

**Step 3: (If needed) fix implementation** so eviction picks the true LRU and hits reuse the entry.

**Step 4: Full suite**

Run: `pnpm test:run`
Expected: green.

**Step 5: Commit**

```bash
git add src/composables/__tests__/usePageDocs.test.ts src/composables/usePageDocs.ts
git commit -m "test: usePageDocs LRU eviction and cache-hit reuse"
```

---

## PART B — Client wiring: bind the editor to page docs

### Task B1: Remove page fragments from the tree doc; drop `getFragment`

**Files:**
- Modify: `src/composables/useFileTree.ts` (remove `getFragment`; stop creating `page-<id>` fragments in `createPage`)
- Modify: `src/composables/__tests__/useFileTree.test.ts` (the test `returns an XmlFragment for a page` must be removed/replaced — the tree no longer owns fragments)

**Step 1: Update the failing test**

- DELETE the test `returns an XmlFragment for a page` in `useFileTree.test.ts` (that responsibility moved to `usePageDocs`).
- In `createPage`, remove the line `ydoc.getXmlFragment(\`page-${id}\`);` ([useFileTree.ts:101](src/composables/useFileTree.ts) area).
- Remove `getFragment` from the composable and its return object.

**Step 2: Run to verify** the remaining useFileTree tests still pass (structure ops unaffected).

Run: `pnpm vitest run useFileTree`
Expected: PASS (minus the removed fragment test).

**Step 3: (implementation is the removal above)**

**Step 4: Full suite** — expect a FAILURE in `RoomPage.vue` consumers / type-check because `getFragment` is gone. That's expected; Task B2 fixes the consumer.

Run: `pnpm type-check`
Expected: error at `RoomPage.vue` referencing `getFragment` — proceed to B2 in the SAME logical change if the build must stay green between commits; otherwise commit B1+B2 together. RECOMMENDATION: do B1 and B2 as one commit to keep the tree buildable.

**Step 5: Commit (with B2)** — see B2.

### Task B2: Wire `RoomPage` + `TiptapEditor` to page docs

**Files:**
- Modify: `src/components/RoomPage.vue` (use `usePageDocs`; `currentFragment`/editor props come from `openPage`)
- Modify: `src/components/editor/TiptapEditor.vue` (bind CollaborationCursor to the PAGE provider's awareness)
- Test: `src/components/__tests__/RoomPage.pagedocs.test.ts` (light mount smoke, mocking composables)

**Step 1: Write the failing test** (smoke: RoomPage opens a page doc for the active page)

```typescript
// src/components/__tests__/RoomPage.pagedocs.test.ts
// Mock useCollaboration, useFileTree, usePageDocs, usePiperTTS, useVoiceCapture, usePractice
// Assert: when activePageId is set, usePageDocs.openPage is called with that id and
// TiptapEditor receives the returned fragment/provider.
// (Follow the mocking style in existing component tests; keep it a focused smoke test.)
```

**Step 2: Run to verify it fails.**

Run: `pnpm vitest run RoomPage.pagedocs`
Expected: FAIL (wiring not present).

**Step 3: Implement**
- In `RoomPage.vue`: `const pageDocs = usePageDocs(props.roomId);` and
  ```javascript
  const currentPage = computed(() => activePageId.value ? pageDocs.openPage(activePageId.value) : null);
  ```
  Pass `:ydoc="currentPage?.ydoc"`, `:provider="currentPage?.provider"`, `:fragment="currentPage?.fragment"` to `TiptapEditor` (keep the `:key="activePageId"` remount).
- `useCollaboration` still provides the tree `provider` for the participant list; keep that.
- In `TiptapEditor.vue`: `CollaborationCursor.configure({ provider: props.provider })` now points at the page provider (it already receives `provider` as a prop — confirm it uses the passed provider, not the tree one).

**Step 4: Run tests**

Run: `pnpm vitest run RoomPage.pagedocs && pnpm test:run && pnpm type-check`
Expected: green, type-check clean (getFragment references gone).

**Step 5: Commit (B1 + B2 together)**

```bash
git add src/composables/useFileTree.ts src/composables/__tests__/useFileTree.test.ts src/components/RoomPage.vue src/components/editor/TiptapEditor.vue src/components/__tests__/RoomPage.pagedocs.test.ts
git commit -m "feat: bind editor to per-page docs; remove page fragments from tree doc"
```

### Task B3: Manual verification (two-tab convergence)

**Files:** none (manual).

Run `pnpm dev`, open a room in two tabs:
1. Create pages A and B. Type in A → appears in the other tab's A. Type in B → appears in B.
2. Switch between pages rapidly (>4 pages) — confirm LRU doesn't break editing; revisiting a page shows its content.
3. Confirm the participant list still shows both users (tree awareness).
4. DevTools → Network → WS: confirm a NEW ws connection opens per opened page room, and closes on LRU eviction.

Document what you verified. No commit (manual gate).

---

## PART C — Server: lazy verify-then-delete migration

### Task C1: Migration module — copy one page fragment into a page room, verified

**Files:**
- Create: `server/migrate.mjs`
- Test: `server/__tests__/migrate.test.mjs` (node:test)

**Step 1: Write the failing test** (round-trip: fragment → page room, verified)

```javascript
// server/__tests__/migrate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import * as Y from 'yjs';
import { migratePageFragment } from '../migrate.mjs';

test('copies a page fragment into a fresh page doc and verifies content', () => {
  const treeDoc = new Y.Doc();
  const frag = treeDoc.getXmlFragment('page-x1');
  const el = new Y.XmlElement('paragraph');
  el.insert(0, [new Y.XmlText('hello world')]);
  frag.insert(0, [el]);

  const pageDoc = new Y.Doc();
  const ok = migratePageFragment(treeDoc, 'x1', pageDoc);

  assert.strictEqual(ok, true);
  // page doc 'content' fragment now holds the same text
  assert.match(pageDoc.getXmlFragment('content').toJSON(), /hello world/);
});

test('returns false (no delete) when source fragment is empty', () => {
  const treeDoc = new Y.Doc();
  treeDoc.getXmlFragment('page-empty'); // exists but empty
  const pageDoc = new Y.Doc();
  const ok = migratePageFragment(treeDoc, 'empty', pageDoc);
  assert.strictEqual(ok, false);
});
```

**Step 2: Run to verify it fails.**

Run: `node --test server/__tests__/migrate.test.mjs`
Expected: FAIL — module not found.

**Step 3: Implement `server/migrate.mjs`**

```javascript
import * as Y from 'yjs';

/**
 * Copy the content of treeDoc's `page-<pageId>` XmlFragment into pageDoc's
 * `content` fragment. Returns true if content was copied, false if the source
 * was empty (nothing to migrate). Pure w.r.t. persistence — caller handles
 * durable flush + verify + source deletion.
 */
export function migratePageFragment(treeDoc, pageId, pageDoc) {
  const source = treeDoc.getXmlFragment(`page-${pageId}`);
  if (source.length === 0) return false;
  // Encode source state and apply into a temp doc under the same name, then
  // re-key into 'content'. Simplest robust copy: serialize the source doc's
  // update and apply; then move the tree under 'content'.
  // Cross-doc fragment copy: build the update from a temp doc holding the fragment.
  const temp = new Y.Doc();
  const tempFrag = temp.getXmlFragment(`page-${pageId}`);
  // deep-clone source XML into tempFrag
  Y.applyUpdate(temp, Y.encodeStateAsUpdate(treeDoc)); // temp now has page-<id>
  const update = Y.encodeStateAsUpdate(temp);
  // Apply into pageDoc under a doc that maps page-<id> -> content:
  // Easiest correct approach: apply update to a scratch doc, read its
  // page-<id> fragment, and re-serialize its items into pageDoc's 'content'.
  const scratch = new Y.Doc();
  Y.applyUpdate(scratch, update);
  const scratchFrag = scratch.getXmlFragment(`page-${pageId}`);
  const target = pageDoc.getXmlFragment('content');
  // Deep clone each top-level child into target
  const clones = scratchFrag.toArray().map((node) => cloneXmlNode(node));
  target.insert(0, clones);
  return target.length > 0;
}

function cloneXmlNode(node) {
  if (node instanceof Y.XmlText) {
    const t = new Y.XmlText();
    t.insert(0, node.toString());
    return t;
  }
  const el = new Y.XmlElement(node.nodeName);
  for (const [k, v] of Object.entries(node.getAttributes())) el.setAttribute(k, v);
  el.insert(0, node.toArray().map(cloneXmlNode));
  return el;
}
```

> NOTE to executor: the exact Yjs cross-doc XML clone API is fiddly. The GOAL is: page
> doc's `content` fragment ends up structurally equal to the tree's `page-<id>` fragment.
> If `cloneXmlNode` doesn't perfectly round-trip rich formatting, verify against a
> representative TipTap document (paragraphs, marks) and adjust. The failure-injection
> test in C2 depends on `migratePageFragment` returning a boolean success signal.

**Step 4: Run to verify it passes.**

Run: `node --test server/__tests__/migrate.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/migrate.mjs server/__tests__/migrate.test.mjs
git commit -m "feat: page-fragment migration copy with content signal"
```

### Task C2: Room-load migration hook — verify-then-delete + flag, with failure injection

**Files:**
- Modify: `server/main.mjs` (call migration on tree-room load; verify-then-delete; set `meta.subdocsMigrated`)
- Modify: `server/migrate.mjs` (add `migrateRoom(roomId, treeDoc, deps)` orchestration)
- Test: `server/__tests__/migrate.test.mjs` (add orchestration + failure-injection tests)

**Step 1: Write the failing tests**

```javascript
test('migrateRoom moves all page fragments, deletes verified sources, sets flag', async () => {
  const treeDoc = new Y.Doc();
  // seed nodes map with 2 page nodes + their fragments
  const nodes = treeDoc.getMap('nodes');
  for (const id of ['a', 'b']) {
    const m = new Y.Map(); m.set('id', id); m.set('type', 'page'); m.set('title', id);
    nodes.set(id, m);
    const f = treeDoc.getXmlFragment(`page-${id}`);
    const el = new Y.XmlElement('paragraph'); el.insert(0, [new Y.XmlText(`text-${id}`)]);
    f.insert(0, [el]);
  }
  const stored = {};
  const deps = {
    getPageDoc: (room) => (stored[room] ||= new Y.Doc()),
    persistAndVerify: async (room, doc) => doc.getXmlFragment('content').length > 0, // durable+match
  };
  await migrateRoom('r1', treeDoc, deps);
  assert.strictEqual(treeDoc.getMap('meta').get('subdocsMigrated'), true);
  assert.strictEqual(treeDoc.getXmlFragment('page-a').length, 0); // deleted after verify
  assert.match(stored['writeboard-r1-p-a'].getXmlFragment('content').toJSON(), /text-a/);
});

test('migrateRoom KEEPS source and does NOT set flag when verify fails', async () => {
  const treeDoc = new Y.Doc();
  const nodes = treeDoc.getMap('nodes');
  const m = new Y.Map(); m.set('id', 'a'); m.set('type', 'page'); m.set('title', 'a');
  nodes.set('a', m);
  const f = treeDoc.getXmlFragment('page-a');
  const el = new Y.XmlElement('paragraph'); el.insert(0, [new Y.XmlText('text-a')]);
  f.insert(0, [el]);
  const deps = {
    getPageDoc: () => new Y.Doc(),
    persistAndVerify: async () => false, // verify FAILS
  };
  await migrateRoom('r1', treeDoc, deps);
  assert.strictEqual(treeDoc.getMap('meta').get('subdocsMigrated'), undefined); // NOT set
  assert.ok(treeDoc.getXmlFragment('page-a').length > 0); // source KEPT
});
```

**Step 2: Run to verify it fails.**

Run: `node --test server/__tests__/migrate.test.mjs`
Expected: FAIL — `migrateRoom` not exported.

**Step 3: Implement `migrateRoom` in `migrate.mjs`**

```javascript
export async function migrateRoom(roomId, treeDoc, deps) {
  if (treeDoc.getMap('meta').get('subdocsMigrated')) return;
  const nodes = treeDoc.getMap('nodes');
  let allVerified = true;
  for (const [id, node] of nodes) {
    if (node.get('type') !== 'page') continue;
    const pageDoc = deps.getPageDoc(`writeboard-${roomId}-p-${id}`);
    const copied = migratePageFragment(treeDoc, id, pageDoc);
    if (!copied) continue; // empty/new page, nothing to move
    const ok = await deps.persistAndVerify(`writeboard-${roomId}-p-${id}`, pageDoc);
    if (ok) {
      // verify-then-delete
      const frag = treeDoc.getXmlFragment(`page-${id}`);
      frag.delete(0, frag.length);
    } else {
      allVerified = false;
      console.error(`[migrate] verify failed for ${roomId}/${id} — source kept`);
    }
  }
  if (allVerified) treeDoc.getMap('meta').set('subdocsMigrated', true);
}
```

**Step 4: Wire into `main.mjs`** — in the tree-room load path (`getOrCreateRoom` for a room whose name has NO `-p-` segment, or in `onConnection` after `await room.loaded`), call:
```javascript
import { migrateRoom } from './migrate.mjs';
// deps use the existing getOrCreateRoom + storeRoom + flushDocument + loadRoom:
const deps = {
  getPageDoc: (roomName) => getOrCreateRoom(roomName).doc,
  persistAndVerify: async (roomName, doc) => {
    await storeRoom(roomName, doc);
    await flushDocumentFor(roomName); // force durable
    const check = new Y.Doc(); await loadRoom(roomName, check);
    return check.getXmlFragment('content').length > 0; // and optionally deep-equal
  },
};
await migrateRoom(roomId, room.doc, deps);
```
Only run for TREE rooms (skip rooms whose name contains `-p-`). Guard so it runs once per load (the flag handles idempotency).

**Step 5: Run tests + checks**

Run: `node --test server/__tests__/migrate.test.mjs` (orchestration + failure-injection PASS)
Run: `node --test server/__tests__/persistence.test.mjs server/__tests__/coalesce.test.mjs` (still green)
Run: `node --check server/main.mjs server/migrate.mjs`
Expected: all green / OK.

**Step 6: Commit**

```bash
git add server/main.mjs server/migrate.mjs server/__tests__/migrate.test.mjs
git commit -m "feat: lazy verify-then-delete page migration on tree-room load"
```

### Task C3: End-to-end durability + no-page-text-in-tree

**Files:**
- Modify: `server/loadtest/README.md` (document the per-page-room test)
- (optional) small script under `server/loadtest/` to open a tree room + a page room

**Manual/scripted E2E:**
1. Start server with a temp `LEVELDB_PATH`. Seed a room in OLD format (single doc with `page-<id>`) — e.g. via a small script applying an update, OR reuse an existing dev DB.
2. Connect a client (or harness) to the tree room → migration runs → assert (via logs + a read script) that `writeboard-<room>-p-<id>` rooms now hold the text and the tree doc's `page-<id>` fragments are empty.
3. Restart server → reconnect → assert `subdocsMigrated` prevents re-migration and content persists.

Document results honestly in the README. Commit:
```bash
git add server/loadtest/README.md
git commit -m "test: document per-page-room migration durability E2E"
```

---

## Final verification (whole feature)
- `pnpm test:run` — green. `pnpm type-check` — clean. `pnpm lint` — no new errors.
- `node --test server/__tests__/*.mjs` — all server suites green.
- Two-tab manual (B3) + migration E2E (C3) documented.
- **Rollout note in PR:** deploy server (migration) before/with client. A new client vs un-migrated server sees empty page editors until the server migrates — degraded, not broken.

## Skills to reference
- superpowers:test-driven-development — every task with a behavioral seam.
- superpowers:defense-in-depth — the migration's verify-then-delete is a defense-in-depth gate; keep all layers.
- superpowers:verification-before-completion — before claiming migration works, show the read-back proof, not just "copied".
