<template>
  <button
    v-if="isSupported"
    class="mic-btn"
    :class="{
      listening: isListening,
      unavailable: !!speakerName && !isListening
    }"
    :disabled="!!speakerName && !isListening"
    :title="buttonTitle"
    @click="$emit('toggle')"
  >
    <span class="mic-icon">🎤</span>
    <span v-if="isListening" class="mic-label">Listening...</span>
    <span v-else-if="speakerName" class="mic-label">{{ speakerName }} is speaking</span>
  </button>
  <span v-else class="mic-unsupported">Voice not supported</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  isListening: { type: Boolean, default: false },
  isSupported: { type: Boolean, default: false },
  speakerName: { type: String, default: null },
})
defineEmits(['toggle'])

const buttonTitle = computed(() => {
  if (props.isListening) return 'Stop dictation'
  if (props.speakerName) return `${props.speakerName} is speaking`
  return 'Start dictation'
})
</script>
