<template>
  <slot v-if="!error" />
  <div v-else class="flex flex-col items-center justify-center min-h-screen gap-4 font-ui">
    <h2 class="text-2xl">Something went wrong</h2>
    <p class="text-text-muted">Try refreshing the page.</p>
    <button
      class="px-6 py-2 border border-border rounded-md bg-white cursor-pointer font-ui"
      @click="reset"
    >
      Reload
    </button>
  </div>
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue'

const error = ref(null)

onErrorCaptured((err) => {
  error.value = err
  console.error('Writeboard error:', err)
  return false
})

function reset() {
  window.location.reload()
}
</script>
