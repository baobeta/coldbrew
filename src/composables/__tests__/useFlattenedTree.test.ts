import { describe, it, expect } from 'vitest';
import { flattenTree } from '../useFlattenedTree';
import type { TreeNode } from '@/types';

const page = (id: string): TreeNode => ({ id, type: 'page', title: id });
const folder = (id: string, children: TreeNode[] = []): TreeNode => ({
  id,
  type: 'folder',
  title: id,
  children,
});

describe('flattenTree', () => {
  it('returns empty array for empty tree', () => {
    expect(flattenTree([], new Set())).toEqual([]);
  });

  it('returns flat list of pages all at depth 0', () => {
    const tree = [page('a'), page('b'), page('c')];
    const rows = flattenTree(tree, new Set());
    expect(rows.map((r) => r.node.id)).toEqual(['a', 'b', 'c']);
    expect(rows.map((r) => r.depth)).toEqual([0, 0, 0]);
  });

  it('includes a collapsed folder row but NOT its children', () => {
    const tree = [folder('f', [page('a'), page('b')])];
    const rows = flattenTree(tree, new Set());
    expect(rows.map((r) => r.node.id)).toEqual(['f']);
    expect(rows[0].depth).toBe(0);
  });

  it('includes an expanded folder followed by its children at depth+1', () => {
    const tree = [folder('f', [page('a'), page('b')])];
    const rows = flattenTree(tree, new Set(['f']));
    expect(rows.map((r) => r.node.id)).toEqual(['f', 'a', 'b']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1]);
  });

  it('traverses nested expanded folders with correct depth increments in pre-order', () => {
    const tree = [
      folder('outer', [folder('inner', [page('leaf1'), page('leaf2')]), page('sibling')]),
    ];
    const rows = flattenTree(tree, new Set(['outer', 'inner']));
    expect(rows.map((r) => r.node.id)).toEqual(['outer', 'inner', 'leaf1', 'leaf2', 'sibling']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2, 1]);
  });

  it('handles expanded folder with no children array without crashing', () => {
    const noChildrenFolder: TreeNode = { id: 'f', type: 'folder', title: 'f' };
    const rows = flattenTree([noChildrenFolder], new Set(['f']));
    expect(rows.map((r) => r.node.id)).toEqual(['f']);
    expect(rows[0].depth).toBe(0);
  });

  it('handles expanded folder with empty children array without crashing', () => {
    const emptyFolder = folder('f', []);
    const rows = flattenTree([emptyFolder], new Set(['f']));
    expect(rows.map((r) => r.node.id)).toEqual(['f']);
  });

  it('includes expanded folder containing a collapsed subfolder — grandchildren absent', () => {
    const tree = [folder('outer', [folder('inner', [page('grandchild')]), page('child')])];
    // outer expanded, inner collapsed
    const rows = flattenTree(tree, new Set(['outer']));
    expect(rows.map((r) => r.node.id)).toEqual(['outer', 'inner', 'child']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1]);
  });

  it('preserves node references in returned rows', () => {
    const p = page('x');
    const rows = flattenTree([p], new Set());
    expect(rows[0].node).toBe(p);
  });

  it('handles multiple top-level folders with mixed expand state', () => {
    const tree = [folder('f1', [page('a'), page('b')]), folder('f2', [page('c')]), page('d')];
    const rows = flattenTree(tree, new Set(['f1']));
    expect(rows.map((r) => r.node.id)).toEqual(['f1', 'a', 'b', 'f2', 'd']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0, 0]);
  });
});
