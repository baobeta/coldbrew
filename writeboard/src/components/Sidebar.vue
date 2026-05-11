<template>
  <aside class="sidebar" :class="{ open: isOpen }">
    <div class="sidebar-header">
      <h2 class="sidebar-title">Pages</h2>
      <button class="add-page-btn" @click="$emit('create-page')" title="Add page">+</button>
    </div>
    <PageList
      :pages="pages"
      :active-page-id="activePageId"
      @select="$emit('select-page', $event)"
    />
    <div class="sidebar-footer">
      <div class="participants">
        <span class="participant-count">{{ peerCount }} in room</span>
      </div>
    </div>
  </aside>
</template>

<script setup>
import PageList from './PageList.vue'

defineProps({
  isOpen: { type: Boolean, default: true },
  pages: { type: Array, required: true },
  activePageId: { type: String, default: null },
  peerCount: { type: Number, default: 1 },
})
defineEmits(['create-page', 'select-page'])
</script>
