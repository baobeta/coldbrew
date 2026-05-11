<template>
  <div class="room-page">
    <Sidebar
      :is-open="sidebarOpen"
      :tree="tree"
      :active-page-id="activePageId"
      :expanded-folders="expandedFolders"
      :participants="participants"
      @create-page="createPage('Untitled', $event)"
      @create-folder="createFolder('New Folder', $event)"
      @select-page="setActivePage"
      @toggle-folder="toggleFolder"
      @rename="onRename"
      @delete="deleteNode"
    />
    <div class="main-area">
      <Toolbar :editor="liveEditor">
        <template #right>
          <MicButton
            :is-listening="isListening"
            :is-supported="isSupported"
            :speaker-name="speakerName"
            @toggle="toggleListening"
          />
          <ShareButton />
          <button
            class="toolbar-btn sidebar-toggle"
            @click="sidebarOpen = !sidebarOpen"
            title="Toggle sidebar"
          >
            ☰
          </button>
        </template>
      </Toolbar>
      <InterimBanner :text="interimText" />
      <TiptapEditor
        v-if="activePageId"
        :key="activePageId"
        :ydoc="ydoc"
        :provider="provider"
        :fragment="currentFragment"
        :user-name="userName"
        :user-color="userColor"
        @editor-ready="onEditorReady"
      />
      <div class="status-bar">
        <span class="connection-status">{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import TiptapEditor from '@/components/editor/TiptapEditor.vue'
import Toolbar from '@/components/editor/Toolbar.vue'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import MicButton from '@/components/editor/MicButton.vue'
import ShareButton from '@/components/editor/ShareButton.vue'
import InterimBanner from '@/components/editor/InterimBanner.vue'
import { useCollaboration } from '@/composables/useCollaboration'
import { useFileTree } from '@/composables/useFileTree'
import { useVoiceCapture } from '@/composables/useVoiceCapture'

const props = defineProps({
  roomId: { type: String, required: true },
})

const sidebarOpen = ref(window.innerWidth >= 768)
const liveEditor = ref(null)

const { ydoc, provider, userName, userColor, peerCount, participants, connectionStatus } =
  useCollaboration(props.roomId)
const {
  tree,
  activePageId,
  expandedFolders,
  createPage,
  createFolder,
  rename,
  deleteNode,
  moveNode,
  setActivePage,
  toggleFolder,
  getFragment,
} = useFileTree(ydoc, provider)

const currentFragment = computed(() => {
  if (!activePageId.value) return null
  return getFragment(activePageId.value)
})

function onEditorReady(editor) {
  liveEditor.value = editor
}

const { isListening, interimText, isSupported, speakerName, toggleListening } = useVoiceCapture(
  provider,
  () => liveEditor.value,
)

function onRename({ id, title }) {
  rename(id, title)
}

const statusText = computed(() => {
  if (connectionStatus.value === 'connected') {
    return `Connected · ${peerCount.value} in room`
  }
  if (connectionStatus.value === 'connecting') return 'Connecting...'
  return 'Offline'
})
</script>
