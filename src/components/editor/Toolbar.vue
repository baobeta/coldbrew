<template>
  <div
    class="flex items-center justify-between px-4 py-2 border-b border-border bg-bg sticky top-0 z-20 max-md:px-3"
  >
    <div class="flex items-center gap-1" v-if="editor">
      <div class="flex gap-0.5">
        <button
          @click="editor.chain().focus().undo().run()"
          :disabled="!editor.can().undo()"
          :title="`Undo (${mod}Z)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 7l-3 3 3 3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
            <path
              d="M1 10h8a4 4 0 0 0 0-8H6"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </button>
        <button
          @click="editor.chain().focus().redo().run()"
          :disabled="!editor.can().redo()"
          :title="`Redo (${mod}Shift+Z)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M12 7l3 3-3 3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
            <path
              d="M15 10H7a4 4 0 0 1 0-8h3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </button>
      </div>
      <div class="w-px h-5 bg-border mx-2" />
      <div class="flex gap-0.5">
        <button
          @click="editor.chain().focus().toggleBold().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('bold') }"
          :title="`Bold (${mod}B)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          <strong>B</strong>
        </button>
        <button
          @click="editor.chain().focus().toggleItalic().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('italic') }"
          :title="`Italic (${mod}I)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          <em>I</em>
        </button>
        <button
          @click="editor.chain().focus().toggleUnderline().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('underline') }"
          :title="`Underline (${mod}U)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          <span class="underline">U</span>
        </button>
      </div>
      <div class="w-px h-5 bg-border mx-2" />
      <div class="flex gap-0.5">
        <button
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('heading', { level: 2 }) }"
          title="Heading 2"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          H2
        </button>
        <button
          @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('heading', { level: 3 }) }"
          title="Heading 3"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          H3
        </button>
      </div>
      <div class="w-px h-5 bg-border mx-2" />
      <div class="flex gap-0.5">
        <button
          @click="editor.chain().focus().toggleBulletList().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('bulletList') }"
          title="Bullet List"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          •
        </button>
        <button
          @click="editor.chain().focus().toggleOrderedList().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('orderedList') }"
          title="Numbered List"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          1.
        </button>
      </div>
      <div class="w-px h-5 bg-border mx-2" />
      <button
        @click="speakSelection"
        :disabled="!hasSelection"
        title="Speak selected text"
        class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
        :class="{ 'bg-accent/10 text-accent': isSpeaking }"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 6v4h3l4 3V3L5 6H2z"
            stroke="currentColor"
            stroke-width="1.3"
            fill="none"
            stroke-linejoin="round"
          />
          <path
            v-if="!isSpeaking"
            d="M11 5.5a3 3 0 0 1 0 5M13 3.5a6 6 0 0 1 0 9"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            fill="none"
          />
          <path
            v-else
            d="M11 4l-1 4 1 4M13 4l-1 4 1 4"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </button>
      <button
        @click="$emit('cycle-speed')"
        title="Playback speed"
        class="px-1.5 py-1.5 border-none rounded bg-transparent text-text-muted text-xs font-ui font-medium cursor-pointer transition-colors leading-none hover:bg-black/5 min-w-8"
      >
        {{ speedLabel }}
      </button>
      <button
        @click="$emit('start-practice')"
        :disabled="!hasSelection"
        title="Practice pronunciation"
        class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1.3" fill="none" />
          <path
            d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            fill="none"
          />
          <path
            d="M11.5 3.5l1.5 1.5-1.5 1.5"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
    <div v-else class="flex items-center gap-1"></div>
    <div class="flex items-center gap-2">
      <slot name="right" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';

const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';
const isSpeaking = ref(false);
const hasSelection = ref(false);

const emit = defineEmits(['start-practice', 'cycle-speed']);

const props = defineProps({
  editor: { type: Object, default: null },
  speechRate: { type: Number, default: 1 },
  speedLabel: { type: String, default: '1x' },
});

function updateSelection() {
  if (!props.editor) {
    hasSelection.value = false;
    return;
  }
  const { from, to } = props.editor.state.selection;
  hasSelection.value = from !== to;
}

watch(
  () => props.editor,
  (editor) => {
    if (editor) {
      editor.on('selectionUpdate', updateSelection);
      editor.on('transaction', updateSelection);
    }
  },
  { immediate: true },
);

function speakSelection() {
  if (!props.editor) return;
  const { from, to } = props.editor.state.selection;
  if (from === to) return;

  const text = props.editor.state.doc.textBetween(from, to, ' ');
  if (!text.trim()) return;

  if (isSpeaking.value) {
    speechSynthesis.cancel();
    isSpeaking.value = false;
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = props.speechRate;
  utterance.addEventListener('end', () => {
    isSpeaking.value = false;
  });
  utterance.addEventListener('error', () => {
    isSpeaking.value = false;
  });
  isSpeaking.value = true;
  speechSynthesis.speak(utterance);
}

onUnmounted(() => {
  speechSynthesis.cancel();
  if (props.editor) {
    props.editor.off('selectionUpdate', updateSelection);
    props.editor.off('transaction', updateSelection);
  }
});
</script>
