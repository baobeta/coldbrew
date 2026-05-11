<template>
  <ErrorBoundary>
    <UserNameModal v-if="needsName" @submit="onNameSubmit" />
    <HomePage v-else-if="!roomId" />
    <RoomPage v-else :room-id="roomId" :key="roomId" />
  </ErrorBoundary>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import HomePage from './components/HomePage.vue'
import RoomPage from './components/RoomPage.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'
import UserNameModal from './components/UserNameModal.vue'
import { getStoredUserName, setStoredUserName } from './composables/useCollaboration.js'

const roomId = ref(null)
const needsName = ref(!getStoredUserName())

function onNameSubmit(name) {
  setStoredUserName(name)
  needsName.value = false
}

function parseHash() {
  const hash = window.location.hash
  const match = hash.match(/room=([a-zA-Z0-9_-]+)/)
  roomId.value = match ? match[1] : null
}

onMounted(() => {
  parseHash()
  window.addEventListener('hashchange', parseHash)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', parseHash)
})
</script>
