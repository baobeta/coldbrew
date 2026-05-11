<template>
  <div v-if="text" class="interim-banner">
    <span class="interim-label">Hearing:</span> {{ text }}
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: '' },
})
</script>
