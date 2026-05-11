<template>
  <div class="room-page">
    <Sidebar
      :is-open="sidebarOpen"
      :pages="pages"
      :active-page-id="activePageId"
      :participants="participants"
      @create-page="createPage()"
      @select-page="switchPage"
    />
    <div class="main-area">
      <Toolbar :editor="currentEditor">
        <template #right>
          <MicButton
            :is-listening="isListening"
            :is-supported="isSupported"
            :speaker-name="speakerName"
            @toggle="toggleListening"
          />
          <ShareButton />
          <button class="toolbar-btn sidebar-toggle" @click="sidebarOpen = !sidebarOpen" title="Toggle sidebar">
            ☰
          </button>
        </template>
      </Toolbar>
      <InterimBanner :text="interimText" />
      <TiptapEditor
        v-if="activePageId"
        :key="activePageId"
        ref="editorRef"
        :ydoc="ydoc"
        :provider="provider"
        :fragment="currentFragment"
        :user-name="userName"
        :user-color="userColor"
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
import Sidebar from './Sidebar.vue'
import MicButton from './MicButton.vue'
import ShareButton from './ShareButton.vue'
import InterimBanner from './InterimBanner.vue'
import { useCollaboration } from '../composables/useCollaboration.js'
import { usePages } from '../composables/usePages.js'
import { useVoiceCapture } from '../composables/useVoiceCapture.js'

const props = defineProps({
  roomId: { type: String, required: true }
})

const sidebarOpen = ref(window.innerWidth >= 768)
const editorRef = ref(null)

const { ydoc, provider, userName, userColor, peerCount, participants, connectionStatus } = useCollaboration(props.roomId)
const { pages, activePageId, createPage, setActivePage, getFragment } = usePages(ydoc, provider)

const currentFragment = computed(() => {
  if (!activePageId.value) return null
  return getFragment(activePageId.value)
})

const currentEditor = computed(() => editorRef.value?.editor?.value)

const { isListening, interimText, isSupported, speakerName, toggleListening } = useVoiceCapture(
  provider,
  () => editorRef.value?.editor?.value
)

function switchPage(id) {
  setActivePage(id)
}

const statusText = computed(() => {
  if (connectionStatus.value === 'connected') {
    return `Connected · ${peerCount.value} in room`
  }
  if (connectionStatus.value === 'connecting') return 'Connecting...'
  return 'Offline'
})
</script>
