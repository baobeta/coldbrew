# WriteBoard: Per-Page Docs Migration

## What the migration does

WriteBoard boards historically stored all page content as XML fragments inside
the shared tree doc, keyed by `page-<pageId>`. This put every page's content
in a single Yjs document, which meant every collaborator on any page received
diffs for all pages.

The migration moves each `page-<pageId>` fragment into its own dedicated room:

```
writeboard-<roomId>--page--<pageId>
```

The `--page--` delimiter (double-dash) was chosen so that roomIds containing
a literal `-p-` are never misclassified as page rooms.

After migration the tree doc retains only the node-tree metadata (titles,
ordering, node types) while each page doc owns its own Yjs content fragment
under the key `content`.

## When it runs

Migration is triggered server-side on the first load of a tree room
(`writeboard-<roomId>`) that does not yet carry `meta.subdocsMigrated = true`.

The entry point is `migrateRoom(roomId, treeDoc, deps)` in `server/migrate.mjs`.
It is called inside `main.mjs` immediately after the tree doc is loaded from
LevelDB, before any client updates are applied.

## Verify-then-delete safety

The migration never deletes source content before durability is confirmed:

1. `migratePageFragment` clones each XML node from the source fragment into a
   fresh target fragment inside the page doc.
2. `deps.persistAndVerify` flushes the page doc to LevelDB and reads it back
   into a new `Y.Doc`. If the reloaded content matches and is non-empty, it
   returns `true`.
3. Only on `true` does `migrateRoom` delete the source fragment
   (`frag.delete(0, frag.length)`).
4. If any page fails verification, `meta.subdocsMigrated` is NOT set. The
   migration will retry on the next server restart, leaving source fragments
   intact so no content is lost.

A duplication guard in `migratePageFragment` checks `target.length > 0` before
writing. If the page doc already has content (e.g. a previous partial run
loaded the same in-memory doc), the copy is skipped, preventing doubled content.

## Rollout ordering

**Deploy the server (with migration code) BEFORE or WITH the new client.**

- New client + old server: page editors will appear empty because the server
  does not yet know about per-page rooms. Degraded experience, not a crash.
- Old client + new server: the migration runs and populates page rooms. Old
  clients continue reading from tree-doc fragments (which are preserved until
  verification succeeds), so existing sessions remain functional.
- New client + new server: ideal path. Migration runs on first tree-room load;
  subsequent loads are instant no-ops due to the `subdocsMigrated` flag.

## Verifying migration on a real deployment

### Watch the logs

Migration emits `[migrate]` prefixed log lines. A successful run looks like:

```
[migrate] verify failed roomId/pageId — source kept
```

(only printed on failure; silence means all pages verified successfully)

If you see no errors and the flag is set, migration succeeded.

### Check page rooms in LevelDB

Use `y-leveldb`'s CLI or a Node.js snippet to inspect stored rooms:

```js
import { LeveldbPersistence } from 'y-leveldb';
import * as Y from 'yjs';

const ldb = new LeveldbPersistence('./.writeboard-db');
const doc = await ldb.getYDoc('writeboard-<roomId>--page--<pageId>');
console.log(doc.getXmlFragment('content').toJSON());
```

A non-empty string confirms the page room was written.

### Confirm the flag

The `meta.subdocsMigrated` flag lives in the tree doc:

```js
const tree = await ldb.getYDoc('writeboard-<roomId>');
console.log(tree.getMap('meta').get('subdocsMigrated')); // true if migrated
```

## Running the integration test

The integration test (`server/__tests__/migrate.integration.test.mjs`) exercises
the full path — migration through real LevelDB — using a temporary database that
is cleaned up after the run:

```
node --test server/__tests__/migrate.integration.test.mjs
```

Expected output: 2 tests pass, temp DB dir removed.
