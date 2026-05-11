<template>
  <div class="home-page">
    <div class="home-content">
      <h1 class="home-title">Writeboard</h1>
      <p class="home-subtitle">Voice-first collaborative writing. No signup required.</p>
      <button class="create-room-btn" @click="createRoom">
        Create new room
      </button>
      <div v-if="recentRooms.length" class="recent-rooms">
        <h3>Recent rooms</h3>
        <ul>
          <li v-for="room in recentRooms" :key="room.id">
            <a :href="'#room=' + room.id" class="room-link">
              {{ room.id }}
              <span class="room-date">{{ formatDate(room.lastVisited) }}</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { nanoid } from 'nanoid'

const recentRooms = ref(JSON.parse(localStorage.getItem('writeboard-rooms') || '[]'))

function createRoom() {
  const id = nanoid(6)
  window.location.hash = 'room=' + id
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString()
}
</script>
