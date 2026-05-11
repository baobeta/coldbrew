<template>
  <div class="editor-container">
    <editor-content :editor="editor" class="editor-content" />
  </div>
</template>

<script setup>
import { onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'

const props = defineProps({
  ydoc: { type: Object, default: null },
  provider: { type: Object, default: null },
  fragment: { type: Object, default: null },
})

const extensions = [
  StarterKit.configure({
    history: props.ydoc ? false : undefined,
    undoRedo: props.ydoc ? false : undefined,
  }),
  Placeholder.configure({
    placeholder: 'Start typing or tap the mic to dictate...',
  }),
]

if (props.ydoc && props.provider && props.fragment) {
  extensions.push(
    Collaboration.configure({ fragment: props.fragment }),
  )
}

const editor = useEditor({
  extensions,
  autofocus: true,
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

defineExpose({ editor })
</script>
