<template>
  <div
    class="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4"
    @click.self="submit"
  >
    <div
      class="bg-white rounded-xl p-8 max-w-[380px] w-full shadow-[0_8px_30px_rgba(0,0,0,0.15)] text-center"
    >
      <h2 class="font-body text-2xl font-semibold mb-1">What's your name?</h2>
      <p class="text-sm text-text-muted mb-6">This will be shown to other collaborators.</p>
      <input
        ref="inputRef"
        v-model="name"
        class="w-full px-3 py-2.5 text-base font-ui border border-border rounded-lg outline-none transition-colors mb-4 focus:border-accent"
        placeholder="Enter your name"
        maxlength="30"
        @keydown.enter="submit"
      />
      <button
        class="w-full px-6 py-2.5 text-base font-ui font-medium text-white bg-accent border-none rounded-lg cursor-pointer transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!name.trim()"
        @click="submit"
      >
        Continue
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const emit = defineEmits(['submit']);
const name = ref('');
const inputRef = ref(null);

onMounted(() => {
  inputRef.value?.focus();
});

function submit() {
  const trimmed = name.value.trim();
  if (trimmed) {
    emit('submit', trimmed);
  }
}
</script>
