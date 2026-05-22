<template>
  <div class="flex min-h-screen">
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
    <div class="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Toolbar :editor="liveEditor" @start-practice="onStartPractice">
        <template #right>
          <MicButton
            :is-listening="isListening"
            :is-supported="isSupported"
            :speaker-name="speakerName"
            @toggle="toggleListening"
          />
          <ShareButton />
          <button
            class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5 text-lg"
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
      <PracticePanel
        v-if="practiceActive"
        :target-text="practiceTarget"
        :results="practiceResults"
        :has-result="practiceHasResult"
        :is-recording="practiceRecording"
        :interim-text="practiceInterim"
        :score="practiceScore"
        :total="practiceTotal"
        :remote-practice="remotePractice"
        @close="closePractice"
        @record="practiceRecord"
        @stop-record="practiceStopRecord"
        @try-again="practiceTryAgain"
        @speak-target="practiceSpeakTarget"
      />
      <div class="px-4 py-2 text-right">
        <span class="text-xs text-text-muted">{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import TiptapEditor from '@/components/editor/TiptapEditor.vue';
import Toolbar from '@/components/editor/Toolbar.vue';
import Sidebar from '@/components/sidebar/Sidebar.vue';
import MicButton from '@/components/editor/MicButton.vue';
import ShareButton from '@/components/editor/ShareButton.vue';
import InterimBanner from '@/components/editor/InterimBanner.vue';
import PracticePanel from '@/components/editor/PracticePanel.vue';
import { useCollaboration } from '@/composables/useCollaboration';
import { useFileTree } from '@/composables/useFileTree';
import { useVoiceCapture } from '@/composables/useVoiceCapture';
import { usePractice } from '@/composables/usePractice';

const props = defineProps({
  roomId: { type: String, required: true },
  initialPageId: { type: String, default: null },
});

const sidebarOpen = ref(window.innerWidth >= 768);
const liveEditor = ref(null);

const { ydoc, provider, userName, userColor, peerCount, participants, connectionStatus } =
  useCollaboration(props.roomId);
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
} = useFileTree(ydoc, provider, props.initialPageId);

const currentFragment = computed(() => {
  if (!activePageId.value) return null;
  return getFragment(activePageId.value);
});

function onEditorReady(editor) {
  liveEditor.value = editor;
}

const { isListening, interimText, isSupported, speakerName, toggleListening } = useVoiceCapture(
  provider,
  () => liveEditor.value,
);

const {
  isActive: practiceActive,
  targetText: practiceTarget,
  isRecording: practiceRecording,
  interimText: practiceInterim,
  results: practiceResults,
  hasResult: practiceHasResult,
  score: practiceScore,
  total: practiceTotal,
  remotePractice,
  startPractice,
  startRecording: practiceRecord,
  stopRecording: practiceStopRecord,
  tryAgain: practiceTryAgain,
  closePractice,
  speakTarget: practiceSpeakTarget,
} = usePractice(provider);

function onStartPractice() {
  if (!liveEditor.value) return;
  const { from, to } = liveEditor.value.state.selection;
  if (from === to) return;
  const text = liveEditor.value.state.doc.textBetween(from, to, ' ');
  if (text.trim()) startPractice(text.trim());
}

function onRename({ id, title }) {
  rename(id, title);
}

const statusText = computed(() => {
  if (connectionStatus.value === 'connected') {
    return `Connected · ${peerCount.value} in room`;
  }
  if (connectionStatus.value === 'connecting') return 'Connecting...';
  return 'Offline';
});
</script>
