<template>
  <div class="flex-1 overflow-y-auto py-0.5">
    <ul class="list-none p-0 m-0" v-if="tree.length">
      <TreeNode
        v-for="node in tree"
        :key="node.id"
        :node="node"
        :depth="0"
        :active-page-id="activePageId"
        :is-expanded="expandedFolders.has(node.id)"
        :expanded-folders="expandedFolders"
        @select-page="$emit('select-page', $event)"
        @toggle-folder="$emit('toggle-folder', $event)"
        @rename="$emit('rename', $event)"
        @delete="$emit('delete', $event)"
        @create-page="$emit('create-page', $event)"
        @create-folder="$emit('create-folder', $event)"
        @open-context-menu="contextMenu = $event"
      />
    </ul>
    <div v-else class="p-6 text-center text-[0.82rem] text-text-light">No pages yet</div>

    <div
      v-if="contextMenu"
      data-test="context-menu"
      class="fixed z-50 bg-white border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.06)] p-1 min-w-[160px] animate-[context-fade-in_0.1s_ease]"
      :style="{ position: 'fixed', top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <button
        v-if="contextMenu.node.type === 'folder'"
        class="flex items-center gap-2 w-full px-2.5 py-1.5 border-none bg-transparent text-[0.82rem] font-ui text-text text-left cursor-pointer rounded hover:bg-black/5"
        @click="onContextAction('new-page')"
      >
        <svg
          class="shrink-0 text-text-muted"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
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
        </svg>
        New Page
      </button>
      <button
        v-if="contextMenu.node.type === 'folder'"
        class="flex items-center gap-2 w-full px-2.5 py-1.5 border-none bg-transparent text-[0.82rem] font-ui text-text text-left cursor-pointer rounded hover:bg-black/5"
        @click="onContextAction('new-folder')"
      >
        <svg
          class="shrink-0 text-text-muted"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z"
            stroke="currentColor"
            stroke-width="1.2"
            fill="none"
            stroke-linejoin="round"
          />
        </svg>
        New Folder
      </button>
      <div v-if="contextMenu.node.type === 'folder'" class="h-px bg-border mx-1.5 my-[3px]"></div>
      <button
        class="flex items-center gap-2 w-full px-2.5 py-1.5 border-none bg-transparent text-[0.82rem] font-ui text-text text-left cursor-pointer rounded hover:bg-black/5"
        @click="onContextAction('rename')"
      >
        <svg
          class="shrink-0 text-text-muted"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M11.5 2.5l2 2-8 8H3.5v-2z"
            stroke="currentColor"
            stroke-width="1.2"
            fill="none"
            stroke-linejoin="round"
          />
        </svg>
        Rename
      </button>
      <button
        class="flex items-center gap-2 w-full px-2.5 py-1.5 border-none bg-transparent text-[0.82rem] font-ui text-red-600 text-left cursor-pointer rounded hover:bg-red-600/5"
        @click="onContextAction('delete')"
      >
        <svg class="shrink-0 text-red-600" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M3 4.5h10M5.5 4.5V3.5h5v1M5.5 4.5v8h5v-8"
            stroke="currentColor"
            stroke-width="1.2"
            fill="none"
            stroke-linejoin="round"
          />
        </svg>
        Delete
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, provide, onMounted, onUnmounted } from 'vue';
import TreeNode from './TreeNode.vue';

defineProps({
  tree: { type: Array, required: true },
  activePageId: { type: String, default: null },
  expandedFolders: { type: Set, default: () => new Set() },
});

const emit = defineEmits([
  'select-page',
  'toggle-folder',
  'rename',
  'delete',
  'create-page',
  'create-folder',
]);

const contextMenu = ref(null);

// O(1) rename registry: each TreeNode registers its startRename fn by node id
const renameHandlers = new Map();
provide('registerRename', (id, fn) => {
  renameHandlers.set(id, fn);
  return () => renameHandlers.delete(id);
});

function hideContextMenu() {
  contextMenu.value = null;
}

function onContextAction(action) {
  const node = contextMenu.value?.node;
  contextMenu.value = null;
  if (!node) return;
  if (action === 'rename') {
    renameHandlers.get(node.id)?.();
  } else if (action === 'delete') {
    const typeLabel = node.type === 'folder' ? 'folder' : 'page';
    const message = `Delete "${node.title}"?\n\nThis ${typeLabel} will be permanently removed.`;
    if (window.confirm(message)) {
      emit('delete', node.id);
    }
  } else if (action === 'new-page') {
    emit('create-page', node.id);
  } else if (action === 'new-folder') {
    emit('create-folder', node.id);
  }
}

onMounted(() => {
  document.addEventListener('click', hideContextMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu);
});
</script>
