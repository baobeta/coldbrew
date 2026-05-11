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
        ▸
      </span>
      <span v-else class="tree-icon">📄</span>
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
      <button v-if="node.type === 'folder'" @click="onContextAction('new-page')">New Page</button>
      <button v-if="node.type === 'folder'" @click="onContextAction('new-folder')">New Folder</button>
      <button @click="onContextAction('rename')">Rename</button>
      <button v-if="canDelete" class="danger" @click="onContextAction('delete')">Delete</button>
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

const emit = defineEmits(['select-page', 'toggle-folder', 'rename', 'delete', 'create-page', 'create-folder'])

const isExpanded = computed(() => props.expandedFolders.has(props.node.id))
const canDelete = computed(() => {
  if (props.node.type === 'folder') return true
  return true
})

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
