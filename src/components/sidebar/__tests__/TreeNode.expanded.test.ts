import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TreeNode from '../TreeNode.vue';

describe('TreeNode expansion', () => {
  it('shows children only when isExpanded is true', async () => {
    const node = {
      id: 'f',
      type: 'folder',
      title: 'F',
      children: [{ id: 'c', type: 'page', title: 'C' }],
    };
    const wrapper = mount(TreeNode, {
      props: { node, depth: 0, activePageId: null, isExpanded: false, expandedFolders: new Set() },
    });
    expect(wrapper.text()).not.toContain('C');
    await wrapper.setProps({ isExpanded: true });
    expect(wrapper.text()).toContain('C');
  });
});
