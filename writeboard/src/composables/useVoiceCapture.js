import { ref, onUnmounted } from 'vue'

export function useVoiceCapture(provider, getEditor) {
  const isListening = ref(false)
  const interimText = ref('')
  const isSupported = ref(false)
  const speakerName = ref(null)

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  isSupported.value = !!SpeechRecognition

  let recognition = null
  let restartCount = 0
  const MAX_RESTARTS = 3

  if (SpeechRecognition) {
    recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          const editor = getEditor()
          if (editor) {
            editor
              .chain()
              .focus()
              .insertContent(transcript + ' ')
              .run()
          }
          interimText.value = ''
        } else {
          interim += transcript
        }
      }
      if (interim) interimText.value = interim
    }

    recognition.onend = () => {
      if (isListening.value) {
        if (restartCount < MAX_RESTARTS) {
          restartCount++
          try {
            recognition.start()
          } catch (e) {}
        } else {
          stopListening()
        }
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        stopListening()
      }
    }
  }

  function isSomeoneElseSpeaking() {
    const states = provider.awareness.getStates()
    const myId = provider.awareness.clientID
    for (const [clientId, state] of states) {
      if (clientId !== myId && state.speaking) {
        speakerName.value = state.user?.name || 'Someone'
        return true
      }
    }
    return false
  }

  provider.awareness.on('change', () => {
    if (!isListening.value) {
      const states = provider.awareness.getStates()
      const myId = provider.awareness.clientID
      let foundSpeaker = null
      for (const [clientId, state] of states) {
        if (clientId !== myId && state.speaking) {
          foundSpeaker = state.user?.name || 'Someone'
          break
        }
      }
      speakerName.value = foundSpeaker
    }
  })

  function startListening() {
    if (!recognition) return
    if (isSomeoneElseSpeaking()) return

    isListening.value = true
    restartCount = 0
    provider.awareness.setLocalStateField('speaking', true)
    try {
      recognition.start()
    } catch (e) {
      stopListening()
    }
  }

  function stopListening() {
    isListening.value = false
    interimText.value = ''
    provider.awareness.setLocalStateField('speaking', false)
    if (recognition) {
      try {
        recognition.stop()
      } catch (e) {}
    }
  }

  function toggleListening() {
    if (isListening.value) {
      stopListening()
    } else {
      startListening()
    }
  }

  onUnmounted(() => {
    stopListening()
  })

  return {
    isListening,
    interimText,
    isSupported,
    speakerName,
    toggleListening,
    startListening,
    stopListening,
  }
}
