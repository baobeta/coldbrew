import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FileTree from '../FileTree.vue';

const tree = [
  { id: 'a', type: 'folder', title: 'F', children: [{ id: 'b', type: 'page', title: 'P' }] },
];

describe('FileTree context menu', () => {
  it('renders at most one context menu regardless of node count', async () => {
    const wrapper = mount(FileTree, {
      props: { tree, activePageId: null, expandedFolders: new Set(['a']) },
    });
    await wrapper.find('[data-test="tree-row"]').trigger('contextmenu');
    const menus = wrapper.findAll('[data-test="context-menu"]');
    expect(menus.length).toBe(1);
  });
});
