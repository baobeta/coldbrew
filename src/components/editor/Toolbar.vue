<template>
  <div
    class="flex items-center justify-between px-4 py-2 border-b border-border bg-bg sticky top-0 z-10 max-md:px-3"
  >
    <div class="flex items-center gap-1" v-if="editor">
      <div class="flex gap-0.5">
        <button
          @click="editor.chain().focus().undo().run()"
          :disabled="!editor.can().undo()"
          :title="`Undo (${mod}Z)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 7l-3 3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <path d="M1 10h8a4 4 0 0 0 0-8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        </button>
        <button
          @click="editor.chain().focus().redo().run()"
          :disabled="!editor.can().redo()"
          :title="`Redo (${mod}Shift+Z)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 7l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <path d="M15 10H7a4 4 0 0 1 0-8h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        </button>
      </div>
      <div class="w-px h-5 bg-border mx-2" />
      <div class="flex gap-0.5">
        <button
          @click="editor.chain().focus().toggleBold().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('bold') }"
          :title="`Bold (${mod}B)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          <strong>B</strong>
        </button>
        <button
          @click="editor.chain().focus().toggleItalic().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('italic') }"
          :title="`Italic (${mod}I)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          <em>I</em>
        </button>
        <button
          @click="editor.chain().focus().toggleUnderline().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('underline') }"
          :title="`Underline (${mod}U)`"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          <span class="underline">U</span>
        </button>
      </div>
      <div class="w-px h-5 bg-border mx-2" />
      <div class="flex gap-0.5">
        <button
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('heading', { level: 2 }) }"
          title="Heading 2"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          H2
        </button>
        <button
          @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('heading', { level: 3 }) }"
          title="Heading 3"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          H3
        </button>
      </div>
      <div class="w-px h-5 bg-border mx-2" />
      <div class="flex gap-0.5">
        <button
          @click="editor.chain().focus().toggleBulletList().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('bulletList') }"
          title="Bullet List"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          •
        </button>
        <button
          @click="editor.chain().focus().toggleOrderedList().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('orderedList') }"
          title="Numbered List"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          1.
        </button>
      </div>
    </div>
    <div v-else class="flex items-center gap-1"></div>
    <div class="flex items-center gap-2">
      <slot name="right" />
    </div>
  </div>
</template>

<script setup>
const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';

defineProps({
  editor: { type: Object, default: null },
});
</script>
