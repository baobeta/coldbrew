import { describe, it, expect } from 'vitest';
import {
  BackupError,
  MAX_BACKUP_BYTES,
  MAX_PAGES,
  base64ToBytes,
  bytesToBase64,
  createBackup,
  parseBackup,
  type BackupNode,
} from '../backupFormat';
import { encodePoints } from '@/features/canvas/strokeCodec';

const content = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
};
const stroke = {
  tool: 'pen' as const,
  color: '#1c1917',
  size: 4,
  simulatePressure: false,
  pts: bytesToBase64(encodePoints([[1, 2, 0.5]])),
};
const nodes: BackupNode[] = [
  {
    type: 'folder',
    title: 'Notes',
    children: [
      { type: 'page', kind: 'text', title: 'Plan', content },
      { type: 'page', kind: 'canvas', title: 'Sketch', strokes: [stroke] },
    ],
  },
];

const serialized = async (value: BackupNode[] = nodes) =>
  JSON.stringify(await createBackup(value, '2026-11-01T00:00:00.000Z'));

// Edits a valid file, then recomputes the checksum so only validation can reject it.
async function withNodes(edit: (copy: any[]) => void) {
  const copy = JSON.parse(JSON.stringify(nodes));
  edit(copy);
  return serialized(copy);
}

function link(href: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }],
      },
    ],
  };
}

describe('base64', () => {
  it('round-trips bytes, including a large array', () => {
    const bytes = Uint8Array.from({ length: 200000 }, (_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe('parseBackup', () => {
  it('accepts a valid backup and keeps the tree', async () => {
    const backup = await parseBackup(await serialized());
    expect(backup.exportedAt).toBe('2026-11-01T00:00:00.000Z');
    expect(backup.nodes).toEqual(nodes);
  });

  it('accepts an empty text page', async () => {
    const empty = { type: 'doc', content: [{ type: 'paragraph' }] };
    await expect(
      parseBackup(await serialized([{ type: 'page', kind: 'text', title: 'A', content: empty }])),
    ).resolves.toBeTruthy();
  });

  it('rejects text that is not JSON', async () => {
    await expect(parseBackup('{not json')).rejects.toThrow(BackupError);
  });

  it('rejects a file over the size limit', async () => {
    await expect(parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).rejects.toThrow(/too large/);
  });

  it('rejects another file format', async () => {
    await expect(parseBackup('{"format":"other","version":1}')).rejects.toThrow(/not a Coldbrew/);
  });

  it('rejects a newer version', async () => {
    const file = JSON.parse(await serialized());
    await expect(parseBackup(JSON.stringify({ ...file, version: 2 }))).rejects.toThrow(/newer/);
  });

  it('rejects a damaged file through the checksum', async () => {
    const file = JSON.parse(await serialized());
    file.nodes[0].title = 'Changed';
    await expect(parseBackup(JSON.stringify(file))).rejects.toThrow(/damaged/);
  });

  it('rejects unknown fields at each level', async () => {
    const file = JSON.parse(await serialized());
    await expect(parseBackup(JSON.stringify({ ...file, extra: 1 }))).rejects.toThrow(BackupError);
    const inNode = await withNodes((copy) => (copy[0].id = 'live-page-id'));
    await expect(parseBackup(inNode)).rejects.toThrow(BackupError);
    const inStroke = await withNodes((copy) => (copy[0].children[1].strokes[0].extra = 1));
    await expect(parseBackup(inStroke)).rejects.toThrow(BackupError);
  });

  it('rejects an unknown node type or page kind', async () => {
    const type = await withNodes((copy) => (copy[0].type = 'script'));
    await expect(parseBackup(type)).rejects.toThrow(BackupError);
    const kind = await withNodes((copy) => (copy[0].children[0].kind = 'video'));
    await expect(parseBackup(kind)).rejects.toThrow(BackupError);
  });

  it('rejects text outside the editor schema', async () => {
    const file = await withNodes(
      (copy) => (copy[0].children[0].content = { type: 'doc', content: [{ type: 'iframe' }] }),
    );
    await expect(parseBackup(file)).rejects.toThrow(BackupError);
  });

  it('rejects a javascript link but keeps a normal one', async () => {
    const bad = await withNodes(
      (copy) => (copy[0].children[0].content = link('javascript:alert(1)')),
    );
    await expect(parseBackup(bad)).rejects.toThrow(/link/);
    const good = await withNodes(
      (copy) => (copy[0].children[0].content = link('https://example.com')),
    );
    await expect(parseBackup(good)).resolves.toBeTruthy();
  });

  it('rejects bad stroke fields and bytes', async () => {
    const cases: [string, unknown][] = [
      ['tool', 'laser'],
      ['color', 'url(x)'],
      ['size', 9999],
      ['simulatePressure', 'yes'],
      ['pts', '!!!'],
      ['pts', bytesToBase64(Uint8Array.from([99]))],
    ];
    for (const [field, value] of cases) {
      const file = await withNodes((copy) => (copy[0].children[1].strokes[0][field] = value));
      await expect(parseBackup(file)).rejects.toThrow(BackupError);
    }
  });

  it('rejects too many pages and too much nesting', async () => {
    const page = { type: 'page', kind: 'canvas', title: 'P', strokes: [] } as BackupNode;
    await expect(
      parseBackup(await serialized(Array.from({ length: MAX_PAGES + 1 }, () => page))),
    ).rejects.toThrow(/too many/);
    let deep: BackupNode = page;
    for (let i = 0; i < 40; i++) deep = { type: 'folder', title: 'F', children: [deep] };
    await expect(parseBackup(await serialized([deep]))).rejects.toThrow(/nested/);
  });
});
