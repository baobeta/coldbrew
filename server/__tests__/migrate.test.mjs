import { test } from 'node:test';
import assert from 'node:assert';
import * as Y from 'yjs';
import { migratePageFragment } from '../migrate.mjs';

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
