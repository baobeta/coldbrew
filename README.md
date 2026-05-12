# Writeboard

A voice-first collaborative document editor. Share a URL, speak, write together — no login required.

## Features

- **Real-time collaboration** — Multiple people edit the same document simultaneously via WebRTC (peer-to-peer, no server needed)
- **Voice dictation** — Click the mic, speak, words appear at your cursor. Talking stick protocol ensures one speaker at a time
- **Multi-page notebooks** — Organize pages into nested folders with a VS Code-like file tree
- **Collaboration cursors** — See where other people are typing with colored name labels
- **Shareable rooms** — Create a room, share the URL, anyone can join instantly
- **Offline-capable** — Documents persist in localStorage and sync when peers reconnect
- **No accounts** — No signup, no login, no backend. Works like Excalidraw

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Vue 3 + TypeScript |
| Build | Vite |
| Editor | Tiptap (ProseMirror) |
| Collaboration | Yjs (CRDT) + y-webrtc |
| Voice | Web Speech API |
| Styling | Tailwind CSS v4 |
| Linting | OXLint + Prettier |
| Testing | Vitest |

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Open in browser
open http://localhost:5173
```

## Usage

1. Open the app — enter your name on first visit
2. Click **"Create new room"** or navigate to `/#room=<code>`
3. Share the URL with others — they join the same room instantly
4. Use the **mic button** to dictate (Chrome/Edge only)
5. Create pages and folders in the sidebar
6. Right-click items in the file tree to rename or delete

## Scripts

```bash
pnpm dev            # Start development server
pnpm build          # Production build
pnpm preview        # Preview production build
pnpm test           # Run tests in watch mode
pnpm test:run       # Run tests once
pnpm lint           # Lint with OXLint
pnpm lint:fix       # Auto-fix lint issues
pnpm format         # Format with Prettier
pnpm format:check   # Check formatting
pnpm type-check     # TypeScript type checking
```

## Project Structure

```
src/
├── components/
│   ├── common/          # ErrorBoundary, UserNameModal, Icon
│   ├── editor/          # TiptapEditor, Toolbar, MicButton, ShareButton
│   └── sidebar/         # Sidebar, FileTree, TreeNode, ParticipantsList
├── composables/
│   ├── useCollaboration.ts   # Yjs doc + WebRTC provider + awareness
│   ├── useFileTree.ts        # File/folder tree on Yjs (CRDT-safe)
│   ├── useLocalStorage.ts    # Doc persistence + room tracking
│   └── useVoiceCapture.ts    # Web Speech API + talking stick
├── extensions/
│   └── collaborationCursor.ts  # Custom Tiptap cursor extension
├── assets/
│   └── icons.ts         # SVG icon registry
├── config.ts            # Environment config
├── types.ts             # Shared TypeScript interfaces
└── style.css            # Tailwind theme + Tiptap styles
```

## Architecture

**Three layers:**

1. **Editor** — Tiptap with StarterKit, bound to a Yjs `XmlFragment` per page
2. **Collaboration** — `Y.Doc` synced via `y-webrtc` (BroadcastChannel for same-browser, WebSocket signaling for cross-device)
3. **Voice** — Web Speech API with a "talking stick" protocol enforced through Yjs awareness state

**File tree data structure** uses the CRDT-safe "Approach C": flat `Y.Map` of nodes + per-folder `Y.Array` of child IDs. This avoids Yjs's constraint that nested shared types cannot be moved between parents.

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SIGNALING_SERVERS` | `wss://signaling.yjs.dev` | WebRTC signaling server URLs (comma-separated) |
| `VITE_APP_NAME` | `Writeboard` | App name shown in UI |
| `VITE_MAX_RECENT_ROOMS` | `20` | Max rooms in recent list |
| `VITE_DOC_SAVE_DEBOUNCE_MS` | `500` | Debounce delay for localStorage saves |

## Browser Support

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| Editor + Collaboration | Yes | Yes | Yes | Yes |
| Voice Dictation | Yes | Yes | No | No |
| WebRTC (cross-device) | Yes | Yes | Yes | Yes |

Voice dictation requires Chrome or Edge (Web Speech API). The app works in all modern browsers for editing and collaboration.

## License

MIT
