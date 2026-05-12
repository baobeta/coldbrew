interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface Config {
  appName: string;
  signalingServers: string[];
  iceServers: IceServer[];
  maxRecentRooms: number;
  docSaveDebounceMs: number;
}

export const config: Config = {
  appName: import.meta.env.VITE_APP_NAME || 'Writeboard',
  signalingServers: (import.meta.env.VITE_SIGNALING_SERVERS || 'wss://signaling.yjs.dev').split(
    ',',
  ),
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  maxRecentRooms: Number(import.meta.env.VITE_MAX_RECENT_ROOMS) || 20,
  docSaveDebounceMs: Number(import.meta.env.VITE_DOC_SAVE_DEBOUNCE_MS) || 500,
};
