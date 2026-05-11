<template>
  <div class="participants-list">
    <h2 class="sidebar-section-title">People</h2>
    <ul class="participants-ul">
      <li v-for="user in participants" :key="user.clientId" class="participant-item">
        <span class="participant-dot-wrap">
          <span class="participant-dot" :style="{ background: user.color }"></span>
          <span class="participant-online-ring" :style="{ borderColor: user.color }"></span>
        </span>
        <span class="participant-name">{{ user.name }}</span>
        <span v-if="user.isLocal" class="participant-badge">you</span>
        <span v-if="user.speaking" class="participant-mic">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5a2 2 0 012 2v4a2 2 0 01-4 0v-4a2 2 0 012-2z" fill="currentColor"/>
            <path d="M4 7.5a4 4 0 008 0M8 11.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
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
