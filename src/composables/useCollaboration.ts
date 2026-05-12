import { ref, onUnmounted } from 'vue';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { config } from '@/config';
import { useDocPersistence, trackRecentRoom } from '@/composables/useLocalStorage';
import type { Participant, ConnectionStatus, CollaborationReturn } from '@/types';

const USER_COLORS: string[] = [
  '#f44336',
  '#e91e63',
  '#9c27b0',
  '#673ab7',
  '#3f51b5',
  '#2196f3',
  '#00bcd4',
  '#009688',
  '#4caf50',
  '#ff9800',
  '#ff5722',
  '#795548',
];

function randomColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

export function useCollaboration(roomId: string): CollaborationReturn {
  const ydoc = new Y.Doc();
  const provider = new WebrtcProvider(`writeboard-${roomId}`, ydoc, {
    signaling: config.signalingServers,
  });

  const userName = localStorage.getItem('writeboard-username');
  const userColor = randomColor();
  const peerCount = ref<number>(1);
  const participants = ref<Participant[]>([]);
  const connectionStatus = ref<ConnectionStatus>('connecting');

  provider.awareness.setLocalStateField('user', {
    name: userName,
    color: userColor,
  });

  function syncParticipants(): void {
    const states: Map<number, any> = provider.awareness.getStates();
    const myId: number = provider.awareness.clientID;
    const list: Participant[] = [];
    for (const [clientId, state] of states) {
      if (state.user) {
        list.push({
          clientId,
          name: state.user.name || 'Anonymous',
          color: state.user.color || '#888',
          speaking: !!state.speaking,
          isLocal: clientId === myId,
        });
      }
    }
    list.sort((a, b) => (a.isLocal ? -1 : b.isLocal ? 1 : 0));
    participants.value = list;
    peerCount.value = states.size;
  }

  provider.awareness.on('change', syncParticipants);
  syncParticipants();

  provider.on('status', (event: { connected: boolean }) => {
    connectionStatus.value = event.connected ? 'connected' : 'disconnected';
  });

  const { cleanup: cleanupPersistence } = useDocPersistence(ydoc, roomId);
  trackRecentRoom(roomId);

  onUnmounted(() => {
    cleanupPersistence();
    provider.destroy();
    ydoc.destroy();
  });

  return {
    ydoc,
    provider,
    userName,
    userColor,
    peerCount,
    participants,
    connectionStatus,
  };
}
