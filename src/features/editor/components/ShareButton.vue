<template>
  <button
    class="px-3 py-1.5 border border-border rounded-full bg-white font-ui text-sm cursor-pointer transition-all whitespace-nowrap hover:border-text-muted"
    @click="copyLink"
    :title="copied ? 'Copied!' : 'Copy room link'"
  >
    {{ copied ? '✓ Copied' : '🔗 Share' }}
  </button>
</template>

<script setup>
import { ref } from 'vue';

const copied = ref(false);

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = window.location.href;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>
