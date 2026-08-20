import { ref, onUnmounted } from 'vue';

const DEFAULT_VOICE = 'en_US-lessac-medium';

// Module-level singletons so the download state and the underlying TtsSession
// survive component remounts and are shared across every consumer of this
// composable. Previously these lived in function scope, so each remount reset
// isReady to false and re-ran TtsSession.create — making it look like the voice
// re-downloaded every time even though the model bytes are cached in OPFS.
const isDownloading = ref(false);
const isReady = ref(false);
const showReadyNotice = ref(false);

let session: any = null;
// The voice the singleton state was initialized for. Guards against a second
// consumer requesting a different voice than the one already loaded.
let activeVoiceId: string | null = null;
// Ensures the one-time OPFS "already cached?" probe runs at most once.
let readyProbe: Promise<void> | null = null;

// If the model is already stored in OPFS from a previous visit, mark the voice
// ready immediately so the UI skips the download button. The actual TtsSession
// is still created lazily on first speak() (see ensureSession).
async function probeStored(voiceId: string) {
  try {
    const { stored } = await import('@realtimex/piper-tts-web');
    const cached = await stored();
    if (cached.includes(voiceId as any)) {
      isReady.value = true;
    }
  } catch (e) {
    // OPFS unavailable or probe failed — fall back to the manual download path.
    console.error('Piper TTS cache probe error:', e);
  }
}

export function usePiperTTS(voiceId: string = DEFAULT_VOICE) {
  const isSpeaking = ref(false);

  let audioElement: HTMLAudioElement | null = null;
  let currentBlobUrl: string | null = null;

  if (activeVoiceId !== voiceId) {
    activeVoiceId = voiceId;
    isReady.value = false;
    session = null;
    readyProbe = null;
  }
  if (!readyProbe) {
    readyProbe = probeStored(voiceId);
  }

  // Create the TtsSession on demand. On first call this loads the WASM runtime
  // and reads the (already cached) model from OPFS; subsequent calls reuse it.
  async function ensureSession() {
    if (session) return session;
    const { TtsSession } = await import('@realtimex/piper-tts-web');
    session = await TtsSession.create({ voiceId: voiceId as any });
    return session;
  }

  // Explicit "download voice" action from the toolbar button. Warms the session
  // and flips isReady. Because the model is persisted to OPFS, this only hits
  // the network on the very first ever download across all visits.
  async function download() {
    if (isReady.value || isDownloading.value) return;
    isDownloading.value = true;

    try {
      await ensureSession();
      isReady.value = true;

      showReadyNotice.value = true;
      setTimeout(() => {
        showReadyNotice.value = false;
      }, 3000);
    } catch (e) {
      console.error('Piper TTS download error:', e);
    } finally {
      isDownloading.value = false;
    }
  }

  function cleanupAudio() {
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
    isSpeaking.value = false;
  }

  async function speak(text: string, rate: number = 1) {
    if (!text.trim()) return;

    cleanupAudio();

    try {
      // Lazily create the session on first speak — the voice may be marked
      // ready from the OPFS probe without a session existing yet.
      const activeSession = await ensureSession();

      const blob = await activeSession.predict(text);

      currentBlobUrl = URL.createObjectURL(blob);
      audioElement = new Audio(currentBlobUrl);
      audioElement.playbackRate = rate;

      isSpeaking.value = true;

      await new Promise<void>((resolve, reject) => {
        audioElement!.addEventListener('ended', () => {
          isSpeaking.value = false;
          resolve();
        });
        audioElement!.addEventListener('error', (e) => {
          isSpeaking.value = false;
          reject(e);
        });
        audioElement!.play().catch(reject);
      });
    } catch (e) {
      console.error('Piper TTS error:', e);
      isSpeaking.value = false;
    }
  }

  function stop() {
    cleanupAudio();
  }

  onUnmounted(cleanupAudio);

  return {
    isDownloading,
    isReady,
    isSpeaking,
    showReadyNotice,
    download,
    speak,
    stop,
  };
}
