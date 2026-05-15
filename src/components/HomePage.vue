<template>
  <div class="flex items-center justify-center min-h-screen p-8">
    <div class="text-center max-w-[480px]">
      <h1 class="font-body text-[3.5rem] max-md:text-[2.5rem] font-semibold text-text mb-2">
        Writeboard
      </h1>
      <p class="text-lg text-text-muted mb-8">
        Voice-first collaborative writing. No signup required.
      </p>
      <form class="flex gap-2 items-center justify-center" @submit.prevent="createRoom">
        <input
          v-model="roomName"
          type="text"
          placeholder="Room name (optional)"
          class="px-4 py-3 text-base font-ui border border-border rounded-lg bg-white text-text outline-none transition-colors focus:border-accent w-56"
        />
        <button
          type="submit"
          class="px-8 py-3 text-base font-ui font-medium text-white bg-accent border-none rounded-lg cursor-pointer transition-colors hover:bg-accent-hover whitespace-nowrap"
        >
          Create room
        </button>
      </form>
      <div v-if="recentRooms.length" class="mt-12 text-left">
        <h3 class="text-sm uppercase tracking-wide text-text-muted mb-3">Recent rooms</h3>
        <ul class="list-none">
          <li v-for="room in recentRooms" :key="room.id" class="mb-1">
            <a
              :href="'#room=' + room.id"
              class="flex justify-between items-center px-3 py-2 rounded-md no-underline text-text font-ui text-sm transition-colors hover:bg-bg-sidebar"
            >
              {{ room.name || room.id }}
              <span class="text-xs text-text-muted">{{ formatDate(room.lastVisited) }}</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { nanoid } from 'nanoid';
import { trackRecentRoom } from '@/composables/useLocalStorage';

const recentRooms = ref(JSON.parse(localStorage.getItem('writeboard-rooms') || '[]'));
const roomName = ref('');

function createRoom() {
  const id = nanoid(6);
  const name = roomName.value.trim() || undefined;
  trackRecentRoom(id, name);
  window.location.hash = 'room=' + id;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString();
}
</script>
