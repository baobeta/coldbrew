<template>
  <li :class="{ 'is-active': node.type === 'page' && node.id === activePageId }">
    <div
      class="flex items-center gap-0.5 px-2 py-[3px] cursor-pointer text-[0.82rem] text-text rounded mx-1 my-px transition-colors select-none h-[26px] hover:bg-black/5"
      :class="{
        'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]':
          node.type === 'page' && node.id === activePageId,
      }"
      :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
      @click="handleClick"
      @dblclick="startRename"
      @contextmenu.prevent="showContextMenu"
    >
      <span
        v-if="node.type === 'folder'"
        class="inline-flex w-4 h-4 items-center justify-center text-text-light transition-transform duration-150 shrink-0"
        :class="{ 'tree-chevron-expanded': isExpanded }"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            stroke-width="1.5"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>

      <span class="inline-flex w-4 h-4 items-center justify-center shrink-0 mr-0.5">
        <svg
          v-if="node.type === 'folder' && isExpanded"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z"
            stroke="#e8a848"
            stroke-width="1.2"
            fill="#fef3c7"
            stroke-linejoin="round"
          />
          <path d="M1.5 5h13" stroke="#e8a848" stroke-width="1" />
        </svg>
        <svg
          v-else-if="node.type === 'folder'"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z"
            stroke="#d4a843"
            stroke-width="1.2"
            fill="#fde68a"
            stroke-linejoin="round"
          />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M4.5 1.5h5l3 3v9.5h-8z"
            stroke="#94a3b8"
            stroke-width="1.2"
            fill="#f1f5f9"
            stroke-linejoin="round"
          />
          <path
            d="M9.5 1.5v3h3"
            stroke="#94a3b8"
            stroke-width="1.2"
            fill="none"
            stroke-linejoin="round"
          />
          <path d="M6 7.5h4M6 9.5h3" stroke="#94a3b8" stroke-width="1" stroke-linecap="round" />
        </svg>
      </span>

      <span v-if="isRenaming" class="flex-1" @click.stop>
        <input
          ref="renameInput"
          v-model="renameValue"
          class="w-full px-1 py-px text-[0.82rem] font-ui border border-accent rounded-sm outline-none bg-white"
          @blur="finishRename"
          @keydown.enter="finishRename"
          @keydown.escape="cancelRename"
        />
      </span>
      <span v-else class="overflow-hidden text-ellipsis whitespace-nowrap flex-1 leading-tight">{{
        node.title
      }}</span>
    </div>

    <ul
      v-if="node.type === 'folder' && isExpanded && node.children?.length"
      class="list-none p-0 m-0"
    >
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
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

    <div
      v-if="contextMenu"
      class="fixed z-50 bg-white border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.06)] p-1 min-w-[160px] animate-[context-fade-in_0.1s_ease]"
      :style="contextMenuStyle"
      @click.stop
    >
      <button
        v-if="node.type === 'folder'"
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
        v-if="node.type === 'folder'"
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
      <div v-if="node.type === 'folder'" class="h-px bg-border mx-1.5 my-[3px]"></div>
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
  </li>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  activePageId: { type: String, default: null },
  expandedFolders: { type: Set, default: () => new Set() },
})

const emit = defineEmits([
  'select-page',
  'toggle-folder',
  'rename',
  'delete',
  'create-page',
  'create-folder',
])

const isExpanded = computed(() => props.expandedFolders.has(props.node.id))

const isRenaming = ref(false)
const renameValue = ref('')
const renameInput = ref(null)

const contextMenu = ref(false)
const contextMenuStyle = ref({})

function handleClick() {
  if (props.node.type === 'page') {
    emit('select-page', props.node.id)
  } else {
    emit('toggle-folder', props.node.id)
  }
}

function startRename() {
  isRenaming.value = true
  renameValue.value = props.node.title
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function finishRename() {
  if (!isRenaming.value) return
  const trimmed = renameValue.value.trim()
  if (trimmed && trimmed !== props.node.title) {
    emit('rename', { id: props.node.id, title: trimmed })
  }
  isRenaming.value = false
}

function cancelRename() {
  isRenaming.value = false
}

function showContextMenu(e) {
  contextMenu.value = true
  contextMenuStyle.value = {
    top: e.clientY + 'px',
    left: e.clientX + 'px',
  }
}

function hideContextMenu() {
  contextMenu.value = false
}

function onContextAction(action) {
  contextMenu.value = false
  if (action === 'rename') startRename()
  else if (action === 'delete') emit('delete', props.node.id)
  else if (action === 'new-page') emit('create-page', props.node.id)
  else if (action === 'new-folder') emit('create-folder', props.node.id)
}

onMounted(() => {
  document.addEventListener('click', hideContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu)
})
</script>

<style scoped>
.tree-chevron-expanded {
  transform: rotate(90deg);
}
</style>
