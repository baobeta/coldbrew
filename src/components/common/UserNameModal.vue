<template>
  <div class="modal-overlay" @click.self="submit">
    <div class="modal-card">
      <h2 class="modal-title">What's your name?</h2>
      <p class="modal-subtitle">This will be shown to other collaborators.</p>
      <input
        ref="inputRef"
        v-model="name"
        class="modal-input"
        placeholder="Enter your name"
        maxlength="30"
        @keydown.enter="submit"
      />
      <button class="modal-btn" :disabled="!name.trim()" @click="submit">Continue</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['submit'])
const name = ref('')
const inputRef = ref(null)

onMounted(() => {
  inputRef.value?.focus()
})

function submit() {
  const trimmed = name.value.trim()
  if (trimmed) {
    emit('submit', trimmed)
  }
}
</script>
