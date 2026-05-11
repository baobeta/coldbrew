<template>
  <aside class="sidebar" :class="{ open: isOpen }">
    <ParticipantsList :participants="participants" />
    <div class="sidebar-section">
      <div class="sidebar-header">
        <h2 class="sidebar-section-title">Pages</h2>
        <button class="add-page-btn" @click="$emit('create-page')" title="Add page">+</button>
      </div>
      <PageList
        :pages="pages"
        :active-page-id="activePageId"
        @select="$emit('select-page', $event)"
      />
    </div>
  </aside>
</template>

<script setup>
import PageList from './PageList.vue'
import ParticipantsList from './ParticipantsList.vue'

defineProps({
  isOpen: { type: Boolean, default: true },
  pages: { type: Array, required: true },
  activePageId: { type: String, default: null },
  participants: { type: Array, default: () => [] },
})
defineEmits(['create-page', 'select-page'])
</script>
