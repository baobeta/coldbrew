import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useLiveEditor } from '../composables/useLiveEditor';

describe('useLiveEditor', () => {
  it('clears the editor as soon as the page changes', () => {
    const activePageId = ref<string | null>('text-page');
    const liveEditor = useLiveEditor(activePageId);
    liveEditor.value = { destroyed: false };
    activePageId.value = 'canvas-page';
    expect(liveEditor.value).toBe(null);
  });

  it('keeps an editor that registers after the page changes', () => {
    const activePageId = ref<string | null>('a');
    const liveEditor = useLiveEditor(activePageId);
    activePageId.value = 'b';
    const editor = { destroyed: false };
    liveEditor.value = editor;
    expect(liveEditor.value).toBe(editor);
  });
});
