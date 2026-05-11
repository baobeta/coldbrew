<template>
  <slot v-if="!error" />
  <div v-else class="error-boundary">
    <h2>Something went wrong</h2>
    <p>Try refreshing the page.</p>
    <button @click="reset">Reload</button>
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
