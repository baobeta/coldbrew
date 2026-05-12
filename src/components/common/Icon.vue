<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    class="icon"
    :class="'icon-' + name"
  >
    <path
      v-for="(p, i) in paths"
      :key="i"
      :d="p.d"
      :stroke="p.stroke || 'currentColor'"
      :stroke-width="p.strokeWidth || '1.2'"
      :fill="p.fill || 'none'"
      :stroke-linecap="p.strokeLinecap"
      :stroke-linejoin="p.strokeLinejoin || 'round'"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue';
import { icons } from '@/assets/icons';

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
});

const paths = computed(() => icons[props.name] || []);
</script>
