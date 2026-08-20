<template>
  <div class="w-full min-h-screen">
    <ErrorBoundary>
      <UserNameModal v-if="needsName" @submit="onNameSubmit" />
      <HomePage v-else-if="!roomId" />
      <RoomPage v-else :room-id="roomId" :initial-page-id="pageId" :key="roomId" />
    </ErrorBoundary>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import HomePage from '@/features/rooms/HomePage.vue';
import RoomPage from '@/features/rooms/RoomPage.vue';
import ErrorBoundary from '@/shared/components/ErrorBoundary.vue';
import UserNameModal from '@/shared/components/UserNameModal.vue';
import { getStoredUserName, setStoredUserName } from '@/features/documents/useLocalStorage';
import { useEventListener } from '@vueuse/core';

const roomId = ref(null);
const pageId = ref(null);
const needsName = ref(!getStoredUserName());

function onNameSubmit(name) {
  setStoredUserName(name);
  needsName.value = false;
}

function parseHash() {
  const hash = window.location.hash;
  const roomMatch = hash.match(/room=([a-zA-Z0-9_-]+)/);
  const pageMatch = hash.match(/page=([a-zA-Z0-9_-]+)/);
  roomId.value = roomMatch ? roomMatch[1] : null;
  pageId.value = pageMatch ? pageMatch[1] : null;
}

parseHash();
useEventListener('hashchange', parseHash);
</script>
