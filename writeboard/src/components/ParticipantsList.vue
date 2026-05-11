<template>
  <div class="participants-list">
    <h2 class="sidebar-section-title">People</h2>
    <ul class="participants-ul">
      <li v-for="user in participants" :key="user.clientId" class="participant-item">
        <span class="participant-dot" :style="{ background: user.color }"></span>
        <span class="participant-name">{{ user.name }}</span>
        <span v-if="user.isLocal" class="participant-you">(you)</span>
        <span v-if="user.speaking" class="participant-speaking">🎤</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  participants: { type: Array, required: true },
})
</script>
