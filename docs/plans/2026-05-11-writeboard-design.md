# Writeboard — Design Document

A voice-first collaborative document editor. No login, no backend — share a URL, speak, write together.

## Core Concept

Multiple people join a room via URL. One person dictates at a time (talking stick model), everyone sees words appear live. The editor captures raw transcript — no auto-formatting of speech. Think voice memo that lands in a shared notebook.

## Stack

| Role | Choice |
|------|--------|
| Build tool | Vite + Vue |
| Editor | Tiptap (StarterKit) |
| Collab engine | Yjs |
| Transport | y-webrtc |
| Voice | Web Speech API |
| Hosting | Vercel or Netlify |

## Architecture

Three layers:

1. **Editor layer** — Tiptap with StarterKit. Extensions: bold, italic, H2, H3, bullet list, numbered list. No images, tables, or code blocks in v1.

2. **Collaboration layer** — Shared `Y.Doc` synced via `y-webrtc`. Room ID from URL hash (`#room=abc123`). Tiptap `Collaboration` extension binds to the Y.Doc. `CollaborationCursor` shows peer cursors.

3. **Voice layer** — Web Speech API wrapped in a Vue composable (`useVoiceCapture`). Final transcripts inserted at cursor via Tiptap commands. Talking stick protocol enforced through Yjs awareness.

**Data flow:** Speech → Web Speech API → transcript string → Tiptap `insertContent()` at cursor → Yjs syncs to all peers → their editors update.

## Page & Room Model

**Room = shared notebook.** A room contains an ordered list of pages. All collaborators see the same page list and can switch freely.

### Data structure in Yjs

- `Y.Map` called `pages` — keyed by page ID (nanoid), each value holds page title + `Y.XmlFragment` (Tiptap content)
- `Y.Array` called `pageOrder` — stores page IDs in display order
- New pages added to both structures; Yjs syncs the page list to all peers automatically

### Active page tracking

Each user's current page is stored in Yjs awareness (per-user ephemeral state). Others can see which page you're on, but aren't forced to follow.

### Tiptap binding

When switching pages, Tiptap rebinds to the selected page's `Y.XmlFragment` via the Collaboration extension.

### localStorage persistence

- Entire `Y.Doc` (all pages) serialized to localStorage keyed by room ID
- Separate `rooms` key stores visited rooms (room ID + last-used title) for the home screen

### Home screen

When no room hash in URL: landing page with "Create new room" button + list of recently visited rooms from localStorage.

## Voice & Talking Stick Protocol

### Voice composable (`useVoiceCapture`)

- Wraps `window.SpeechRecognition` / `window.webkitSpeechRecognition`
- Exposes: `startListening()`, `stopListening()`, `isListening`, `interimText`, `isSupported`
- `recognition.continuous = true`, `recognition.interimResults = true`, `recognition.lang = 'en-US'`
- On final result: `editor.commands.insertContent(transcript + ' ')` at cursor
- Interim results shown in floating banner below toolbar

### Talking stick via Yjs awareness

- Each peer's awareness includes `speaking: boolean`
- Click mic → check if anyone else has `speaking: true`
  - No one speaking → set own `speaking: true`, start recognition
  - Someone speaking → toast: "Someone is already speaking"
- Stop → set `speaking: false`
- Other users' mic buttons show disabled with label: "Alex is speaking"
- Peer cursor gets mic icon while speaking

### Edge cases

- Disconnected speaker: Yjs awareness timeout (~30s) clears their state automatically
- Background tab pauses recognition: on `end` event, auto-restart up to 3 times, then release talking stick

## UI Layout

```
App.vue
├── HomePage.vue
│   ├── CreateRoomButton
│   └── RecentRoomsList
│
└── RoomPage.vue
    ├── Sidebar.vue (collapsible, left)
    │   ├── RoomTitle
    │   ├── PageList (flat list, click to switch)
    │   ├── AddPageButton (+)
    │   └── ParticipantsList (from awareness)
    │
    └── EditorArea.vue
        ├── Toolbar.vue (formatting + mic + share)
        ├── TiptapEditor.vue
        └── InterimBanner.vue
```

### Toolbar (left to right)

Bold, Italic | H2, H3 | Bullet list, Numbered list | (right-aligned) Mic button, Share button

### Mic button states

- **Idle** — Mic icon, neutral. Click to start.
- **Listening** — Pulsing/red, "Listening..." label. Click to stop.
- **Unavailable** — Greyed out, tooltip shows who is speaking.
- **Unsupported** — Hidden, small note in toolbar.

### Sidebar

- Open by default on desktop (≥768px), closed on mobile
- Toggle via hamburger in toolbar
- On mobile: overlays as drawer

### Design tokens

- Clean neutral background (white / light gray)
- Serif body font (Georgia or Lora)
- Sans-serif UI chrome (system font stack)
- Accent color for mic + active states (warm coral or teal)

## Connection States

Status bar at bottom-right (subtle):
- **"Connecting..."** — WebRTC establishing signaling
- **"Connected · 3 in room"** — Peer count from awareness
- **"Offline"** — Editing works locally, syncs on reconnect

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Mic permission denied | Toast message. Mic button stays idle. |
| Speech API unsupported | Mic button hidden. Note in toolbar. |
| WebRTC fails (firewall) | Local editing continues. Status: "Offline — changes saved locally." |
| localStorage full | Warn on save failure. Editor keeps working in-memory. |
| Room has no pages | Auto-create "Untitled" page on room creation. |

## Explicitly NOT in v1

- No accounts or login
- No server-side persistence
- No TURN server fallback
- No end-to-end encryption
- No export (Markdown/PDF)
- No images or embeds
- No page reordering or folders
- No language selector for speech (hardcoded en-US)
