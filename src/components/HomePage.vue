<template>
  <div class="flex items-center justify-center min-h-screen p-8">
    <div class="text-center max-w-[480px]">
      <h1 class="font-body text-[3.5rem] max-md:text-[2.5rem] font-semibold text-text mb-2">Writeboard</h1>
      <p class="text-lg text-text-muted mb-8">Voice-first collaborative writing. No signup required.</p>
      <button class="inline-block px-8 py-3 text-base font-ui font-medium text-white bg-accent border-none rounded-lg cursor-pointer transition-colors hover:bg-accent-hover" @click="createRoom">Create new room</button>
      <div v-if="recentRooms.length" class="mt-12 text-left">
        <h3 class="text-sm uppercase tracking-wide text-text-muted mb-3">Recent rooms</h3>
        <ul class="list-none">
          <li v-for="room in recentRooms" :key="room.id" class="mb-1">
            <a :href="'#room=' + room.id" class="flex justify-between items-center px-3 py-2 rounded-md no-underline text-text font-ui text-sm transition-colors hover:bg-bg-sidebar">
              {{ room.id }}
              <span class="text-xs text-text-muted">{{ formatDate(room.lastVisited) }}</span>
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
