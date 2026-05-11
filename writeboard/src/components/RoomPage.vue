<template>
  <div class="room-page">
    <div class="editor-area">
      <Toolbar :editor="editorRef?.editor?.value">
        <template #right>
          <!-- mic + share buttons go here later -->
        </template>
      </Toolbar>
      <TiptapEditor
        ref="editorRef"
        :ydoc="ydoc"
        :provider="provider"
        :fragment="currentFragment"
      />
      <div class="status-bar">
        <span class="connection-status">{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import TiptapEditor from './TiptapEditor.vue'
import Toolbar from './Toolbar.vue'
import { useCollaboration } from '../composables/useCollaboration.js'

const props = defineProps({
  roomId: { type: String, required: true }
})

const editorRef = ref(null)
const { ydoc, provider, peerCount, connectionStatus } = useCollaboration(props.roomId)

const currentFragment = ydoc.getXmlFragment('default')

const statusText = computed(() => {
  if (connectionStatus.value === 'connected') {
    return `Connected · ${peerCount.value} in room`
  }
  if (connectionStatus.value === 'connecting') return 'Connecting...'
  return 'Offline'
})
</script>
