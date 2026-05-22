# Writeboard

A voice-first collaborative document editor. Share a URL, speak, write together — no login required.

**Live:** https://coldbrew.brianle.dev

## Features

- **Real-time collaboration** — Multiple people edit the same document simultaneously via WebSocket
- **Voice dictation** — Click the mic, speak, words appear at your cursor
- **Multi-page notebooks** — Organize pages into nested folders with a file tree
- **Collaboration cursors** — See where others are typing with colored name labels
- **Shareable rooms** — Create a room, share the URL, anyone can join instantly
- **Offline-capable** — Documents persist in localStorage and sync when reconnected
- **No accounts** — No signup, no login. Works like Excalidraw

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Vue 3 + TypeScript |
| Build | Vite |
| Editor | Tiptap (ProseMirror) |
| Collaboration | Yjs (CRDT) + y-websocket |
| Sync Server | Node.js + ws |
| Voice | Web Speech API |
| Styling | Tailwind CSS v4 |
| Linting | OXLint + Prettier |
| Testing | Vitest |

## Getting Started

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│  Browser A   │◄──────────────────►│                  │
│  (Vue + Yjs) │                    │  Sync Server     │
└─────────────┘                    │  (Node.js + ws)  │
                                   │                  │
┌─────────────┐     WebSocket      │  In-memory rooms │
│  Browser B   │◄──────────────────►│  per Y.Doc       │
│  (Vue + Yjs) │                    └──────────────────┘
└─────────────┘
```

**Three layers:**

1. **Editor** — Tiptap with StarterKit, bound to a Yjs `XmlFragment` per page
2. **Collaboration** — `Y.Doc` synced via `y-websocket` to a central Node.js server
3. **Voice** — Web Speech API with a "talking stick" protocol via Yjs awareness

**File tree** uses a CRDT-safe flat structure: `Y.Map` of nodes + per-folder `Y.Array` of child IDs. This avoids Yjs's constraint that nested shared types can't be moved between parents.

## Project Structure

```
src/
├── components/
│   ├── common/          # ErrorBoundary, UserNameModal, Icon
│   ├── editor/          # TiptapEditor, Toolbar, MicButton, ShareButton
│   └── sidebar/         # Sidebar, FileTree, TreeNode, ParticipantsList
├── composables/
│   ├── useCollaboration.ts   # Yjs doc + WebSocket provider + awareness
│   ├── useFileTree.ts        # File/folder tree on Yjs (CRDT-safe)
│   ├── useLocalStorage.ts    # Doc persistence + room tracking
│   └── useVoiceCapture.ts    # Web Speech API + talking stick
├── extensions/
│   └── collaborationCursor.ts
├── config.ts
├── types.ts
└── style.css

server/
├── main.mjs         # WebSocket sync server (Node.js)
├── package.json
└── deploy.sh        # VPS deploy script
```

## Scripts

```bash
pnpm dev            # Start development server
pnpm build          # Production build
pnpm test           # Run tests in watch mode
pnpm test:run       # Run tests once
pnpm lint           # Lint with OXLint
pnpm format         # Format with Prettier
pnpm type-check     # TypeScript type checking
```

## Deployment

### Frontend (GitHub Pages)

Deployed automatically via GitHub Actions on push to `main`.

**Custom domain:** `coldbrew.brianle.dev`

### Sync Server (VPS)

Single-process Node.js server on VPS with Caddy reverse proxy for SSL.

```bash
# Deploy to VPS
bash server/deploy.sh
```

**Endpoint:** `wss://coldbrew-api.brianle.dev`

**Health check:**
```bash
curl https://coldbrew-api.brianle.dev/health
# → {"status":"ok","version":"3.0.0","rooms":0}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SIGNALING_SERVERS` | `wss://coldbrew-api.brianle.dev` | WebSocket sync server URL |
| `VITE_APP_NAME` | `Writeboard` | App name shown in UI |
| `VITE_MAX_RECENT_ROOMS` | `20` | Max rooms in recent list |
| `VITE_DOC_SAVE_DEBOUNCE_MS` | `500` | Debounce delay for localStorage saves |

## Browser Support

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| Editor + Collaboration | Yes | Yes | Yes | Yes |
| Voice Dictation | Yes | Yes | No | No |

## License

MIT
