import { test } from 'node:test';
import assert from 'node:assert';
import * as Y from 'yjs';
import { migratePageFragment, migrateRoom } from '../migrate.mjs';

test('copies plain paragraph text into a page doc content fragment', () => {
  const treeDoc = new Y.Doc();
  const frag = treeDoc.getXmlFragment('page-x1');
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText('hello world')]);
  frag.insert(0, [p]);

  const pageDoc = new Y.Doc();
  const ok = migratePageFragment(treeDoc, 'x1', pageDoc);
  assert.strictEqual(ok, true);
  assert.match(pageDoc.getXmlFragment('content').toJSON(), /hello world/);
  // structure preserved: one paragraph element
  assert.strictEqual(pageDoc.getXmlFragment('content').length, 1);
  assert.strictEqual(pageDoc.getXmlFragment('content').get(0).nodeName, 'paragraph');
});

test('preserves marks/formatting (bold run) via delta', () => {
  const treeDoc = new Y.Doc();
  const frag = treeDoc.getXmlFragment('page-fmt');
  const p = new Y.XmlElement('paragraph');
  const t = new Y.XmlText();
  t.insert(0, 'normal ');
  t.insert(7, 'bold', { bold: true });
  p.insert(0, [t]);
  frag.insert(0, [p]);

  const pageDoc = new Y.Doc();
  migratePageFragment(treeDoc, 'fmt', pageDoc);
  const outText = pageDoc.getXmlFragment('content').get(0).get(0); // the XmlText
  const delta = outText.toDelta();
  // the 'bold' run must survive with its attribute
  const boldOp = delta.find((op) => op.insert === 'bold');
  assert.ok(boldOp, 'bold run present');
  assert.deepStrictEqual(boldOp.attributes, { bold: true });
});

test('preserves element attributes (heading level)', () => {
  const treeDoc = new Y.Doc();
  const frag = treeDoc.getXmlFragment('page-h');
  const h = new Y.XmlElement('heading');
  h.setAttribute('level', '2');
  h.insert(0, [new Y.XmlText('Title')]);
  frag.insert(0, [h]);

  const pageDoc = new Y.Doc();
  migratePageFragment(treeDoc, 'h', pageDoc);
  const outEl = pageDoc.getXmlFragment('content').get(0);
  assert.strictEqual(outEl.nodeName, 'heading');
  assert.strictEqual(outEl.getAttribute('level'), '2');
});

test('nested structure (multiple paragraphs) preserved in order', () => {
  const treeDoc = new Y.Doc();
  const frag = treeDoc.getXmlFragment('page-multi');
  for (const s of ['first', 'second', 'third']) {
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText(s)]);
    frag.insert(frag.length, [p]);
  }
  const pageDoc = new Y.Doc();
  migratePageFragment(treeDoc, 'multi', pageDoc);
  const out = pageDoc.getXmlFragment('content');
  assert.strictEqual(out.length, 3);
  assert.match(out.get(0).toString(), /first/);
  assert.match(out.get(2).toString(), /third/);
});

test('returns false (nothing copied) when source fragment is empty', () => {
  const treeDoc = new Y.Doc();
  treeDoc.getXmlFragment('page-empty'); // exists but empty
  const pageDoc = new Y.Doc();
  assert.strictEqual(migratePageFragment(treeDoc, 'empty', pageDoc), false);
});

// ── migrateRoom orchestration tests ──────────────────────────────────────────

test('migrateRoom moves all page fragments, deletes verified sources, sets flag', async () => {
  const treeDoc = new Y.Doc();
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
    persistAndVerify: async (room, doc) => doc.getXmlFragment('content').length > 0,
  };
  await migrateRoom('r1', treeDoc, deps);
  assert.strictEqual(treeDoc.getMap('meta').get('subdocsMigrated'), true);
  assert.strictEqual(treeDoc.getXmlFragment('page-a').length, 0); // source deleted after verify
  assert.strictEqual(treeDoc.getXmlFragment('page-b').length, 0);
  assert.match(stored['writeboard-r1--page--a'].getXmlFragment('content').toJSON(), /text-a/);
  assert.match(stored['writeboard-r1--page--b'].getXmlFragment('content').toJSON(), /text-b/);
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
  assert.strictEqual(treeDoc.getMap('meta').get('subdocsMigrated'), undefined); // flag NOT set
  assert.ok(treeDoc.getXmlFragment('page-a').length > 0); // SOURCE KEPT — no data loss
});

test('migrateRoom is idempotent — second run is a no-op once flag is set', async () => {
  const treeDoc = new Y.Doc();
  treeDoc.getMap('meta').set('subdocsMigrated', true);
  const nodes = treeDoc.getMap('nodes');
  const m = new Y.Map(); m.set('id', 'a'); m.set('type', 'page'); nodes.set('a', m);
  const f = treeDoc.getXmlFragment('page-a'); f.insert(0, [new Y.XmlElement('paragraph')]);
  let called = false;
  await migrateRoom('r1', treeDoc, { getPageDoc: () => { called = true; return new Y.Doc(); }, persistAndVerify: async () => true });
  assert.strictEqual(called, false); // did not attempt migration
  assert.ok(treeDoc.getXmlFragment('page-a').length > 0); // untouched
});

test('migrateRoom skips empty page fragments without failing the flag', async () => {
  const treeDoc = new Y.Doc();
  const nodes = treeDoc.getMap('nodes');
  const m = new Y.Map(); m.set('id', 'e'); m.set('type', 'page'); nodes.set('e', m);
  treeDoc.getXmlFragment('page-e'); // empty
  let verifyCalls = 0;
  await migrateRoom('r1', treeDoc, { getPageDoc: () => new Y.Doc(), persistAndVerify: async () => { verifyCalls++; return true; } });
  assert.strictEqual(verifyCalls, 0); // empty page: nothing to persist/verify
  assert.strictEqual(treeDoc.getMap('meta').get('subdocsMigrated'), true); // still marks migrated
});

test('re-running migration does NOT duplicate content in an already-populated page doc', async () => {
  const treeDoc = new Y.Doc();
  const nodes = treeDoc.getMap('nodes');
  const m = new Y.Map(); m.set('id', 'a'); m.set('type', 'page'); nodes.set('a', m);
  const f = treeDoc.getXmlFragment('page-a');
  const el = new Y.XmlElement('paragraph'); el.insert(0, [new Y.XmlText('once')]);
  f.insert(0, [el]);

  const pageDoc = new Y.Doc(); // SAME doc reused across runs (like getOrCreateRoom)
  const deps = {
    getPageDoc: () => pageDoc,          // reuse — real system behavior
    persistAndVerify: async () => false, // FAIL first time → source kept, retry next run
  };
  await migrateRoom('r1', treeDoc, deps); // run 1: copies, verify fails, source kept
  deps.persistAndVerify = async () => true; // run 2 will succeed
  await migrateRoom('r1', treeDoc, deps); // run 2: MUST NOT append a second copy
  assert.strictEqual(pageDoc.getXmlFragment('content').length, 1); // exactly ONE paragraph, not 2
  assert.strictEqual((pageDoc.getXmlFragment('content').toJSON().match(/once/g) || []).length, 1);
});
