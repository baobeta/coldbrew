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
    <div class="flex-1 flex flex-col min-w-0 h-screen">
      <div class="shrink-0">
        <Toolbar
          :editor="liveEditor"
          :speech-rate="speechRate"
          :speed-label="speedLabel"
          :tts-speak="piperTTS.speak"
          :tts-stop="piperTTS.stop"
          :tts-ready="piperTTS.isReady.value"
          :tts-downloading="piperTTS.isDownloading.value"
          :show-ready-notice="piperTTS.showReadyNotice.value"
          @start-practice="onStartPractice"
          @cycle-speed="cycleSpeed"
          @download-voice="piperTTS.download"
        >
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
        <div
          v-if="persistenceError"
          class="px-3 py-1.5 text-xs text-amber-800 bg-amber-100 border-b border-amber-200"
        >
          ⚠ Local autosave is unavailable (private mode or storage blocked). Your work still syncs
          to the server while connected.
        </div>
      </div>
      <div class="flex-1 overflow-y-auto">
        <TiptapEditor
          v-if="activePageId"
          :key="activePageId"
          :ydoc="currentPage?.ydoc"
          :provider="currentPage?.provider"
          :fragment="currentPage?.fragment"
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
          :spoken-text="practiceSpokenText"
          :score="practiceScore"
          :total="practiceTotal"
          :remote-practice="remotePractice"
          :speed-label="speedLabel"
          :recording-url="practiceRecordingUrl"
          :is-playing-recording="practiceIsPlaying"
          :tts-ready="piperTTS.isReady.value"
          :tts-speaking="piperTTS.isSpeaking.value"
          @close="closePractice"
          @record="practiceRecord"
          @stop-record="practiceStopRecord"
          @try-again="practiceTryAgain"
          @speak-target="practiceSpeakTarget(speechRate)"
          @stop-speaking="piperTTS.stop"
          @cycle-speed="cycleSpeed"
          @play-recording="practicePlayRecording"
          @stop-playback="practiceStopPlayback"
        />
      </div>
      <div class="shrink-0 px-4 py-2 text-right">
        <span class="text-xs text-text-muted">{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const SPEED_OPTIONS = [0.5, 0.75, 1];
const SPEED_LABELS = ['0.5x', '0.75x', '1x'];
const speedIndex = ref(2);
const speechRate = computed(() => SPEED_OPTIONS[speedIndex.value]);
const speedLabel = computed(() => SPEED_LABELS[speedIndex.value]);
function cycleSpeed() {
  speedIndex.value = (speedIndex.value + 1) % SPEED_OPTIONS.length;
}
import TiptapEditor from '@/features/editor/components/TiptapEditor.vue';
import Toolbar from '@/features/editor/components/Toolbar.vue';
import Sidebar from '@/features/file-tree/components/Sidebar.vue';
import MicButton from '@/features/editor/components/MicButton.vue';
import ShareButton from '@/features/editor/components/ShareButton.vue';
import InterimBanner from '@/features/editor/components/InterimBanner.vue';
import PracticePanel from '@/features/editor/components/PracticePanel.vue';
import { useCollaboration } from '@/features/collaboration/useCollaboration';
import { useFileTree } from '@/features/file-tree/composables/useFileTree';
import { usePageDocs } from '@/features/documents/usePageDocs';
import { useVoiceCapture } from '@/features/editor/composables/useVoiceCapture';
import { usePractice } from '@/features/editor/composables/usePractice';
import { usePiperTTS } from '@/features/editor/composables/usePiperTTS';

const props = defineProps({
  roomId: { type: String, required: true },
  initialPageId: { type: String, default: null },
});

const sidebarOpen = ref(window.innerWidth >= 768);
const liveEditor = ref(null);

const {
  ydoc,
  provider,
  userName,
  userColor,
  peerCount,
  participants,
  connectionStatus,
  persistenceError,
} = useCollaboration(props.roomId);
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
} = useFileTree(ydoc, provider, props.initialPageId);

const pageDocs = usePageDocs(props.roomId);

const currentPage = computed(() =>
  activePageId.value ? pageDocs.openPage(activePageId.value) : null,
);

function onEditorReady(editor) {
  liveEditor.value = editor;
}

const { isListening, interimText, isSupported, speakerName, toggleListening } = useVoiceCapture(
  provider,
  () => liveEditor.value,
);

const piperTTS = usePiperTTS();

const {
  isActive: practiceActive,
  targetText: practiceTarget,
  spokenText: practiceSpokenText,
  isRecording: practiceRecording,
  interimText: practiceInterim,
  results: practiceResults,
  hasResult: practiceHasResult,
  score: practiceScore,
  total: practiceTotal,
  recordingUrl: practiceRecordingUrl,
  isPlayingRecording: practiceIsPlaying,
  remotePractice,
  startPractice,
  startRecording: practiceRecord,
  stopRecording: practiceStopRecord,
  tryAgain: practiceTryAgain,
  closePractice,
  speakTarget: practiceSpeakTarget,
  playRecording: practicePlayRecording,
  stopPlayback: practiceStopPlayback,
} = usePractice(provider, piperTTS);

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

function handleKeydown(e) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'm') {
    e.preventDefault();
    toggleListening();
  }
  if (mod && e.shiftKey && e.key === 'P') {
    e.preventDefault();
    onStartPractice();
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>
