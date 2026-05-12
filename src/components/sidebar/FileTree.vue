<template>
  <div class="flex-1 overflow-y-auto py-0.5">
    <ul class="list-none p-0 m-0" v-if="tree.length">
      <TreeNode
        v-for="node in tree"
        :key="node.id"
        :node="node"
        :depth="0"
        :active-page-id="activePageId"
        :expanded-folders="expandedFolders"
        @select-page="$emit('select-page', $event)"
        @toggle-folder="$emit('toggle-folder', $event)"
        @rename="$emit('rename', $event)"
        @delete="$emit('delete', $event)"
        @create-page="$emit('create-page', $event)"
        @create-folder="$emit('create-folder', $event)"
      />
    </ul>
    <div v-else class="p-6 text-center text-[0.82rem] text-text-light">No pages yet</div>
  </div>
</template>

<script setup>
import TreeNode from './TreeNode.vue';

defineProps({
  tree: { type: Array, required: true },
  activePageId: { type: String, default: null },
  expandedFolders: { type: Set, default: () => new Set() },
});

defineEmits(['select-page', 'toggle-folder', 'rename', 'delete', 'create-page', 'create-folder']);
</script>
