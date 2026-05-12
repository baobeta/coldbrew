<template>
  <div class="px-3 py-2.5 border-b border-border">
    <h2 class="text-xs uppercase tracking-wide text-text-muted font-semibold">People</h2>
    <ul class="list-none mt-1.5">
      <li
        v-for="user in participants"
        :key="user.clientId"
        class="flex items-center gap-2 px-1 py-1 text-[0.82rem] rounded"
      >
        <span class="relative w-[18px] h-[18px] flex items-center justify-center shrink-0">
          <span class="w-2 h-2 rounded-full" :style="{ background: user.color }"></span>
          <span
            class="absolute inset-0 rounded-full border-[1.5px] opacity-30"
            :style="{ borderColor: user.color }"
          ></span>
        </span>
        <span class="overflow-hidden text-ellipsis whitespace-nowrap flex-1">{{ user.name }}</span>
        <span
          v-if="user.isLocal"
          class="text-[0.65rem] uppercase tracking-wide text-text-light bg-black/[0.04] px-1.5 py-px rounded-sm"
          >you</span
        >
        <span
          v-if="user.speaking"
          class="text-accent flex animate-[pulse-opacity_2s_ease-in-out_infinite]"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5a2 2 0 012 2v4a2 2 0 01-4 0v-4a2 2 0 012-2z" fill="currentColor" />
            <path
              d="M4 7.5a4 4 0 008 0M8 11.5v3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  participants: { type: Array, required: true },
})
</script>
