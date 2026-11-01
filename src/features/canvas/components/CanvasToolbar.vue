<template>
  <div
    data-test="canvas-toolbar"
    class="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 p-1 bg-white border border-border rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] cursor-default"
    @pointerdown.stop
    @wheel.stop
  >
    <button
      v-for="option in TOOLS"
      :key="option.id"
      :data-test="`tool-${option.id}`"
      :class="[buttonClass, { 'bg-black/10': tool === option.id }]"
      :title="option.title"
      :aria-pressed="tool === option.id"
      @click="$emit('update:tool', option.id)"
    >
      {{ option.label }}
    </button>
    <span class="w-px h-5 bg-border mx-1"></span>
    <button
      v-for="option in STROKE_COLORS"
      :key="option"
      :data-test="`color-${option}`"
      class="w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer hover:bg-black/5"
      :class="{ 'bg-black/10': color === option }"
      :title="`Color ${option}`"
      :aria-pressed="color === option"
      @click="$emit('update:color', option)"
    >
      <span class="w-4 h-4 rounded-full" :style="{ background: option }"></span>
    </button>
    <span class="w-px h-5 bg-border mx-1"></span>
    <button :class="buttonClass" title="Smaller ( [ )" @click="$emit('step-size', -1)">−</button>
    <span class="w-6 text-center text-xs text-text-muted" title="Stroke size">{{ size }}</span>
    <button :class="buttonClass" title="Larger ( ] )" @click="$emit('step-size', 1)">+</button>
    <span class="w-px h-5 bg-border mx-1"></span>
    <button :class="buttonClass" :title="`Undo (${mod}Z)`" @click="$emit('undo')">↶</button>
    <button :class="buttonClass" :title="`Redo (⇧${mod}Z)`" @click="$emit('redo')">↷</button>
    <span class="w-px h-5 bg-border mx-1"></span>
    <button :class="buttonClass" title="Zoom out" @click="$emit('zoom', 0.8)">−</button>
    <span class="w-10 text-center text-xs text-text-muted">{{ zoomPercent }}%</span>
    <button :class="buttonClass" title="Zoom in" @click="$emit('zoom', 1.25)">+</button>
  </div>
</template>

<script setup>
import { STROKE_COLORS } from '@/features/canvas/composables/useToolSettings';

defineProps({
  tool: { type: String, required: true },
  color: { type: String, required: true },
  size: { type: Number, required: true },
  zoomPercent: { type: Number, required: true },
});

defineEmits(['update:tool', 'update:color', 'step-size', 'undo', 'redo', 'zoom']);

const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';
const buttonClass =
  'min-w-7 h-7 px-1 flex items-center justify-center border-none rounded bg-transparent text-sm text-text cursor-pointer hover:bg-black/5';
const TOOLS = [
  { id: 'pen', label: '✎', title: 'Pen (P)' },
  { id: 'highlighter', label: '▰', title: 'Highlighter (H)' },
  { id: 'eraser', label: '⌫', title: 'Eraser (E)' },
];
</script>
