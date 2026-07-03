import * as Y from 'yjs';

/**
 * Build a Yjs doc with `pages` pages spread across `folders` folders,
 * matching the schema in src/composables/useFileTree.ts.
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
