<template>
  <div
    v-if="text"
    class="px-4 py-2 bg-[#fef7e0] border-b border-[#f0e6c0] text-sm text-[#6b5b00] font-ui"
  >
    <span class="font-semibold">Hearing:</span> {{ text }}
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: '' },
})
</script>
