<template>
  <button
    class="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-full bg-white font-ui text-sm cursor-pointer transition-all whitespace-nowrap hover:border-accent disabled:cursor-not-allowed"
    :class="{
      'bg-accent border-accent text-white animate-[pulse-opacity_2s_ease-in-out_infinite]':
        isListening,
      'opacity-50 cursor-not-allowed': !!speakerName && !isListening,
    }"
    :disabled="!!speakerName && !isListening"
    :title="buttonTitle"
    @click="handleClick"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5a2 2 0 012 2v4a2 2 0 01-4 0v-4a2 2 0 012-2z" fill="currentColor" />
      <path
        d="M4 7.5a4 4 0 008 0M8 11.5v3M6 14.5h4"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
      />
    </svg>
    <span v-if="isListening" class="text-xs">Listening...</span>
    <span v-else-if="speakerName" class="text-xs">{{ speakerName }} is speaking</span>
  </button>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  isListening: { type: Boolean, default: false },
  isSupported: { type: Boolean, default: false },
  speakerName: { type: String, default: null },
});
const emit = defineEmits(['toggle']);

const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';

const buttonTitle = computed(() => {
  if (!props.isSupported) return 'Voice not supported in this browser. Use Chrome or Edge.';
  if (props.isListening) return `Stop dictation (${mod}M)`;
  if (props.speakerName) return `${props.speakerName} is speaking`;
  return `Start dictation (${mod}M)`;
});

function handleClick() {
  if (!props.isSupported) {
    alert('Speech-to-text requires Chrome or Edge browser.');
    return;
  }
  emit('toggle');
}
</script>
