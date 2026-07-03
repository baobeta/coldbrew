import { computed, type Ref, type ComputedRef } from 'vue';
import type { TreeNode } from '@/types';

export interface FlatRow {
  node: TreeNode;
  depth: number;
}

/**
 * Flatten the visible portion of a tree into ordered rows.
 * A folder contributes its own row always; its children are included
 * ONLY if the folder id is in `expandedFolders`. Pages are leaves.
 * Order is depth-first pre-order (matches how the recursive tree renders).
 */
export function flattenTree(tree: TreeNode[], expandedFolders: Set<string>): FlatRow[] {
  const rows: FlatRow[] = [];
  function walk(nodes: TreeNode[], depth: number): void {
    for (const node of nodes) {
      rows.push({ node, depth });
      if (node.type === 'folder' && expandedFolders.has(node.id) && node.children?.length) {
        walk(node.children, depth + 1);
      }
    }
  }
  walk(tree, 0);
  return rows;
}

export function useFlattenedTree(
  tree: Ref<TreeNode[]>,
  expandedFolders: Ref<Set<string>>,
): ComputedRef<FlatRow[]> {
  return computed(() => flattenTree(tree.value, expandedFolders.value));
}
