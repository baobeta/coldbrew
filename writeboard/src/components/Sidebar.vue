<template>
  <aside class="sidebar" :class="{ open: isOpen }">
    <ParticipantsList :participants="participants" />
    <div class="sidebar-section">
      <div class="sidebar-header">
        <h2 class="sidebar-section-title">Files</h2>
        <div class="sidebar-actions">
          <button class="add-page-btn" @click="$emit('create-page', null)" title="New page">+📄</button>
          <button class="add-page-btn" @click="$emit('create-folder', null)" title="New folder">+📁</button>
        </div>
      </div>
      <FileTree
        :tree="tree"
        :active-page-id="activePageId"
        :expanded-folders="expandedFolders"
        @select-page="$emit('select-page', $event)"
        @toggle-folder="$emit('toggle-folder', $event)"
        @rename="$emit('rename', $event)"
        @delete="$emit('delete', $event)"
        @create-page="$emit('create-page', $event)"
        @create-folder="$emit('create-folder', $event)"
      />
    </div>
  </aside>
</template>

<script setup>
import FileTree from './FileTree.vue'
import ParticipantsList from './ParticipantsList.vue'

defineProps({
  isOpen: { type: Boolean, default: true },
  tree: { type: Array, required: true },
  activePageId: { type: String, default: null },
  expandedFolders: { type: Set, default: () => new Set() },
  participants: { type: Array, default: () => [] },
})

defineEmits(['create-page', 'create-folder', 'select-page', 'toggle-folder', 'rename', 'delete'])
</script>
