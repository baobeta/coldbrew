<template>
  <li class="tree-node" :class="{ 'is-active': node.type === 'page' && node.id === activePageId }">
    <div
      class="tree-node-row"
      :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
      @click="handleClick"
      @dblclick="startRename"
      @contextmenu.prevent="showContextMenu"
    >
      <span v-if="node.type === 'folder'" class="tree-chevron" :class="{ expanded: isExpanded }">
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

      <span class="tree-node-icon">
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

      <span v-if="isRenaming" class="tree-rename-wrap" @click.stop>
        <input
          ref="renameInput"
          v-model="renameValue"
          class="tree-rename-input"
          @blur="finishRename"
          @keydown.enter="finishRename"
          @keydown.escape="cancelRename"
        />
      </span>
      <span v-else class="tree-label">{{ node.title }}</span>
    </div>

    <ul v-if="node.type === 'folder' && isExpanded && node.children?.length" class="tree-children">
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

    <div v-if="contextMenu" class="tree-context-menu" :style="contextMenuStyle" @click.stop>
      <button v-if="node.type === 'folder'" @click="onContextAction('new-page')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
      <button v-if="node.type === 'folder'" @click="onContextAction('new-folder')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
      <div v-if="node.type === 'folder'" class="context-menu-divider"></div>
      <button @click="onContextAction('rename')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
      <button class="danger" @click="onContextAction('delete')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
