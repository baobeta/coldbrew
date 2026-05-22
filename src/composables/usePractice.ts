import { ref, computed, onUnmounted } from 'vue';
import { distance as levenshtein } from 'fastest-levenshtein';
import { diffArrays } from 'diff';

export { levenshtein };

export interface WordResult {
  expected: string;
  actual: string | null;
  status: 'correct' | 'close' | 'wrong' | 'missing' | 'extra';
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

function classifySubstitution(expected: string, actual: string): 'close' | 'wrong' {
  const norm = normalize(expected);
  const spokenNorm = normalize(actual);
  if (!norm || !spokenNorm) return 'wrong';
  const dist = levenshtein(norm, spokenNorm);
  const threshold = Math.max(1, Math.floor(norm.length * 0.3));
  return dist <= threshold ? 'close' : 'wrong';
}

export function compareWords(expected: string[], actual: string[]): WordResult[] {
  const normExpected = expected.map(normalize);
  const normActual = actual.map(normalize);

  const changes = diffArrays(normExpected, normActual, {
    comparator: (a, b) => a === b,
  });

  const results: WordResult[] = [];
  let ei = 0;
  let ai = 0;

  for (let c = 0; c < changes.length; c++) {
    const change = changes[c];
    const next = c + 1 < changes.length ? changes[c + 1] : null;

    if (!change.added && !change.removed) {
      for (let j = 0; j < change.count!; j++) {
        results.push({ expected: expected[ei], actual: actual[ai], status: 'correct' });
        ei++;
        ai++;
      }
    } else if (change.removed && next?.added) {
      const removedCount = change.count!;
      const addedCount = next.count!;
      const pairs = Math.min(removedCount, addedCount);

      for (let j = 0; j < pairs; j++) {
        const status = classifySubstitution(expected[ei], actual[ai]);
        results.push({ expected: expected[ei], actual: actual[ai], status });
        ei++;
        ai++;
      }
      for (let j = pairs; j < removedCount; j++) {
        results.push({ expected: expected[ei], actual: null, status: 'missing' });
        ei++;
      }
      for (let j = pairs; j < addedCount; j++) {
        results.push({ expected: '', actual: actual[ai], status: 'extra' });
        ai++;
      }
      c++;
    } else if (change.removed) {
      for (let j = 0; j < change.count!; j++) {
        results.push({ expected: expected[ei], actual: null, status: 'missing' });
        ei++;
      }
    } else if (change.added) {
      for (let j = 0; j < change.count!; j++) {
        results.push({ expected: '', actual: actual[ai], status: 'extra' });
        ai++;
      }
    }
  }

  return results;
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
    return results.value.filter((r) => r.status === 'correct' || r.status === 'close').length;
  });

  const total = computed(() => {
    if (!hasResult.value) return null;
    return results.value.filter((r) => normalize(r.expected)).length;
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
      try {
        recognition.stop();
      } catch {}
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
      try {
        recognition.stop();
      } catch {}
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

  function speakTarget(rate: number = 1) {
    if (!targetText.value) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(targetText.value);
    utterance.rate = rate;
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
