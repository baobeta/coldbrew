import { shallowRef, watch, type Ref } from 'vue';

// TiptapEditor is re-created for each page and canvas pages have none, so a page change
// must drop the old editor. Otherwise dictation inserts into a destroyed editor.
export function useLiveEditor(activePageId: Ref<string | null>) {
  const liveEditor = shallowRef<any>(null);
  watch(
    activePageId,
    () => {
      liveEditor.value = null;
    },
    { flush: 'sync' },
  );
  return liveEditor;
}
