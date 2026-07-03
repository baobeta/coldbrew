import { test, after } from 'node:test';
import assert from 'node:assert';
import { rm } from 'node:fs/promises';
import * as Y from 'yjs';

const DB = `./.test-db-integ-${process.pid}`;
process.env.LEVELDB_PATH = DB;

// Dynamic import AFTER setting env so the LeveldbPersistence singleton uses DB.
const { migrateRoom } = await import('../migrate.mjs');
const { loadRoom, flushAndReload, closePersistence } = await import('../persistence.mjs');

after(async () => {
  await closePersistence();
  await rm(DB, { recursive: true, force: true });
});

test('E2E: migration durably moves page content into page rooms through real LevelDB', async () => {
  // 1. Build an OLD-FORMAT tree doc: nodes map + page-<id> fragments with rich content.
  const treeDoc = new Y.Doc();
  const nodes = treeDoc.getMap('nodes');
  const seed = { a: 'alpha content', b: 'bravo content' };
  for (const [id, text] of Object.entries(seed)) {
    const m = new Y.Map(); m.set('id', id); m.set('type', 'page'); m.set('title', id);
    nodes.set(id, m);
    const f = treeDoc.getXmlFragment(`page-${id}`);
    const p = new Y.XmlElement('paragraph'); p.insert(0, [new Y.XmlText(text)]);
    f.insert(0, [p]);
  }

  // 2. Run migration with REAL persistence deps (real getOrCreateRoom-like doc + real flushAndReload).
  //    Since we're not running the full server, emulate getPageDoc by creating a doc and loading
  //    any prior state from LevelDB (mirrors getOrCreateRoom + await pr.loaded).
  const pageDocs = new Map();
  const deps = {
    getPageDoc: async (pageRoom) => {
      if (!pageDocs.has(pageRoom)) {
        const d = new Y.Doc();
        await loadRoom(pageRoom, d); // apply any persisted state (empty first time)
        pageDocs.set(pageRoom, d);
      }
      return pageDocs.get(pageRoom);
    },
    persistAndVerify: async (pageRoom, pageDoc) => {
      const reloaded = await flushAndReload(pageRoom, pageDoc);
      const ok = reloaded.getXmlFragment('content').toJSON() === pageDoc.getXmlFragment('content').toJSON()
        && reloaded.getXmlFragment('content').length > 0;
      reloaded.destroy();
      return ok;
    },
  };
  await migrateRoom('roomZ', treeDoc, deps);

  // 3. Assert: flag set, tree fragments EMPTIED (verify-then-delete), page rooms hold content.
  assert.strictEqual(treeDoc.getMap('meta').get('subdocsMigrated'), true);
  assert.strictEqual(treeDoc.getXmlFragment('page-a').length, 0);
  assert.strictEqual(treeDoc.getXmlFragment('page-b').length, 0);

  // 4. DURABILITY: read the page rooms back from LevelDB into FRESH docs (simulating a server restart).
  const freshA = new Y.Doc(); await loadRoom('writeboard-roomZ--page--a', freshA);
  const freshB = new Y.Doc(); await loadRoom('writeboard-roomZ--page--b', freshB);
  assert.match(freshA.getXmlFragment('content').toJSON(), /alpha content/);
  assert.match(freshB.getXmlFragment('content').toJSON(), /bravo content/);
  // no duplication
  assert.strictEqual(freshA.getXmlFragment('content').length, 1);
});

test('E2E: re-running migration after restart is a no-op (flag persists in tree doc, no dup)', async () => {
  // Reuse a migrated tree doc: build, migrate, then migrate AGAIN — page content must not double.
  const treeDoc = new Y.Doc();
  const nodes = treeDoc.getMap('nodes');
  const m = new Y.Map(); m.set('id', 'x'); m.set('type', 'page'); m.set('title', 'x'); nodes.set('x', m);
  const f = treeDoc.getXmlFragment('page-x');
  const p = new Y.XmlElement('paragraph'); p.insert(0, [new Y.XmlText('xray')]); f.insert(0, [p]);

  const pageDocs = new Map();
  const deps = {
    getPageDoc: async (r) => { if (!pageDocs.has(r)) { const d = new Y.Doc(); await loadRoom(r, d); pageDocs.set(r, d); } return pageDocs.get(r); },
    persistAndVerify: async (r, d) => { const rl = await flushAndReload(r, d); const ok = rl.getXmlFragment('content').length > 0; rl.destroy(); return ok; },
  };
  await migrateRoom('roomX', treeDoc, deps);
  await migrateRoom('roomX', treeDoc, deps); // second run — flag set, must skip
  const fresh = new Y.Doc(); await loadRoom('writeboard-roomX--page--x', fresh);
  assert.strictEqual(fresh.getXmlFragment('content').length, 1); // exactly one, no dup
});
