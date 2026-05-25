import { ref, onUnmounted } from 'vue';

const DEFAULT_VOICE = 'en_US-lessac-medium';

export function usePiperTTS(voiceId: string = DEFAULT_VOICE) {
  const isDownloading = ref(false);
  const isReady = ref(false);
  const isSpeaking = ref(false);
  const showReadyNotice = ref(false);

  let audioElement: HTMLAudioElement | null = null;
  let currentBlobUrl: string | null = null;
  let session: any = null;

  async function download() {
    if (isReady.value || isDownloading.value) return;
    isDownloading.value = true;

    try {
      const { TtsSession } = await import('@realtimex/piper-tts-web');
      session = await TtsSession.create({ voiceId: voiceId as any });
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
    if (!text.trim() || !session) return;

    cleanupAudio();

    try {
      const blob = await session.predict(text);

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
