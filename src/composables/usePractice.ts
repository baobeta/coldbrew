import { ref, computed, onUnmounted } from 'vue';
import { distance as levenshtein } from 'fastest-levenshtein';

export { levenshtein };

export interface WordResult {
  expected: string;
  actual: string | null;
  status: 'correct' | 'close' | 'wrong' | 'missing';
}

export interface PracticeState {
  targetText: string;
  active: boolean;
  score: number | null;
  total: number | null;
  practicerName: string | null;
}

export function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function compareWords(expected: string[], actual: string[]): WordResult[] {
  return expected.map((word, i) => {
    const norm = normalize(word);
    if (!norm) return { expected: word, actual: null, status: 'correct' as const };

    const spokenNorm = i < actual.length ? normalize(actual[i]) : null;
    if (!spokenNorm) return { expected: word, actual: null, status: 'missing' as const };

    if (norm === spokenNorm) return { expected: word, actual: actual[i], status: 'correct' as const };

    const dist = levenshtein(norm, spokenNorm);
    const threshold = Math.max(1, Math.floor(norm.length * 0.3));
    if (dist <= threshold) return { expected: word, actual: actual[i], status: 'close' as const };

    return { expected: word, actual: actual[i], status: 'wrong' as const };
  });
}

export function usePractice(provider: any) {
  const isActive = ref(false);
  const targetText = ref('');
  const spokenText = ref('');
  const isRecording = ref(false);
  const interimText = ref('');
  const results = ref<WordResult[]>([]);
  const hasResult = ref(false);

  const score = computed(() => {
    if (!hasResult.value) return null;
    return results.value.filter(r => r.status === 'correct' || r.status === 'close').length;
  });

  const total = computed(() => {
    if (!hasResult.value) return null;
    return results.value.filter(r => normalize(r.expected)).length;
  });

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  let recognition: any = null;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.addEventListener('result', (event: any) => {
      let finalTranscript = '';
      let interim = '';

      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        spokenText.value = finalTranscript.trim();
        interimText.value = '';
        evaluateResult();
      } else {
        interimText.value = interim;
      }
    });

    recognition.addEventListener('end', () => {
      isRecording.value = false;
      if (!hasResult.value && spokenText.value) {
        evaluateResult();
      }
    });

    recognition.addEventListener('error', () => {
      isRecording.value = false;
    });
  }

  function evaluateResult() {
    const expectedWords = targetText.value.split(/\s+/).filter(Boolean);
    const actualWords = spokenText.value.split(/\s+/).filter(Boolean);
    results.value = compareWords(expectedWords, actualWords);
    hasResult.value = true;
    isRecording.value = false;

    broadcastState();

    if (recognition) {
      try { recognition.stop(); } catch {}
    }
  }

  function startPractice(text: string) {
    targetText.value = text;
    spokenText.value = '';
    interimText.value = '';
    results.value = [];
    hasResult.value = false;
    isActive.value = true;
    broadcastState();
  }

  function startRecording() {
    if (!recognition) return;
    spokenText.value = '';
    interimText.value = '';
    results.value = [];
    hasResult.value = false;
    isRecording.value = true;

    try {
      recognition.start();
    } catch {
      isRecording.value = false;
    }
  }

  function stopRecording() {
    isRecording.value = false;
    if (recognition) {
      try { recognition.stop(); } catch {}
    }
  }

  function tryAgain() {
    spokenText.value = '';
    interimText.value = '';
    results.value = [];
    hasResult.value = false;
    broadcastState();
  }

  function closePractice() {
    stopRecording();
    isActive.value = false;
    targetText.value = '';
    spokenText.value = '';
    interimText.value = '';
    results.value = [];
    hasResult.value = false;
    broadcastState();
  }

  function speakTarget() {
    if (!targetText.value) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(targetText.value);
    utterance.rate = 0.85;
    speechSynthesis.speak(utterance);
  }

  function broadcastState() {
    const state: PracticeState = {
      targetText: targetText.value,
      active: isActive.value,
      score: score.value,
      total: total.value,
      practicerName: null,
    };
    provider.awareness.setLocalStateField('practice', state);
  }

  // Listen for remote practice state
  const remotePractice = ref<PracticeState | null>(null);

  function syncRemotePractice() {
    const states: Map<number, any> = provider.awareness.getStates();
    const myId: number = provider.awareness.clientID;

    for (const [clientId, state] of states) {
      if (clientId !== myId && state.practice?.active) {
        remotePractice.value = {
          ...state.practice,
          practicerName: state.user?.name || 'Someone',
        };
        if (!isActive.value) {
          targetText.value = state.practice.targetText;
          isActive.value = true;
        }
        return;
      }
    }

    if (!isActive.value) {
      remotePractice.value = null;
    }
  }

  provider.awareness.on('change', syncRemotePractice);

  onUnmounted(() => {
    stopRecording();
    speechSynthesis.cancel();
    provider.awareness.off('change', syncRemotePractice);
  });

  return {
    isActive,
    targetText,
    spokenText,
    isRecording,
    interimText,
    results,
    hasResult,
    score,
    total,
    remotePractice,
    startPractice,
    startRecording,
    stopRecording,
    tryAgain,
    closePractice,
    speakTarget,
  };
}
