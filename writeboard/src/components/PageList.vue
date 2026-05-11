<template>
  <ul class="page-list">
    <li
      v-for="page in pages"
      :key="page.id"
      :class="{ active: page.id === activePageId }"
      @click="$emit('select', page.id)"
    >
      <span class="page-title">{{ page.title }}</span>
    </li>
  </ul>
</template>

<script setup>
defineProps({
  pages: { type: Array, required: true },
  activePageId: { type: String, default: null },
})
defineEmits(['select'])
</script>
