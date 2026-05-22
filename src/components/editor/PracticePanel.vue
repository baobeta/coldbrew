<template>
  <div class="border-t border-border bg-bg-sidebar px-6 py-4 max-md:px-4">
    <div class="max-w-[720px] mx-auto">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-text font-ui">
          Practice Mode
          <span v-if="remotePractice?.practicerName" class="font-normal text-text-muted">
            · {{ remotePractice.practicerName }} is practicing
          </span>
        </h3>
        <button
          @click="$emit('close')"
          class="w-6 h-6 flex items-center justify-center border-none rounded bg-transparent text-text-muted cursor-pointer hover:bg-black/5 hover:text-text"
          title="Close practice"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div class="mb-3">
        <div class="text-xs uppercase tracking-wide text-text-muted mb-1.5">Target</div>
        <div
          class="text-base text-text font-body leading-relaxed bg-white rounded-lg px-4 py-3 border border-border"
        >
          {{ targetText }}
        </div>
      </div>

      <div v-if="hasResult" class="mb-3">
        <div class="text-xs uppercase tracking-wide text-text-muted mb-1.5">Your pronunciation</div>
        <div class="flex flex-wrap gap-1.5 bg-white rounded-lg px-4 py-3 border border-border">
          <span
            v-for="(word, i) in results"
            :key="i"
            class="px-1.5 py-0.5 rounded text-base font-body"
            :class="{
              'bg-green-100 text-green-800': word.status === 'correct',
              'bg-yellow-100 text-yellow-800': word.status === 'close',
              'bg-red-100 text-red-800': word.status === 'wrong',
              'bg-gray-100 text-gray-400 line-through': word.status === 'missing',
              'bg-blue-100 text-blue-800 italic': word.status === 'extra',
            }"
            :title="word.actual ? `You said: ${word.actual}` : 'Not spoken'"
          >
            {{ word.status === 'extra' ? word.actual : word.expected }}
          </span>
        </div>
        <div class="mt-2 text-sm text-text-muted">
          Score: <strong class="text-text">{{ score }}/{{ total }}</strong>
          <span v-if="score === total" class="text-green-600 ml-1">Perfect!</span>
        </div>
      </div>

      <div v-else-if="isRecording" class="mb-3">
        <div class="text-xs uppercase tracking-wide text-text-muted mb-1.5">Listening...</div>
        <div
          class="bg-white rounded-lg px-4 py-3 border border-accent/30 text-base text-text-muted font-body italic"
        >
          {{ interimText || 'Speak now...' }}
        </div>
      </div>

      <div v-if="remotePractice?.score != null && !hasResult" class="mb-3">
        <div class="text-sm text-text-muted">
          {{ remotePractice.practicerName }}'s score:
          <strong class="text-text">{{ remotePractice.score }}/{{ remotePractice.total }}</strong>
          <span v-if="remotePractice.score === remotePractice.total" class="text-green-600 ml-1"
            >Perfect!</span
          >
        </div>
      </div>

      <div class="flex gap-2">
        <button
          v-if="!isRecording && !hasResult"
          @click="$emit('record')"
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-ui font-medium text-white bg-accent border-none rounded-lg cursor-pointer transition-colors hover:bg-accent-hover"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect
              x="5"
              y="1"
              width="4"
              height="8"
              rx="2"
              stroke="currentColor"
              stroke-width="1.3"
              fill="none"
            />
            <path
              d="M3 6.5a4 4 0 0 0 8 0"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
              fill="none"
            />
            <path d="M7 11v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          </svg>
          Speak
        </button>
        <button
          v-if="isRecording"
          @click="$emit('stop-record')"
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-ui font-medium text-white bg-red-500 border-none rounded-lg cursor-pointer transition-colors hover:bg-red-600 animate-pulse"
        >
          Stop
        </button>
        <button
          v-if="hasResult"
          @click="$emit('try-again')"
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-ui font-medium text-white bg-accent border-none rounded-lg cursor-pointer transition-colors hover:bg-accent-hover"
        >
          Try Again
        </button>
        <button
          @click="$emit('speak-target')"
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-ui font-medium text-text bg-white border border-border rounded-lg cursor-pointer transition-colors hover:bg-black/5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1.5 5v4h2.5l3.5 2.5V2.5L4 5H1.5z"
              stroke="currentColor"
              stroke-width="1.2"
              fill="none"
              stroke-linejoin="round"
            />
            <path
              d="M9.5 4.5a2.5 2.5 0 0 1 0 5"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              fill="none"
            />
            <path
              d="M11 3a5 5 0 0 1 0 8"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              fill="none"
            />
          </svg>
          Listen
        </button>
        <button
          @click="$emit('cycle-speed')"
          title="Playback speed"
          class="px-2 py-2 border border-border rounded-lg bg-white text-text-muted text-xs font-ui font-medium cursor-pointer transition-colors hover:bg-black/5 min-w-9"
        >
          {{ speedLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  targetText: { type: String, required: true },
  results: { type: Array, default: () => [] },
  hasResult: { type: Boolean, default: false },
  isRecording: { type: Boolean, default: false },
  interimText: { type: String, default: '' },
  score: { type: Number, default: null },
  total: { type: Number, default: null },
  remotePractice: { type: Object, default: null },
  speedLabel: { type: String, default: '1x' },
});

defineEmits(['close', 'record', 'stop-record', 'try-again', 'speak-target', 'cycle-speed']);
</script>
