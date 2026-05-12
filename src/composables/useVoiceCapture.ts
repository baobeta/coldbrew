import { ref, onUnmounted } from 'vue'

export function useVoiceCapture(provider: any, getEditor: () => any) {
  const isListening = ref<boolean>(false)
  const interimText = ref<string>('')
  const isSupported = ref<boolean>(false)
  const speakerName = ref<string | null>(null)

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  isSupported.value = !!SpeechRecognition

  let recognition: any = null
  let restartCount = 0
  const MAX_RESTARTS = 3

  if (SpeechRecognition) {
    recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.addEventListener('result', (event: any) => {
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
    })

    recognition.addEventListener('end', () => {
      if (isListening.value) {
        if (restartCount < MAX_RESTARTS) {
          restartCount++
          try {
            recognition.start()
          } catch {}
        } else {
          stopListening()
        }
      }
    })

    recognition.addEventListener('error', (event: any) => {
      if (event.error === 'not-allowed') {
        stopListening()
      }
    })
  }

  function isSomeoneElseSpeaking(): boolean {
    const states: Map<number, any> = provider.awareness.getStates()
    const myId: number = provider.awareness.clientID
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
      const states: Map<number, any> = provider.awareness.getStates()
      const myId: number = provider.awareness.clientID
      let foundSpeaker: string | null = null
      for (const [clientId, state] of states) {
        if (clientId !== myId && state.speaking) {
          foundSpeaker = state.user?.name || 'Someone'
          break
        }
      }
      speakerName.value = foundSpeaker
    }
  })

  function startListening(): void {
    if (!recognition) return
    if (isSomeoneElseSpeaking()) return

    isListening.value = true
    restartCount = 0
    provider.awareness.setLocalStateField('speaking', true)
    try {
      recognition.start()
    } catch (e) {
      console.log('[DEBUG] startListening error', e)
      stopListening()
    }
  }

  function stopListening(): void {
    isListening.value = false
    interimText.value = ''
    provider.awareness.setLocalStateField('speaking', false)
    if (recognition) {
      try {
        recognition.stop()
      } catch (e) {
        console.log('DEBUG stopListening error', e)
      }
    }
  }

  function toggleListening(): void {
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
