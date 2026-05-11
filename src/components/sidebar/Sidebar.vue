<template>
  <aside class="sidebar" :class="{ open: isOpen }">
    <div class="sidebar-brand">
      <span class="sidebar-brand-text">Writeboard</span>
    </div>
    <ParticipantsList :participants="participants" />
    <div class="sidebar-section">
      <div class="sidebar-header">
        <h2 class="sidebar-section-title">Explorer</h2>
        <div class="sidebar-actions">
          <button class="sidebar-icon-btn" @click="$emit('create-page', null)" title="New page">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4.5 1.5h5l3 3v9.5h-8z"
                stroke="currentColor"
                stroke-width="1.2"
                fill="none"
                stroke-linejoin="round"
              />
              <path
                d="M9.5 1.5v3h3"
                stroke="currentColor"
                stroke-width="1.2"
                fill="none"
                stroke-linejoin="round"
              />
              <path
                d="M7 8v3M5.5 9.5h3"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <button class="sidebar-icon-btn" @click="$emit('create-folder', null)" title="New folder">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z"
                stroke="currentColor"
                stroke-width="1.2"
                fill="none"
                stroke-linejoin="round"
              />
              <path
                d="M7 8v3M5.5 9.5h3"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
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
