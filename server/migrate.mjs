import * as Y from 'yjs';

/**
 * Deep-clone a Yjs XML node (XmlText / XmlElement) into a detached equivalent
 * belonging to no doc yet (it gets attached when inserted into a fragment).
 */
export function cloneXmlNode(node) {
  if (node instanceof Y.XmlText) {
    const t = new Y.XmlText();
    let i = 0;
    for (const op of node.toDelta()) {
      // op.insert is a string for text runs; attributes carry marks (bold, etc.)
      t.insert(i, op.insert, op.attributes);
      i += op.insert.length;
    }
    return t;
  }
  if (node instanceof Y.XmlElement) {
    const el = new Y.XmlElement(node.nodeName);
    const attrs = node.getAttributes();
    for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
    const children = node.toArray().map(cloneXmlNode);
    // Filter out nulls from XmlHook or unknown node types
    const validChildren = children.filter((n) => n !== null);
    if (validChildren.length) el.insert(0, validChildren);
    return el;
  }
  // XmlHook or unknown: skip gracefully rather than crash
  return null;
}

/**
 * Copy treeDoc's `page-<pageId>` fragment into pageDoc's `content` fragment.
 * Returns true if content was copied, false if the source was empty.
 * PURE with respect to persistence — caller handles flush/verify/source deletion.
 */
export function migratePageFragment(treeDoc, pageId, pageDoc) {
  const source = treeDoc.getXmlFragment(`page-${pageId}`);
  if (source.length === 0) return false;
  const target = pageDoc.getXmlFragment('content');
  const clones = source.toArray().map(cloneXmlNode).filter((n) => n !== null);
  if (clones.length === 0) return false;
  target.insert(target.length, clones);
  return target.length > 0;
}
