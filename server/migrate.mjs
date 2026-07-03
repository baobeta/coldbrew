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
 * Migrate all legacy page-<id> fragments in a tree doc into page rooms.
 * verify-then-delete: only delete a source fragment after persistAndVerify
 * confirms the page room durably holds the content. Sets meta.subdocsMigrated
 * only if EVERY non-empty page verified (so failures retry on next load).
 *
 * Page room names use the `--page--` delimiter (not `-p-`) so that roomIds
 * containing `-p-` are never misclassified. The same delimiter is used in
 * the client (usePageDocs.ts) and in the server classification check in main.mjs.
 *
 * deps.getPageDoc MUST be async: the room must be fully loaded from LevelDB
 * BEFORE migratePageFragment writes into it, so that any existing content in
 * the page room is visible to the `target.length > 0` duplication guard.
 *
 * @param {string} roomId - the board/room ID (no "writeboard-" prefix)
 * @param {Y.Doc} treeDoc
 * @param {{ getPageDoc(pageRoomName: string): Promise<Y.Doc>, persistAndVerify(pageRoomName: string, pageDoc: Y.Doc): Promise<boolean> }} deps
 */
export async function migrateRoom(roomId, treeDoc, deps) {
  const meta = treeDoc.getMap('meta');
  if (meta.get('subdocsMigrated')) return;

  const nodes = treeDoc.getMap('nodes');
  let allVerified = true;

  for (const [id, node] of nodes) {
    if (node.get('type') !== 'page') continue;
    const pageRoom = `writeboard-${roomId}--page--${id}`;
    // Await the page doc so it is fully loaded before we inspect or write it.
    const pageDoc = await deps.getPageDoc(pageRoom);
    const copied = migratePageFragment(treeDoc, id, pageDoc);
    if (!copied) continue; // empty/new page, or already populated — nothing to move

    const ok = await deps.persistAndVerify(pageRoom, pageDoc);
    if (ok) {
      const frag = treeDoc.getXmlFragment(`page-${id}`);
      frag.delete(0, frag.length); // verify-then-delete
    } else {
      allVerified = false;
      console.error(`[migrate] verify failed ${roomId}/${id} — source kept`);
    }
  }

  if (allVerified) meta.set('subdocsMigrated', true);
}

/**
 * Copy treeDoc's `page-<pageId>` fragment into pageDoc's `content` fragment.
 * Returns true if content was copied, false if the source was empty OR the
 * target already has content (idempotency guard — never append/duplicate).
 * PURE with respect to persistence — caller handles flush/verify/source deletion.
 */
export function migratePageFragment(treeDoc, pageId, pageDoc) {
  const source = treeDoc.getXmlFragment(`page-${pageId}`);
  if (source.length === 0) return false;
  const target = pageDoc.getXmlFragment('content');
  // Duplication guard: if the target already has content (e.g. previous run
  // wrote it but verify failed, and the same in-memory doc is reused on retry),
  // do NOT append again — that would corrupt the document with doubled content.
  if (target.length > 0) return false;
  const clones = source.toArray().map(cloneXmlNode).filter((n) => n !== null);
  if (clones.length === 0) return false;
  target.insert(target.length, clones);
  return target.length > 0;
}
