<template>
  <div class="toolbar">
    <div class="toolbar-left" v-if="editor">
      <div class="toolbar-group">
        <button
          @click="editor.chain().focus().toggleBold().run()"
          :class="{ active: editor.isActive('bold') }"
          title="Bold (Ctrl+B)"
          class="toolbar-btn"
        >
          <strong>B</strong>
        </button>
        <button
          @click="editor.chain().focus().toggleItalic().run()"
          :class="{ active: editor.isActive('italic') }"
          title="Italic (Ctrl+I)"
          class="toolbar-btn"
        >
          <em>I</em>
        </button>
      </div>
      <div class="toolbar-separator" />
      <div class="toolbar-group">
        <button
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
          :class="{ active: editor.isActive('heading', { level: 2 }) }"
          title="Heading 2"
          class="toolbar-btn"
        >
          H2
        </button>
        <button
          @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
          :class="{ active: editor.isActive('heading', { level: 3 }) }"
          title="Heading 3"
          class="toolbar-btn"
        >
          H3
        </button>
      </div>
      <div class="toolbar-separator" />
      <div class="toolbar-group">
        <button
          @click="editor.chain().focus().toggleBulletList().run()"
          :class="{ active: editor.isActive('bulletList') }"
          title="Bullet List"
          class="toolbar-btn"
        >
          •
        </button>
        <button
          @click="editor.chain().focus().toggleOrderedList().run()"
          :class="{ active: editor.isActive('orderedList') }"
          title="Numbered List"
          class="toolbar-btn"
        >
          1.
        </button>
      </div>
    </div>
    <div v-else class="toolbar-left"></div>
    <div class="toolbar-right">
      <slot name="right" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  editor: { type: Object, default: null },
})
</script>
