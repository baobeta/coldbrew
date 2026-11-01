<template>
  <aside
    class="w-60 bg-bg-sidebar border-r border-border flex flex-col shrink-0 h-screen sticky top-0 transition-all duration-200 max-md:fixed max-md:z-20 max-md:h-screen max-md:shadow-[2px_0_8px_rgba(0,0,0,0.1)]"
    :class="{ '-translate-x-60 absolute opacity-0 pointer-events-none': !isOpen }"
  >
    <div class="px-4 py-3 border-b border-border">
      <a
        href="#"
        class="font-body text-base font-semibold text-text tracking-tight no-underline hover:text-accent transition-colors"
        title="Back to rooms"
        >Writeboard</a
      >
    </div>
    <ParticipantsList :participants="participants" />
    <div class="flex flex-col flex-1 min-h-0">
      <div class="flex items-center justify-between px-4 py-3">
        <h2 class="text-xs uppercase tracking-wide text-text-muted font-semibold">Explorer</h2>
        <div class="flex gap-0.5">
          <button
            class="w-[26px] h-[26px] flex items-center justify-center border-none rounded bg-transparent text-text-muted cursor-pointer transition-all hover:bg-black/5 hover:text-text"
            @click="$emit('create-page', null)"
            title="New page"
          >
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
          <button
            data-test="new-canvas-button"
            class="w-[26px] h-[26px] flex items-center justify-center border-none rounded bg-transparent text-text-muted cursor-pointer transition-all hover:bg-black/5 hover:text-text"
            @click="$emit('create-canvas', null)"
            title="New canvas"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M11.5 2.5l2 2-8 8H3.5v-2z"
                stroke="currentColor"
                stroke-width="1.2"
                fill="none"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="w-[26px] h-[26px] flex items-center justify-center border-none rounded bg-transparent text-text-muted cursor-pointer transition-all hover:bg-black/5 hover:text-text"
            @click="$emit('create-folder', null)"
            title="New folder"
          >
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
          <button
            data-test="export-room"
            class="w-[26px] h-[26px] flex items-center justify-center border-none rounded bg-transparent text-text-muted cursor-pointer transition-all hover:bg-black/5 hover:text-text"
            @click="$emit('export-room')"
            title="Export room"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2v8M5 7l3 3 3-3M3 11v2h10v-2"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            data-test="import-backup"
            class="w-[26px] h-[26px] flex items-center justify-center border-none rounded bg-transparent text-text-muted cursor-pointer transition-all hover:bg-black/5 hover:text-text"
            @click="fileInput.click()"
            title="Import backup"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 10V2M5 5l3-3 3 3M3 11v2h10v-2"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <input
            ref="fileInput"
            data-test="import-file"
            type="file"
            accept=".json"
            class="hidden"
            @change="onFileChosen"
          />
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
        @create-canvas="$emit('create-canvas', $event)"
        @create-folder="$emit('create-folder', $event)"
        @export-node="$emit('export-node', $event)"
      />
    </div>
  </aside>
</template>

<script setup>
import { ref } from 'vue';
import FileTree from './FileTree.vue';
import ParticipantsList from './ParticipantsList.vue';

defineProps({
  isOpen: { type: Boolean, default: true },
  tree: { type: Array, required: true },
  activePageId: { type: String, default: null },
  expandedFolders: { type: Set, default: () => new Set() },
  participants: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'create-page',
  'create-canvas',
  'create-folder',
  'select-page',
  'toggle-folder',
  'rename',
  'delete',
  'export-room',
  'export-node',
  'import-file',
]);

const fileInput = ref(null);

function onFileChosen(event) {
  const [file] = event.target.files;
  // Clearing the value lets the same file be chosen again after a failed import.
  event.target.value = '';
  if (file) emit('import-file', file);
}
</script>
