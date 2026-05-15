interface Config {
  appName: string;
  websocketServer: string;
  maxRecentRooms: number;
  docSaveDebounceMs: number;
}

export const config: Config = {
  appName: import.meta.env.VITE_APP_NAME || 'Writeboard',
  websocketServer: import.meta.env.VITE_SIGNALING_SERVERS || 'wss://coldbrew.baobeta.deno.net',
  maxRecentRooms: Number(import.meta.env.VITE_MAX_RECENT_ROOMS) || 20,
  docSaveDebounceMs: Number(import.meta.env.VITE_DOC_SAVE_DEBOUNCE_MS) || 500,
};
