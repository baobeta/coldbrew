import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FileTree from '../FileTree.vue';

const tree = [
  { id: 'a', type: 'folder', title: 'F', children: [{ id: 'b', type: 'page', title: 'P' }] },
];

/**
 * happy-dom has no layout engine: clientHeight is always 0, so useVirtualList
 * computes viewCapacity = 0 and renders zero rows. To make the test meaningful,
 * stub clientHeight on the virtual scroll container and dispatch a scroll event
 * so calculateRange re-runs and emits visible rows.
 */
async function forceVirtualListRender(wrapper: ReturnType<typeof mount>, height = 400) {
  const container = wrapper.find('[data-test="file-tree-container"]').element as HTMLElement;
  Object.defineProperty(container, 'clientHeight', { get: () => height, configurable: true });
  container.dispatchEvent(new Event('scroll'));
  await wrapper.vm.$nextTick();
}

describe('FileTree context menu', () => {
  it('renders at most one context menu regardless of node count', async () => {
    const wrapper = mount(FileTree, {
      props: { tree, activePageId: null, expandedFolders: new Set(['a']) },
      attachTo: document.body,
    });

    // Force virtual list to render rows (happy-dom clientHeight workaround)
    await forceVirtualListRender(wrapper);

    // Guard: ensure virtualization actually rendered rows — if this fails, the
    // test would otherwise pass vacuously with contextMenu count = 0 = 0... no.
    // Actually count 1 is the assertion; this makes zero-row failure explicit.
    expect(wrapper.findAll('[data-test="tree-row"]').length).toBeGreaterThan(0);

    await wrapper.find('[data-test="tree-row"]').trigger('contextmenu');
    const menus = wrapper.findAll('[data-test="context-menu"]');
    expect(menus.length).toBe(1);

    wrapper.unmount();
  });
});
