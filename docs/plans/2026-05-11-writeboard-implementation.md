# Writeboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a voice-first collaborative document editor — share a URL, speak, write together. No backend.

**Architecture:** Single-page Vue app with three layers: Tiptap editor, Yjs collaboration (y-webrtc), Web Speech API voice capture. Room = shared notebook with multiple pages. Talking stick protocol for one-speaker-at-a-time.

**Tech Stack:** Vite + Vue 3, Tiptap, Yjs, y-webrtc, Web Speech API, nanoid

---

### Task 1: Project Scaffolding

**Files:**
- Create: `writeboard/` (Vite project)
- Modify: `writeboard/package.json` (add dependencies)
- Delete: `writeboard/src/components/HelloWorld.vue`, `writeboard/src/assets/vue.svg`

**Step 1: Create Vite + Vue project**

Run:
```bash
cd /Users/baolequoc/workspaces/coldbrew
npm create vite@latest writeboard -- --template vue
```

**Step 2: Install dependencies**

Run:
```bash
cd writeboard
npm install
npm install @tiptap/vue-3 @tiptap/starter-kit @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor @tiptap/extension-placeholder
npm install yjs y-webrtc
npm install nanoid
```

**Step 3: Clean up boilerplate**

- Delete `src/components/HelloWorld.vue`
- Delete `src/assets/vue.svg`
- Clear `src/style.css` (keep file, empty it)
- Replace `src/App.vue` with a minimal shell:

```vue
<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup>
</script>
```

Wait — no router needed. We use hash-based routing manually. Replace `src/App.vue` with:

```vue
<template>
  <HomePage v-if="!roomId" />
  <RoomPage v-else :room-id="roomId" />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import HomePage from './components/HomePage.vue'
import RoomPage from './components/RoomPage.vue'

const roomId = ref(null)

function parseHash() {
  const hash = window.location.hash
  const match = hash.match(/room=([a-zA-Z0-9_-]+)/)
  roomId.value = match ? match[1] : null
}

onMounted(() => {
  parseHash()
  window.addEventListener('hashchange', parseHash)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', parseHash)
})
</script>
```

**Step 4: Create placeholder components**

Create `src/components/HomePage.vue`:
```vue
<template>
  <div class="home-page">
    <h1>Writeboard</h1>
    <p>Voice-first collaborative writing</p>
  </div>
</template>

<script setup>
</script>
```

Create `src/components/RoomPage.vue`:
```vue
<template>
  <div class="room-page">
    <p>Room: {{ roomId }}</p>
  </div>
</template>

<script setup>
defineProps({
  roomId: { type: String, required: true }
})
</script>
```

**Step 5: Verify dev server runs**

Run: `npm run dev`
Expected: App loads at localhost, shows "Writeboard" heading. Navigate to `/#room=test` and see "Room: test".

**Step 6: Commit**

```bash
git add writeboard/
git commit -m "feat: scaffold Vite + Vue project with hash-based routing"
```

---

### Task 2: Tiptap Editor (Single-User)

**Files:**
- Create: `src/components/TiptapEditor.vue`
- Create: `src/components/Toolbar.vue`
- Modify: `src/components/RoomPage.vue`

**Step 1: Create the Tiptap editor component**

Create `src/components/TiptapEditor.vue`:
```vue
<template>
  <div class="editor-container">
    <editor-content :editor="editor" class="editor-content" />
  </div>
</template>

<script setup>
import { onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: 'Start typing or tap the mic to dictate...',
    }),
  ],
  autofocus: true,
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

defineExpose({ editor })
</script>
```

**Step 2: Create the formatting toolbar**

Create `src/components/Toolbar.vue`:
```vue
<template>
  <div class="toolbar" v-if="editor">
    <div class="toolbar-group">
      <button
        @click="editor.chain().focus().toggleBold().run()"
        :class="{ active: editor.isActive('bold') }"
        title="Bold (Ctrl+B)"
      >
        B
      </button>
      <button
        @click="editor.chain().focus().toggleItalic().run()"
        :class="{ active: editor.isActive('italic') }"
        title="Italic (Ctrl+I)"
      >
        I
      </button>
    </div>
    <div class="toolbar-separator" />
    <div class="toolbar-group">
      <button
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        :class="{ active: editor.isActive('heading', { level: 2 }) }"
        title="Heading 2"
      >
        H2
      </button>
      <button
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
        :class="{ active: editor.isActive('heading', { level: 3 }) }"
        title="Heading 3"
      >
        H3
      </button>
    </div>
    <div class="toolbar-separator" />
    <div class="toolbar-group">
      <button
        @click="editor.chain().focus().toggleBulletList().run()"
        :class="{ active: editor.isActive('bulletList') }"
        title="Bullet List"
      >
        •
      </button>
      <button
        @click="editor.chain().focus().toggleOrderedList().run()"
        :class="{ active: editor.isActive('orderedList') }"
        title="Numbered List"
      >
        1.
      </button>
    </div>
    <div class="toolbar-right">
      <slot name="right" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  editor: { type: Object, default: null }
})
</script>
```

**Step 3: Wire into RoomPage**

Update `src/components/RoomPage.vue`:
```vue
<template>
  <div class="room-page">
    <div class="editor-area">
      <Toolbar :editor="editorRef?.editor?.value">
        <template #right>
          <!-- mic + share buttons go here later -->
        </template>
      </Toolbar>
      <TiptapEditor ref="editorRef" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TiptapEditor from './TiptapEditor.vue'
import Toolbar from './Toolbar.vue'

defineProps({
  roomId: { type: String, required: true }
})

const editorRef = ref(null)
</script>
```

**Step 4: Verify**

Run: `npm run dev`, navigate to `/#room=test`
Expected: Editor renders with placeholder text. Toolbar buttons toggle formatting. Ctrl+B/I work.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Tiptap editor with formatting toolbar"
```

---

### Task 3: Yjs Collaboration + Room Provider

**Files:**
- Create: `src/composables/useCollaboration.js`
- Modify: `src/components/TiptapEditor.vue` (add Collaboration extensions)
- Modify: `src/components/RoomPage.vue` (pass provider/ydoc)

**Step 1: Create the collaboration composable**

Create `src/composables/useCollaboration.js`:
```js
import { ref, onUnmounted } from 'vue'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { nanoid } from 'nanoid'

const USER_COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#00bcd4', '#009688',
  '#4caf50', '#ff9800', '#ff5722', '#795548',
]

function randomColor() {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
}

function getOrCreateUserName() {
  let name = localStorage.getItem('writeboard-username')
  if (!name) {
    name = 'User-' + nanoid(4)
    localStorage.setItem('writeboard-username', name)
  }
  return name
}

export function useCollaboration(roomId) {
  const ydoc = new Y.Doc()
  const provider = new WebrtcProvider(`writeboard-${roomId}`, ydoc, {
    signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com'],
  })

  const userName = getOrCreateUserName()
  const userColor = randomColor()
  const peerCount = ref(1)
  const connectionStatus = ref('connecting')

  provider.awareness.setLocalStateField('user', {
    name: userName,
    color: userColor,
  })

  provider.awareness.on('change', () => {
    peerCount.value = provider.awareness.getStates().size
  })

  provider.on('status', ({ status }) => {
    connectionStatus.value = status
  })

  // localStorage persistence: save Y.Doc on changes
  const docKey = `writeboard-doc-${roomId}`
  const stored = localStorage.getItem(docKey)
  if (stored) {
    Y.applyUpdate(ydoc, Uint8Array.from(atob(stored), c => c.charCodeAt(0)))
  }

  ydoc.on('update', () => {
    try {
      const state = Y.encodeStateAsUpdate(ydoc)
      const encoded = btoa(String.fromCharCode(...state))
      localStorage.setItem(docKey, encoded)
    } catch (e) {
      console.warn('Failed to save to localStorage:', e)
    }
  })

  // Track room in recent rooms list
  const roomsKey = 'writeboard-rooms'
  const rooms = JSON.parse(localStorage.getItem(roomsKey) || '[]')
  const existing = rooms.findIndex(r => r.id === roomId)
  if (existing >= 0) rooms.splice(existing, 1)
  rooms.unshift({ id: roomId, lastVisited: Date.now() })
  if (rooms.length > 20) rooms.length = 20
  localStorage.setItem(roomsKey, JSON.stringify(rooms))

  onUnmounted(() => {
    provider.destroy()
    ydoc.destroy()
  })

  return {
    ydoc,
    provider,
    userName,
    userColor,
    peerCount,
    connectionStatus,
  }
}
```

**Step 2: Update TiptapEditor to accept collaboration props**

Modify `src/components/TiptapEditor.vue` to accept `ydoc`, `provider`, `fragment` props and conditionally add Collaboration + CollaborationCursor extensions:

```vue
<template>
  <div class="editor-container">
    <editor-content :editor="editor" class="editor-content" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'

const props = defineProps({
  ydoc: { type: Object, default: null },
  provider: { type: Object, default: null },
  fragment: { type: Object, default: null },
})

const extensions = [
  StarterKit.configure({
    history: props.ydoc ? false : undefined,
  }),
  Placeholder.configure({
    placeholder: 'Start typing or tap the mic to dictate...',
  }),
]

if (props.ydoc && props.provider && props.fragment) {
  extensions.push(
    Collaboration.configure({ fragment: props.fragment }),
    CollaborationCursor.configure({
      provider: props.provider,
    }),
  )
}

const editor = useEditor({
  extensions,
  autofocus: true,
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

defineExpose({ editor })
</script>
```

**Step 3: Update RoomPage to use collaboration**

Update `src/components/RoomPage.vue`:
```vue
<template>
  <div class="room-page">
    <div class="editor-area">
      <Toolbar :editor="editorRef?.editor?.value">
        <template #right>
          <!-- mic + share buttons go here later -->
        </template>
      </Toolbar>
      <TiptapEditor
        ref="editorRef"
        :ydoc="ydoc"
        :provider="provider"
        :fragment="currentFragment"
      />
      <div class="status-bar">
        <span class="connection-status">{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import TiptapEditor from './TiptapEditor.vue'
import Toolbar from './Toolbar.vue'
import { useCollaboration } from '../composables/useCollaboration.js'

const props = defineProps({
  roomId: { type: String, required: true }
})

const editorRef = ref(null)
const { ydoc, provider, peerCount, connectionStatus } = useCollaboration(props.roomId)

// For now, single-page mode: use default XML fragment
const currentFragment = ydoc.getXmlFragment('default')

const statusText = computed(() => {
  if (connectionStatus.value === 'connected') {
    return `Connected · ${peerCount.value} in room`
  }
  if (connectionStatus.value === 'connecting') return 'Connecting...'
  return 'Offline'
})
</script>
```

**Step 4: Verify collaboration**

Run: `npm run dev`
Open `/#room=test` in two browser tabs. Type in one — text should appear in the other. Cursors should be visible with colors.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Yjs collaboration with y-webrtc and localStorage persistence"
```

---

### Task 4: Multi-Page Support

**Files:**
- Create: `src/composables/usePages.js`
- Create: `src/components/Sidebar.vue`
- Create: `src/components/PageList.vue`
- Modify: `src/components/RoomPage.vue` (add sidebar + page switching)
- Modify: `src/components/TiptapEditor.vue` (handle fragment switching)

**Step 1: Create the pages composable**

Create `src/composables/usePages.js`:
```js
import { ref, computed } from 'vue'
import { nanoid } from 'nanoid'

export function usePages(ydoc, provider) {
  const pagesMap = ydoc.getMap('pages')
  const pageOrder = ydoc.getArray('pageOrder')
  const activePageId = ref(null)

  // Reactive page list
  const pages = ref([])

  function syncPages() {
    const order = pageOrder.toArray()
    pages.value = order.map(id => {
      const meta = pagesMap.get(id)
      return { id, title: meta?.title || 'Untitled' }
    })
  }

  pagesMap.observe(syncPages)
  pageOrder.observe(syncPages)

  function createPage(title = 'Untitled') {
    const id = nanoid(8)
    ydoc.getXmlFragment(`page-${id}`)
    pagesMap.set(id, { title })
    pageOrder.push([id])
    activePageId.value = id
    broadcastActivePage(id)
    return id
  }

  function setActivePage(id) {
    activePageId.value = id
    broadcastActivePage(id)
  }

  function renamePage(id, newTitle) {
    const meta = pagesMap.get(id)
    if (meta) {
      pagesMap.set(id, { ...meta, title: newTitle })
    }
  }

  function deletePage(id) {
    if (pages.value.length <= 1) return
    const idx = pageOrder.toArray().indexOf(id)
    if (idx >= 0) pageOrder.delete(idx, 1)
    pagesMap.delete(id)
    if (activePageId.value === id) {
      activePageId.value = pages.value[0]?.id || null
      broadcastActivePage(activePageId.value)
    }
  }

  function getFragment(id) {
    return ydoc.getXmlFragment(`page-${id}`)
  }

  function broadcastActivePage(id) {
    provider.awareness.setLocalStateField('activePage', id)
  }

  // Initialize: if no pages exist, create one
  syncPages()
  if (pages.value.length === 0) {
    createPage('Untitled')
  } else {
    activePageId.value = pages.value[0].id
    broadcastActivePage(activePageId.value)
  }

  return {
    pages,
    activePageId,
    createPage,
    setActivePage,
    renamePage,
    deletePage,
    getFragment,
  }
}
```

**Step 2: Create PageList component**

Create `src/components/PageList.vue`:
```vue
<template>
  <ul class="page-list">
    <li
      v-for="page in pages"
      :key="page.id"
      :class="{ active: page.id === activePageId }"
      @click="$emit('select', page.id)"
    >
      <span class="page-title">{{ page.title }}</span>
    </li>
  </ul>
</template>

<script setup>
defineProps({
  pages: { type: Array, required: true },
  activePageId: { type: String, default: null },
})
defineEmits(['select'])
</script>
```

**Step 3: Create Sidebar component**

Create `src/components/Sidebar.vue`:
```vue
<template>
  <aside class="sidebar" :class="{ open: isOpen }">
    <div class="sidebar-header">
      <h2 class="sidebar-title">Pages</h2>
      <button class="add-page-btn" @click="$emit('create-page')" title="Add page">+</button>
    </div>
    <PageList
      :pages="pages"
      :active-page-id="activePageId"
      @select="$emit('select-page', $event)"
    />
    <div class="sidebar-footer">
      <div class="participants">
        <span class="participant-count">{{ peerCount }} in room</span>
      </div>
    </div>
  </aside>
</template>

<script setup>
import PageList from './PageList.vue'

defineProps({
  isOpen: { type: Boolean, default: true },
  pages: { type: Array, required: true },
  activePageId: { type: String, default: null },
  peerCount: { type: Number, default: 1 },
})
defineEmits(['create-page', 'select-page'])
</script>
```

**Step 4: Update RoomPage with sidebar and page switching**

Rewrite `src/components/RoomPage.vue` to integrate sidebar, page switching, and editor re-binding:

```vue
<template>
  <div class="room-page">
    <Sidebar
      :is-open="sidebarOpen"
      :pages="pages"
      :active-page-id="activePageId"
      :peer-count="peerCount"
      @create-page="createPage()"
      @select-page="switchPage"
    />
    <div class="main-area">
      <Toolbar :editor="currentEditor">
        <template #right>
          <button class="toolbar-btn sidebar-toggle" @click="sidebarOpen = !sidebarOpen" title="Toggle sidebar">
            ☰
          </button>
        </template>
      </Toolbar>
      <TiptapEditor
        v-if="activePageId"
        :key="activePageId"
        ref="editorRef"
        :ydoc="ydoc"
        :provider="provider"
        :fragment="currentFragment"
      />
      <div class="status-bar">
        <span class="connection-status">{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import TiptapEditor from './TiptapEditor.vue'
import Toolbar from './Toolbar.vue'
import Sidebar from './Sidebar.vue'
import { useCollaboration } from '../composables/useCollaboration.js'
import { usePages } from '../composables/usePages.js'

const props = defineProps({
  roomId: { type: String, required: true }
})

const sidebarOpen = ref(window.innerWidth >= 768)
const editorRef = ref(null)

const { ydoc, provider, peerCount, connectionStatus } = useCollaboration(props.roomId)
const { pages, activePageId, createPage, setActivePage, getFragment } = usePages(ydoc, provider)

const currentFragment = computed(() => {
  if (!activePageId.value) return null
  return getFragment(activePageId.value)
})

const currentEditor = computed(() => editorRef.value?.editor?.value)

function switchPage(id) {
  setActivePage(id)
}

const statusText = computed(() => {
  if (connectionStatus.value === 'connected') {
    return `Connected · ${peerCount.value} in room`
  }
  if (connectionStatus.value === 'connecting') return 'Connecting...'
  return 'Offline'
})
</script>
```

**Step 5: Verify**

Run: `npm run dev`, go to `/#room=test`
Expected: Sidebar shows with one "Untitled" page. Click "+" creates a new page. Clicking pages switches the editor content. Two browser tabs in the same room see the same page list.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add multi-page support with sidebar and page switching"
```

---

### Task 5: Voice Capture + Talking Stick

**Files:**
- Create: `src/composables/useVoiceCapture.js`
- Create: `src/components/MicButton.vue`
- Create: `src/components/InterimBanner.vue`
- Modify: `src/components/RoomPage.vue` (wire mic into toolbar)

**Step 1: Create the voice capture composable**

Create `src/composables/useVoiceCapture.js`:
```js
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
            editor.commands.insertContent(transcript + ' ')
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
          recognition.start()
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

  // Talking stick: check awareness for other speakers
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

  // Watch for awareness changes to update speaker name
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
      try { recognition.stop() } catch (e) {}
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
```

**Step 2: Create MicButton component**

Create `src/components/MicButton.vue`:
```vue
<template>
  <button
    v-if="isSupported"
    class="mic-btn"
    :class="{
      listening: isListening,
      unavailable: !!speakerName && !isListening
    }"
    :disabled="!!speakerName && !isListening"
    :title="buttonTitle"
    @click="$emit('toggle')"
  >
    <span class="mic-icon">🎤</span>
    <span v-if="isListening" class="mic-label">Listening...</span>
    <span v-else-if="speakerName" class="mic-label">{{ speakerName }} is speaking</span>
  </button>
  <span v-else class="mic-unsupported">Voice not supported</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  isListening: { type: Boolean, default: false },
  isSupported: { type: Boolean, default: false },
  speakerName: { type: String, default: null },
})
defineEmits(['toggle'])

const buttonTitle = computed(() => {
  if (props.isListening) return 'Stop dictation'
  if (props.speakerName) return `${props.speakerName} is speaking`
  return 'Start dictation'
})
</script>
```

**Step 3: Create InterimBanner component**

Create `src/components/InterimBanner.vue`:
```vue
<template>
  <div v-if="text" class="interim-banner">
    <span class="interim-label">Hearing:</span> {{ text }}
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: '' },
})
</script>
```

**Step 4: Wire everything into RoomPage**

Update `src/components/RoomPage.vue` to add voice composable, MicButton in toolbar slot, and InterimBanner:

Add imports:
```js
import MicButton from './MicButton.vue'
import InterimBanner from './InterimBanner.vue'
import { useVoiceCapture } from '../composables/useVoiceCapture.js'
```

Add voice setup in `<script setup>`:
```js
const { isListening, interimText, isSupported, speakerName, toggleListening } = useVoiceCapture(
  provider,
  () => editorRef.value?.editor?.value
)
```

Add to toolbar's right slot:
```vue
<MicButton
  :is-listening="isListening"
  :is-supported="isSupported"
  :speaker-name="speakerName"
  @toggle="toggleListening"
/>
```

Add InterimBanner below Toolbar:
```vue
<InterimBanner :text="interimText" />
```

**Step 5: Verify**

Run: `npm run dev`, go to `/#room=test`
Expected: Mic button visible. Click it — browser asks for mic permission. Speak — words appear in editor. Open second tab — second tab's mic shows disabled while first is speaking.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add voice dictation with talking stick protocol"
```

---

### Task 6: Home Page

**Files:**
- Modify: `src/components/HomePage.vue`

**Step 1: Build the home page**

Update `src/components/HomePage.vue`:

```vue
<template>
  <div class="home-page">
    <div class="home-content">
      <h1 class="home-title">Writeboard</h1>
      <p class="home-subtitle">Voice-first collaborative writing. No signup required.</p>
      <button class="create-room-btn" @click="createRoom">
        Create new room
      </button>
      <div v-if="recentRooms.length" class="recent-rooms">
        <h3>Recent rooms</h3>
        <ul>
          <li v-for="room in recentRooms" :key="room.id">
            <a :href="`#room=${room.id}`" class="room-link">
              {{ room.id }}
              <span class="room-date">{{ formatDate(room.lastVisited) }}</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { nanoid } from 'nanoid'

const recentRooms = ref(JSON.parse(localStorage.getItem('writeboard-rooms') || '[]'))

function createRoom() {
  const id = nanoid(6)
  window.location.hash = `room=${id}`
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString()
}
</script>
```

**Step 2: Verify**

Run: `npm run dev`
Expected: Home page shows with "Create new room" button. Clicking creates a room and navigates. After visiting rooms, they appear in the recent list.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add home page with room creation and recent rooms"
```

---

### Task 7: Share Button

**Files:**
- Create: `src/components/ShareButton.vue`
- Modify: `src/components/RoomPage.vue` (add to toolbar)

**Step 1: Create ShareButton**

Create `src/components/ShareButton.vue`:
```vue
<template>
  <button class="share-btn" @click="copyLink" :title="copied ? 'Copied!' : 'Copy room link'">
    {{ copied ? '✓ Copied' : '🔗 Share' }}
  </button>
</template>

<script setup>
import { ref } from 'vue'

const copied = ref(false)

async function copyLink() {
  await navigator.clipboard.writeText(window.location.href)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>
```

**Step 2: Add to RoomPage toolbar**

Add `ShareButton` import and place it in the toolbar right slot, next to MicButton.

**Step 3: Verify & Commit**

```bash
git add -A
git commit -m "feat: add share button to copy room link"
```

---

### Task 8: Styling & Polish

**Files:**
- Create: `src/assets/styles.css`
- Modify: `src/main.js` (import styles)
- Modify all components (add scoped styles or class references)

**Step 1: Create global stylesheet**

Create `src/assets/styles.css` with:
- CSS reset / base styles
- Google Fonts import (Lora for body, system sans-serif for UI)
- Layout: sidebar (240px fixed) + main area (flexible)
- Editor: max-width 720px, centered, generous padding, serif font
- Toolbar: slim top bar, light border-bottom, button hover/active states
- Mic button: coral accent when listening, pulse animation
- Sidebar: light gray background, page list hover states
- Status bar: small text, bottom-right
- Interim banner: subtle background, fixed below toolbar
- Mobile responsive: sidebar as drawer overlay under 768px
- Placeholder text styling (light gray italic)
- Collaboration cursor styling (colored name tags)

**Step 2: Add scoped styles to each component**

Add component-specific CSS to each `.vue` file's `<style scoped>` block.

**Step 3: Verify**

Run: `npm run dev`
Expected: App looks like a clean document editor. Serif body font, light toolbar, collapsible sidebar. Mic button pulses when active. Mobile layout works.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add styling and responsive layout"
```

---

### Task 9: Error Handling & Edge Cases

**Files:**
- Create: `src/components/ErrorBoundary.vue`
- Modify: `src/App.vue` (wrap in error boundary)
- Modify: `src/components/RoomPage.vue` (connection status improvements)

**Step 1: Create error boundary**

Create `src/components/ErrorBoundary.vue`:
```vue
<template>
  <slot v-if="!error" />
  <div v-else class="error-boundary">
    <h2>Something went wrong</h2>
    <p>Try refreshing the page.</p>
    <button @click="reset">Reload</button>
  </div>
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue'

const error = ref(null)

onErrorCaptured((err) => {
  error.value = err
  return false
})

function reset() {
  window.location.reload()
}
</script>
```

**Step 2: Wrap App in error boundary**

Update `src/App.vue` to wrap content in `<ErrorBoundary>`.

**Step 3: Handle edge cases**

- In `useVoiceCapture.js`: handle `not-allowed` error with a user-facing message
- In `useCollaboration.js`: handle localStorage quota exceeded gracefully
- In `RoomPage.vue`: show appropriate connection state in status bar

**Step 4: Verify & Commit**

```bash
git add -A
git commit -m "feat: add error boundary and edge case handling"
```

---

### Task 10: Final Verification & Build

**Step 1: Run production build**

```bash
npm run build
```

Expected: Clean build, no errors, output in `dist/`.

**Step 2: Preview production build**

```bash
npm run preview
```

Test: Open in two tabs, verify collaboration, voice, page switching all work.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: verify production build"
```

---

## Execution Notes

- Tasks 1–3 are sequential (each builds on the previous)
- Tasks 4–5 can be done in parallel after Task 3
- Tasks 6–7 are independent of 4–5
- Task 8 should be done after all features are in
- Tasks 9–10 are final polish

Total: 10 tasks, ~7 commits, roughly matching the original phased plan.
