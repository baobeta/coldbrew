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
import CollaborationCursor from '@/extensions/collaborationCursor'

const props = defineProps({
  ydoc: { type: Object, default: null },
  provider: { type: Object, default: null },
  fragment: { type: Object, default: null },
  userName: { type: String, default: null },
  userColor: { type: String, default: null },
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
    CollaborationCursor.configure({
      provider: props.provider,
      user: {
        name: props.userName,
        color: props.userColor,
      },
    }),
  )
}

const emit = defineEmits(['editor-ready'])

const editor = useEditor({
  extensions,
  autofocus: true,
  onCreate({ editor: editorInstance }) {
    emit('editor-ready', editorInstance)
  },
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

defineExpose({ editor })
</script>
