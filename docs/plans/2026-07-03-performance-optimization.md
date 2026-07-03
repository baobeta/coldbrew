# WriteBoard Performance Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the O(N)-per-edit costs in the file tree, the main-thread jank + silent data loss in local persistence, and the memory-only/single-instance limits in the sync server — so WriteBoard stays fast with 500+ pages, large documents, and many concurrent users.

**Architecture:** Three independent axes, sequenced P0→P2. Axis 1 (pages) makes tree updates surgical instead of full-forest rebuilds and collapses per-node global listeners into one. Axis 2 (doc size) replaces hand-rolled full-snapshot localStorage with `y-indexeddb` incremental persistence. Axis 3 (users) adds server-side persistence and a horizontal-scaling story. Each task is TDD where a behavioral seam exists; a shared 500-node seed script gives reproducible before/after profiling numbers.

**Tech Stack:** Vue 3 (`<script setup>`), Yjs + y-websocket, TipTap, Vitest + happy-dom, `@vueuse/core`, pnpm. New deps: `y-indexeddb` (client), `y-leveldb` (server).

---

## How to work this plan

- Execute tasks **in order**. Parts are independent enough to split across sessions, but within a part the order matters.
- **Run the full suite after every task:** `pnpm test:run`. It must stay green.
- **Commit after every task** (frequent commits). Use the exact messages given.
- Behavioral tests live next to the code in `__tests__/` and follow the existing pattern in
  `src/composables/__tests__/useFileTree.test.ts` (mock provider, `vi.mock('vue')` to stub `onUnmounted`).
- **DRY / YAGNI:** don't add abstraction the tasks don't call for. Don't optimize `usePractice.ts` — it is not a bottleneck.
- The tree currently rebuilds via `syncTree()` on every Yjs event. Preserving that *observable behavior* (tree stays correct) while changing *how* it updates is the core discipline. Behavioral tests are the guardrail.

### Environment sanity check (do once, before Part 0)

Run: `pnpm test:run`
Expected: existing suites pass (`useFileTree`, `usePractice`). If not, STOP and fix the environment first.

---

## PART 0 — Measurement harness (do this FIRST)

You cannot claim a speedup without a number. This part adds a reusable seed script and a tiny
instrumentation counter so every later task has a before/after.

### Task 0.1: Seed-doc generator for profiling

**Files:**
- Create: `scripts/seed-doc.ts`

**Step 1: Write the generator**

Creates a Yjs doc populated to match `useFileTree`'s schema (flat `nodes` map + `rootChildren` +
`children:<id>` arrays), so it can be loaded in a browser console or a bench test.

```typescript
// scripts/seed-doc.ts
import * as Y from 'yjs';

/**
 * Build a Yjs doc with `pages` pages spread across `folders` folders,
 * matching the schema in src/composables/useFileTree.ts.
 * Returns the doc and a base64 state string you can paste into localStorage
 * under `writeboard-doc-<room>` to reproduce a large tree locally.
 */
export function seedDoc(pages = 500, folders = 50): { doc: Y.Doc; nodeCount: number } {
  const doc = new Y.Doc();
  const nodes = doc.getMap<Y.Map<unknown>>('nodes');
  const rootChildren = doc.getArray<string>('rootChildren');

  let counter = 0;
  const id = () => `n${(counter++).toString(36)}`;

  const folderIds: string[] = [];
  doc.transact(() => {
    for (let f = 0; f < folders; f++) {
      const fid = id();
      const m = new Y.Map();
      m.set('id', fid);
      m.set('type', 'folder');
      m.set('title', `Folder ${f}`);
      m.set('parentId', null);
      nodes.set(fid, m);
      rootChildren.push([fid]);
      folderIds.push(fid);
    }
    for (let p = 0; p < pages; p++) {
      const pid = id();
      const parent = folderIds.length ? folderIds[p % folderIds.length] : null;
      const m = new Y.Map();
      m.set('id', pid);
      m.set('type', 'page');
      m.set('title', `Page ${p}`);
      m.set('parentId', parent);
      nodes.set(pid, m);
      if (parent) doc.getArray<string>(`children:${parent}`).push([pid]);
      else rootChildren.push([pid]);
    }
  });

  return { doc, nodeCount: counter };
}
```

**Step 2: Verify it runs**

Run: `pnpm vitest run --no-coverage -t "seed" 2>/dev/null; node --experimental-strip-types -e "import('./scripts/seed-doc.ts').then(m=>{const {nodeCount}=m.seedDoc(500,50);console.log('nodes',nodeCount)})"`
Expected: prints `nodes 550` (or run it from a throwaway bench test if node TS stripping is unavailable).

If `--experimental-strip-types` is unavailable in this Node, skip the CLI check — the script is
consumed by bench tests in later tasks, which is the real verification.

**Step 3: Commit**

```bash
git add scripts/seed-doc.ts
git commit -m "test: add seed-doc generator for perf profiling"
```

### Task 0.2: Instrument syncTree with a call/work counter (temporary, test-only seam)

**Files:**
- Modify: `src/composables/useFileTree.ts` (add an optional injected counter — see below)

**Rationale:** To assert "a rename rebuilds fewer nodes," we need a countable seam. We add a
module-level, test-only counter that increments per `buildTreeNode` call, exposed via a returned
`__stats` object guarded so it is a no-op in production reasoning.

**Step 1: Write the failing test**

Create: `src/composables/__tests__/useFileTree.perf.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import { useFileTree } from '../useFileTree';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

function mockProvider() {
  return {
    awareness: { setLocalStateField() {}, getStates: () => new Map(), on() {} },
    on(_e: string, cb: (d: any) => void) { cb(true); },
  };
}

describe('useFileTree perf', () => {
  let ydoc: Y.Doc;
  let ft: ReturnType<typeof useFileTree>;

  beforeEach(() => {
    ydoc = new Y.Doc();
    ft = useFileTree(ydoc, mockProvider());
  });

  it('exposes a build counter for profiling', () => {
    expect(ft.__stats).toBeDefined();
    expect(typeof ft.__stats.buildCount).toBe('number');
  });

  it('counts node builds during a rename (baseline)', () => {
    // seed a handful of pages
    const ids = Array.from({ length: 10 }, (_, i) => ft.createPage(`P${i}`));
    const before = ft.__stats.buildCount;
    ft.rename(ids[0], 'Renamed');
    const delta = ft.__stats.buildCount - before;
    // Baseline: currently rebuilds the whole forest. This test DOCUMENTS the baseline;
    // Task A2 will tighten this bound.
    expect(delta).toBeGreaterThan(0);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm vitest run useFileTree.perf`
Expected: FAIL — `ft.__stats` is undefined.

**Step 3: Add the counter seam**

In `src/composables/useFileTree.ts`:
- Add near the top of `useFileTree`: `const __stats = { buildCount: 0 };`
- At the start of `buildTreeNode`, add: `__stats.buildCount++;`
- Add `__stats` to the returned object.

```typescript
// inside useFileTree, alongside other refs
const __stats = { buildCount: 0 };

function buildTreeNode(nodeId: string): TreeNode | null {
  __stats.buildCount++;
  const nodeMap = nodesMap.get(nodeId);
  // ...unchanged...
}

// in the return { ... } add:
  __stats,
```

**Step 4: Run to verify it passes**

Run: `pnpm vitest run useFileTree.perf`
Expected: PASS (both tests).

**Step 5: Commit**

```bash
git add src/composables/useFileTree.ts src/composables/__tests__/useFileTree.perf.test.ts
git commit -m "test: add buildCount seam to useFileTree for perf assertions"
```

---

## PART 1 — Axis 1: Many pages per room

### Task E: Single shared context menu (kill per-node global listeners)

**Problem:** `src/components/sidebar/TreeNode.vue:301-307` — every node registers
`document.addEventListener('click', ...)`. 500 nodes = 500 listeners firing on every click.

**Files:**
- Modify: `src/components/sidebar/TreeNode.vue` (remove per-node doc listener; emit a request instead)
- Modify: `src/components/sidebar/FileTree.vue` (own one context menu + one doc listener)
- Test: `src/components/sidebar/__tests__/FileTree.contextmenu.test.ts`

**Design:** `TreeNode` stops owning the menu. On `@contextmenu`, it emits
`open-context-menu` with `{ node, x, y }`. `FileTree` renders a **single** context-menu component,
holds the open state, and attaches **one** `document` click listener to close it. Menu actions
(`rename`, `delete`, `new-page`, `new-folder`) are re-emitted up as they already are.

**Step 1: Write the failing test**

```typescript
// src/components/sidebar/__tests__/FileTree.contextmenu.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FileTree from '../FileTree.vue';

const tree = [
  { id: 'a', type: 'folder', title: 'F', children: [{ id: 'b', type: 'page', title: 'P' }] },
];

describe('FileTree context menu', () => {
  it('renders at most one context menu regardless of node count', async () => {
    const wrapper = mount(FileTree, {
      props: { tree, activePageId: null, expandedFolders: new Set(['a']) },
    });
    // right-click the folder row
    await wrapper.find('[data-test="tree-row"]').trigger('contextmenu');
    const menus = wrapper.findAll('[data-test="context-menu"]');
    expect(menus.length).toBe(1);
  });
});
```

> Note: this requires `@vue/test-utils`. If not installed, add it as a devDep first:
> `pnpm add -D @vue/test-utils` and commit that separately as `chore: add @vue/test-utils`.

**Step 2: Run to verify it fails**

Run: `pnpm vitest run FileTree.contextmenu`
Expected: FAIL — no `[data-test]` hooks / menu not lifted yet.

**Step 3: Implement**

In `TreeNode.vue`:
- Add `data-test="tree-row"` to the row `div`.
- Remove `contextMenu`, `contextMenuStyle`, `showContextMenu`, `hideContextMenu`, `onContextAction`
  local menu state AND the `onMounted`/`onUnmounted` document click listeners.
- Change `@contextmenu.prevent="showContextMenu"` to `@contextmenu.prevent="onContextMenu"` where:

```javascript
function onContextMenu(e) {
  emit('open-context-menu', { node: props.node, x: e.clientX, y: e.clientY });
}
```

- Add `'open-context-menu'` to `defineEmits`.
- Keep `startRename`/`finishRename`/`cancelRename` (inline rename stays local).
- Ensure the recursive `<TreeNode>` in the template re-emits `@open-context-menu="$emit('open-context-menu', $event)"`.

In `FileTree.vue`:
- Add local state: `const contextMenu = ref(null)` (`{ node, x, y }` or null).
- Handle `@open-context-menu="contextMenu = $event"` on each `<TreeNode>`.
- Render ONE menu block (moved from TreeNode) with `data-test="context-menu"`, `v-if="contextMenu"`,
  positioned by `contextMenu.x/y`, dispatching to the existing emits (`rename`/`delete`/`create-page`/`create-folder`).
- Add ONE document listener in `onMounted` to close: `document.addEventListener('click', () => contextMenu.value = null)`; remove in `onUnmounted`.

**Step 4: Run to verify it passes**

Run: `pnpm vitest run FileTree.contextmenu && pnpm test:run`
Expected: new test PASS; all existing suites PASS.

**Step 5: Manual verification**

Run: `pnpm dev`, open a room, right-click nodes — exactly one menu shows, closes on outside click,
rename/delete/new-page/new-folder still work.

**Step 6: Commit**

```bash
git add src/components/sidebar/TreeNode.vue src/components/sidebar/FileTree.vue src/components/sidebar/__tests__/FileTree.contextmenu.test.ts
git commit -m "perf: lift tree context menu to single shared instance"
```

### Task F: O(1) folder-toggle reactivity

**Problem:** `expandedFolders` is one `Set` passed to every `TreeNode`
(`FileTree.vue:7`). Replacing it on toggle re-runs every node's `isExpanded` computed — O(N) per toggle.

**Files:**
- Modify: `src/components/sidebar/FileTree.vue` (compute per-node expanded in the `v-for`)
- Modify: `src/components/sidebar/TreeNode.vue` (accept `isExpanded` boolean prop; recurse passing child booleans)
- Test: extend `src/composables/__tests__/useFileTree.test.ts` (toggle behavior already covered) + a small render test

**Design:** Instead of passing the whole `Set` down and having each node call `.has()`, pass a
concrete `:is-expanded` boolean to each rendered node, computed at the point of iteration. The
parent still owns the `Set`; only the toggled node's boolean prop changes, so Vue only re-patches
that node. `TreeNode` keeps receiving `expandedFolders` ONLY to forward to its own children (or,
cleaner, compute children's booleans locally from a passed predicate). Prefer passing the `Set`
for forwarding but binding `:is-expanded` explicitly so the hot path is the boolean.

**Step 1: Write the failing test**

```typescript
// src/components/sidebar/__tests__/TreeNode.expanded.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TreeNode from '../TreeNode.vue';

describe('TreeNode expansion', () => {
  it('shows children only when isExpanded is true', async () => {
    const node = { id: 'f', type: 'folder', title: 'F', children: [{ id: 'c', type: 'page', title: 'C' }] };
    const wrapper = mount(TreeNode, {
      props: { node, depth: 0, activePageId: null, isExpanded: false, expandedFolders: new Set() },
    });
    expect(wrapper.text()).not.toContain('C');
    await wrapper.setProps({ isExpanded: true });
    expect(wrapper.text()).toContain('C');
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm vitest run TreeNode.expanded`
Expected: FAIL — `isExpanded` is currently a computed off `expandedFolders`, not a prop.

**Step 3: Implement**

In `TreeNode.vue`:
- Add prop `isExpanded: { type: Boolean, default: false }`.
- Delete the `const isExpanded = computed(...)` line; the template now reads the prop directly.
- Keep `expandedFolders` prop for forwarding to children.
- In the recursive `<TreeNode v-for="child ...">`, bind `:is-expanded="expandedFolders.has(child.id)"`.

In `FileTree.vue`:
- In the top-level `v-for`, bind `:is-expanded="expandedFolders.has(node.id)"`.

**Step 4: Run to verify it passes**

Run: `pnpm vitest run TreeNode.expanded && pnpm test:run`
Expected: PASS across the board.

**Step 5: Commit**

```bash
git add src/components/sidebar/TreeNode.vue src/components/sidebar/FileTree.vue src/components/sidebar/__tests__/TreeNode.expanded.test.ts
git commit -m "perf: make folder toggle O(1) via per-node isExpanded prop"
```

### Task A1: Coalesce tree rebuilds with requestAnimationFrame

**Problem:** `syncTree` runs synchronously on every Yjs event. A multi-node transaction (move,
bulk delete) fires many events → many full rebuilds in one tick.

**Files:**
- Modify: `src/composables/useFileTree.ts` (wrap `syncHandler` in rAF coalescing)
- Test: `src/composables/__tests__/useFileTree.perf.test.ts` (assert one rebuild per burst)

**Design:** Replace direct `syncTree()` calls in observers with a `scheduleSync()` that sets a
`pending` flag and schedules one `requestAnimationFrame` (fallback `queueMicrotask` in
non-DOM/test env). Multiple events in a tick collapse to a single `syncTree`.

**Step 1: Write the failing test**

Add to `useFileTree.perf.test.ts`:

```typescript
it('coalesces multiple edits in one tick into a single rebuild', async () => {
  const before = ft.__stats.syncCount ?? 0;
  ydoc.transact(() => {
    ft.createPage('X');
    ft.createPage('Y');
    ft.createPage('Z');
  });
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const delta = (ft.__stats.syncCount ?? 0) - before;
  expect(delta).toBe(1); // one coalesced rebuild, not three
});
```

Add a `syncCount` field to `__stats` incremented inside `syncTree`.

**Step 2: Run to verify it fails**

Run: `pnpm vitest run useFileTree.perf`
Expected: FAIL — currently increments per event (delta > 1), and `syncCount` may be undefined.

**Step 3: Implement**

```typescript
const __stats = { buildCount: 0, syncCount: 0 };

let syncScheduled = false;
function scheduleSync(): void {
  if (syncScheduled) return;
  syncScheduled = true;
  const run = () => { syncScheduled = false; syncTree(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else queueMicrotask(run);
}

function syncTree(): void {
  __stats.syncCount++;
  tree.value = rootChildren.toArray().map(buildTreeNode).filter(Boolean) as TreeNode[];
}
```

- Replace `const syncHandler = () => syncTree();` with `const syncHandler = () => scheduleSync();`
- In the `nodesMap.observe(() => { observeFolderChildren(); syncTree(); })` handler, change the
  trailing `syncTree()` to `scheduleSync()`. **Keep `observeFolderChildren()` synchronous** — new
  folders must get observers immediately, before the next event.
- Leave the initial `syncTree()` calls at setup synchronous (first paint should be immediate).

**Step 4: Run to verify it passes**

Run: `pnpm vitest run useFileTree.perf && pnpm test:run`
Expected: PASS. Existing `useFileTree.test.ts` tests that read `tree.value` synchronously after an
op MUST still pass — because those ops (`createPage` etc.) call `syncTree` through the observer
which is now async. **If they fail**, it's because tests read `tree.value` before the rAF fires.
Fix by having the mutation helpers (`createPage`, `createFolder`) call `syncTree()` synchronously
once at the end (they already return before paint), OR update the existing tests to `await` a
frame. PREFER the synchronous-final-sync approach to avoid churning existing tests — add a direct
`syncTree()` at the end of each public mutation that must reflect immediately.

> Decision to record during execution: keep public mutations synchronously consistent (call
> `syncTree()` at their end) and use `scheduleSync()` ONLY for the remote/observer path where
> bursts arrive. This preserves the existing synchronous test contract while coalescing remote bursts.

**Step 5: Manual verification**

`pnpm dev` — create/rename/move/delete still update the sidebar instantly; no visible lag.

**Step 6: Commit**

```bash
git add src/composables/useFileTree.ts src/composables/__tests__/useFileTree.perf.test.ts
git commit -m "perf: coalesce tree rebuilds via requestAnimationFrame"
```

### Task A2: Incremental tree sync (surgical updates)

**Problem:** Even coalesced, each rebuild is O(N). A single rename should touch one node.

**Files:**
- Modify: `src/composables/useFileTree.ts` (react to Yjs event granularity)
- Test: `src/composables/__tests__/useFileTree.perf.test.ts` (assert rename builds ≪ N nodes)

**Design (incremental strategy):** Maintain a `Map<string, TreeNode>` node cache. On observer
events, inspect what changed:
- **`nodesMap` key change** (title/type on an existing node): update `nodeCache.get(id).title`
  in place — no forest walk.
- **structural change** (a `children:*` array or `rootChildren` changed): rebuild only the affected
  subtree(s), reusing cached child nodes.
Yjs `Y.YMapEvent`/`Y.YArrayEvent` expose `event.target`, `event.keysChanged`, and `event.changes`.
Use `nodesMap.observeDeep((events) => ...)` and branch on `event.path` / `event.target`.

This is the most intricate task. Keep the full-rebuild path as a **fallback** for any event shape
you don't explicitly handle, so correctness never regresses (YAGNI on exotic cases; correctness first).

**Step 1: Write the failing test**

```typescript
it('rename touches far fewer nodes than the forest size', () => {
  const ids = Array.from({ length: 100 }, (_, i) => ft.createPage(`P${i}`));
  const before = ft.__stats.buildCount;
  ft.rename(ids[50], 'Renamed');
  const delta = ft.__stats.buildCount - before;
  expect(delta).toBeLessThan(10); // was ~100 (full forest) before this task
  // and the tree still reflects the rename:
  expect(ft.tree.value.find((n) => n.id === ids[50])!.title).toBe('Renamed');
});
```

**Step 2: Run to verify it fails**

Run: `pnpm vitest run useFileTree.perf`
Expected: FAIL — delta ≈ 100 (full rebuild).

**Step 3: Implement incremental path**

Sketch (adapt to real event shapes while implementing):

```typescript
const nodeCache = new Map<string, TreeNode>();

function buildTreeNode(nodeId: string): TreeNode | null {
  __stats.buildCount++;
  const nodeMap = nodesMap.get(nodeId);
  if (!nodeMap) return null;
  const node: TreeNode = {
    id: nodeMap.get('id') as string,
    type: nodeMap.get('type') as 'page' | 'folder',
    title: nodeMap.get('title') as string,
  };
  if (node.type === 'folder') {
    node.children = getChildrenArray(nodeId).toArray().map(buildTreeNode).filter(Boolean) as TreeNode[];
  }
  nodeCache.set(nodeId, node);
  return node;
}

// Deep observer that handles title-only changes surgically:
function onNodesDeep(events: Y.YEvent<any>[]): void {
  let structural = false;
  for (const ev of events) {
    if (ev instanceof Y.YMapEvent && ev.target !== nodesMap) {
      // a node's own fields changed
      const changed = ev.target as Y.Map<any>;
      const id = changed.get('id') as string;
      const cached = nodeCache.get(id);
      if (cached && ev.keysChanged.has('title') && !ev.keysChanged.has('type') && !ev.keysChanged.has('parentId')) {
        cached.title = changed.get('title') as string; // reactive in-place update
        continue;
      }
      structural = true;
    } else {
      structural = true; // add/remove node, or nodesMap membership change
    }
  }
  if (structural) scheduleSync();
}
```

- Swap `nodesMap.observeDeep(syncHandler)` → `nodesMap.observeDeep(onNodesDeep)` (update the
  `unobserveDeep` in `onUnmounted` to match).
- Ensure `tree.value` nodes ARE the cached objects so in-place mutation is reactive. Because
  `tree.value` is a `ref` holding plain objects, mutating a nested `.title` is reactive under Vue 3's
  proxy only if the array/objects are reactive. To guarantee reactivity, either (a) use `reactive()`
  nodes, or (b) after an in-place title change, reassign the containing array slot. Prefer (a):
  build nodes with `reactive({...})` in `buildTreeNode` so deep mutation is tracked. Verify the
  render test still passes.
- Keep `rootChildren.observe` / folder-children `observe` → `scheduleSync` (structural).

**Step 4: Run to verify it passes**

Run: `pnpm vitest run useFileTree.perf && pnpm test:run`
Expected: rename delta < 10; ALL existing behavioral tests still PASS (correctness preserved via
fallback rebuild for structural changes).

**Step 5: Profile with the seed doc (record the number)**

In a scratch bench test, seed 500 nodes via `scripts/seed-doc.ts` into a doc, wire `useFileTree`,
measure `buildCount` delta for a rename before/after. Note both numbers in the commit body.

**Step 6: Commit**

```bash
git add src/composables/useFileTree.ts src/composables/__tests__/useFileTree.perf.test.ts
git commit -m "perf: incremental tree sync — rename touches one node not the forest"
```

### Task A3 (optional, gate on real need): Virtualize the tree render

**Do this ONLY if profiling shows 200+ simultaneously-visible rows causing mount/scroll jank.**
YAGNI otherwise — the seam is here so it's not a surprise.

**Files:**
- Modify: `src/components/sidebar/FileTree.vue` (flatten visible tree → `useVirtualList`)
- Create: `src/composables/useFlattenedTree.ts` (expand tree → flat visible rows with depth)
- Test: `src/composables/__tests__/useFlattenedTree.test.ts`

**Design:** Flatten the expanded tree into `{ node, depth }[]` (only expanded branches), feed to
`@vueuse/core`'s `useVirtualList` so only on-screen rows mount. `TreeNode` becomes a row renderer
taking `depth` directly (it already does). Emits unchanged.

**Steps:** TDD the flattener first (pure function: tree + expanded Set → ordered visible rows),
then swap the render. Keyboard/scroll parity checked manually. Commit:
`perf: virtualize file tree render for large trees`.

---

## PART 2 — Axis 2: Large document content

### Task B1: Add y-indexeddb dependency

**Files:**
- Modify: `package.json`

**Step 1:** Run: `pnpm add y-indexeddb`
Expected: adds `y-indexeddb` to dependencies.

**Step 2:** Run: `pnpm test:run` — still green.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add y-indexeddb for incremental local persistence"
```

### Task B2: Replace full-snapshot localStorage with IndexedDB persistence

**Problem:** `src/composables/useLocalStorage.ts:37-39` re-serializes + base64s the ENTIRE doc on
every 500ms debounce, synchronously on the main thread, into a ~5MB-capped store whose
`QuotaExceededError` is swallowed (`:40`) → silent data loss.

**Files:**
- Modify: `src/composables/useLocalStorage.ts` (`useDocPersistence` → IndexedDB)
- Modify: `src/composables/useCollaboration.ts` (await/attach persistence; unchanged call site OK)
- Test: `src/composables/__tests__/useDocPersistence.test.ts`

**Design:** Replace the hand-rolled encode/debounce/`setItem` with `IndexeddbPersistence`. It stores
incremental Yjs updates asynchronously off the main thread, with far larger quota. Remove
`encodeUpdate`/`decodeUpdate`/base64 code (DRY — dead once IndexedDB owns persistence). Keep
`getStoredUserName`/`setStoredUserName`/`trackRecentRoom` on localStorage (small, fine).

```typescript
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

export function useDocPersistence(ydoc: Y.Doc, roomId: string): IndexeddbPersistence {
  const persistence = new IndexeddbPersistence(`writeboard-doc-${roomId}`, ydoc);
  persistence.on('synced', () => {
    // local state loaded; optional hook for "restored" UI
  });
  return persistence;
}
```

**One-time migration (optional, low priority):** If a legacy `writeboard-doc-<room>` localStorage
key exists, decode it once and `Y.applyUpdate(ydoc, ...)` before/після IndexedDB sync, then delete
the key. Only add if you have existing users with local docs. Keep `decodeUpdate` solely for this
migration if you implement it; otherwise delete it.

**Step 1: Write the failing test**

```typescript
// src/composables/__tests__/useDocPersistence.test.ts
import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

// happy-dom lacks IndexedDB; mock y-indexeddb to a stub that records construction.
const created: string[] = [];
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    name: string;
    constructor(name: string, _doc: Y.Doc) { this.name = name; created.push(name); }
    on() {}
    destroy() {}
  },
}));

import { useDocPersistence } from '../useLocalStorage';

describe('useDocPersistence', () => {
  it('creates an IndexedDB persistence scoped to the room', () => {
    const doc = new Y.Doc();
    const p = useDocPersistence(doc, 'room42');
    expect(created).toContain('writeboard-doc-room42');
    expect(p).toBeTruthy();
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm vitest run useDocPersistence`
Expected: FAIL — current `useDocPersistence` uses localStorage, no IndexeddbPersistence constructed.

**Step 3: Implement** (as above); delete now-dead `encodeUpdate`/`decodeUpdate` unless kept for migration.

**Step 4: Run to verify it passes**

Run: `pnpm vitest run useDocPersistence && pnpm test:run`
Expected: PASS.

**Step 5: Manual verification**

`pnpm dev` — type in a room, reload the page: content persists. Open DevTools → Application →
IndexedDB → `writeboard-doc-<room>` exists; localStorage no longer grows with doc size. Type a lot
and confirm no main-thread long-tasks from `setItem` in the Performance panel.

**Step 6: Commit**

```bash
git add src/composables/useLocalStorage.ts src/composables/__tests__/useDocPersistence.test.ts
git commit -m "perf: persist docs to IndexedDB (incremental, async, no quota jank)"
```

### Task B3: Surface persistence failures instead of swallowing them

**Files:**
- Modify: `src/composables/useLocalStorage.ts` (return a `persistenceError` ref or emit)
- Optional Modify: `src/components/RoomPage.vue` (toast/status when persistence errors)

**Design:** IndexedDB can still fail (private mode, quota, blocked). Wire `persistence.on('error'...)`
(or a try/catch around construction) to a `ref<boolean>` surfaced up to a small non-blocking banner,
replacing the old silent `console.warn`. Keep it minimal (YAGNI): one boolean + one line of UI.

**Steps:** TDD the error ref (mock the stub to throw), then a one-line banner. Commit:
`fix: surface local persistence failures to the user`.

---

## PART 3 — Axis 3: Many concurrent users

> Server work is integration-heavy; unit TDD is limited. Where a pure function exists (coalescing
> buffer, LRU), test it. Otherwise verify via a load test (Task C0) with before/after numbers.

### Task C0: Load-test harness + baseline number

**Files:**
- Create: `server/loadtest/ws-fanout.mjs` (open N ws conns to one room, drive edits, measure)
- Create: `server/loadtest/README.md`

**Design:** A script that opens N WebSocket connections to `ws://localhost:4444/<room>`, has one
conn send doc updates at a fixed rate, and measures broadcast latency (send→receive on other conns)
plus server event-loop delay via `perf_hooks.monitorEventLoopDelay` (printed by the server behind a
`LOADTEST=1` env flag). Record the **baseline** p50/p99 at, say, N=50 before optimizing.

**Steps:** Write the script; run `node server/main.mjs` in one shell, the load test in another;
record numbers in the README. Commit: `test: add ws fan-out load-test harness + baseline`.

### Task G: Coalesce + backpressure server broadcast

**Problem:** `server/main.mjs:42` `doc.on('update')` → `:54` `broadcastToRoom` does a synchronous
`conn.send` to every conn per update. Bursty typing = O(conns) sync sends per keystroke.

**Files:**
- Modify: `server/main.mjs` (per-room outbound coalescing buffer + bufferedAmount backpressure)
- Test: `server/__tests__/coalesce.test.mjs` (pure buffer logic)

**Design:**
- **Coalesce:** accumulate Yjs updates per room in a buffer; flush on a short timer
  (`setTimeout(..., FLUSH_MS)` with `FLUSH_MS ≈ 20-40`). Merge updates with `Y.mergeUpdates` so one
  encoded message carries the burst.
- **Backpressure:** in `broadcastToRoom`, skip conns whose `conn.bufferedAmount` exceeds a threshold
  (they'll catch up via the CRDT on their next flush), preventing head-of-line blocking.
- Extract the coalescing buffer into a small pure module so it's unit-testable.

**Step 1: Write the failing test** (pure buffer)

```javascript
// server/__tests__/coalesce.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { createCoalescer } from '../coalesce.mjs';

test('coalesces multiple updates into one flush', async () => {
  const flushed = [];
  const c = createCoalescer({ flushMs: 5, onFlush: (batch) => flushed.push(batch) });
  c.push(new Uint8Array([1]));
  c.push(new Uint8Array([2]));
  await new Promise((r) => setTimeout(r, 15));
  assert.strictEqual(flushed.length, 1);
});
```

**Step 2:** Run: `node --test server/__tests__/coalesce.test.mjs` → FAIL (no module).

**Step 3:** Implement `server/coalesce.mjs` (buffer + timer + `Y.mergeUpdates`), wire into
`getOrCreateRoom`'s `doc.on('update')` path in `main.mjs`, add `bufferedAmount` guard in
`broadcastToRoom`.

**Step 4:** Run: `node --test server/__tests__/coalesce.test.mjs` → PASS. Re-run Task C0 load test;
compare p99 to baseline; record improvement.

**Step 5: Commit**

```bash
git add server/coalesce.mjs server/main.mjs server/__tests__/coalesce.test.mjs
git commit -m "perf: coalesce + backpressure server broadcast"
```

### Task C1: Server-side persistence (docs survive empty rooms & restarts)

**Problem:** `server/main.mjs:78` destroys the doc when a room empties; nothing is persisted → a
restart or empty-room GC loses server-side truth (clients currently carry it in IndexedDB).

**Files:**
- Modify: `server/package.json` (add `y-leveldb`)
- Modify: `server/main.mjs` (load on room create; debounce-persist on update; evict via LRU not destroy)
- Create: `server/persistence.mjs` (thin wrapper around `y-leveldb`)

**Design:**
- On `getOrCreateRoom`, load stored state: `bindState(roomName, doc)` applies the persisted update.
- On `doc.on('update')`, debounce-write to LevelDB (reuse a small debounce util).
- On empty room: DON'T `destroy()` immediately — flush to disk, then evict from the in-memory
  `rooms` map via an LRU cap (e.g. keep last K rooms warm). Re-loading is cheap from LevelDB.

**Steps:** Wrap `y-leveldb` in `persistence.mjs`; wire load/store/flush; replace the destroy-on-empty
block with flush+evict. Verify: start server, edit a room, stop all clients, restart server, rejoin
the room → content is present. Commit: `feat: persist server docs to LevelDB, evict via LRU`.

### Task C2: Horizontal scaling — sticky-by-room routing (document + config)

**Problem:** `server/main.mjs` holds rooms in per-process memory. Behind a load balancer, two users
on the same room name but different instances never sync — the hard ceiling.

**Files:**
- Create: `server/SCALING.md` (deployment doc)
- Modify: `server/deploy.sh` / infra config (routing rule)

**Design (choose the simplest that meets load):**
- **Sticky-by-room (recommended first):** hash `roomName` at the LB (or an edge router) → pin each
  room to one instance. Each room lives entirely on one node; no cross-node sync needed. Scales to
  many rooms; a single hot room is bounded by one node (fine for this app's usage shape).
- **Pub/sub fan-out (only if one room must exceed one node):** back broadcast with Redis pub/sub so
  any instance serves any room. More infra; defer until sticky routing is proven insufficient.

Also note the option to **adopt Hocuspocus** wholesale (persistence + scaling hooks built-in) if
maintaining `main.mjs` by hand becomes a burden — capture the trade-off in `SCALING.md` but don't
rewrite now (YAGNI).

**Steps:** Write `SCALING.md` with the sticky-routing recipe and the Redis/Hocuspocus escape
hatches; adjust `deploy.sh` to document/enable room-hash routing. No app-code change required for
sticky routing. Commit: `docs: server horizontal-scaling strategy (sticky-by-room)`.

---

## Final verification (after each part, and at the end)

- Run: `pnpm test:run` — all green.
- Run: `pnpm type-check` — no new type errors.
- Run: `pnpm lint` — clean.
- Manual smoke: `pnpm dev` — create/rename/move/delete pages, toggle folders, right-click menu,
  reload (persistence), and (with the server) two browser tabs in one room stay in sync.
- Record the profiling numbers (Task 0 counter deltas; Task C0/G load-test p99) in each relevant
  commit body so the win is documented, not asserted.

## Skills to reference during execution
- superpowers:test-driven-development — for every task with a behavioral seam.
- superpowers:systematic-debugging — if any existing test regresses after A1/A2.
- superpowers:verification-before-completion — before claiming any task done.
