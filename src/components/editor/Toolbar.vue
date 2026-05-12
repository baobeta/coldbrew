<template>
  <div
    class="flex items-center justify-between px-4 py-2 border-b border-border bg-bg sticky top-0 z-10 max-md:px-3"
  >
    <div class="flex items-center gap-1" v-if="editor">
      <div class="flex gap-0.5">
        <button
          @click="editor.chain().focus().toggleBold().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('bold') }"
          title="Bold (Ctrl+B)"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          <strong>B</strong>
        </button>
        <button
          @click="editor.chain().focus().toggleItalic().run()"
          :class="{ 'bg-black/10 font-semibold': editor.isActive('italic') }"
          title="Italic (Ctrl+I)"
          class="px-2.5 py-1.5 border-none rounded bg-transparent text-text text-sm font-ui cursor-pointer transition-colors leading-none hover:bg-black/5"
        >
          <em>I</em>
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
defineProps({
  editor: { type: Object, default: null },
})
</script>
