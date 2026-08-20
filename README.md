# Writeboard

Writeboard is a voice-first collaborative document editor.

You can create a room, share the URL, and write together in real time. It works without accounts, similar to tools like Excalidraw.

**Live app:** https://coldbrew.brianle.dev

## What It Does

- Multiple people can edit the same document at the same time.
- Each user can see where other people are typing.
- Users can create many pages and organize them into folders.
- Users can click the microphone and dictate text into the editor.
- Rooms are shareable by URL.
- Documents are saved locally and sync again after reconnecting.
- No signup or login is required.

## Why This Project Is Interesting

This project is useful for a CV because it is more than a normal frontend app. It shows real full-stack engineering problems:

- Real-time collaboration
- Conflict-free shared editing with CRDTs
- A custom WebSocket sync server
- Offline/local persistence
- Collaborative file-tree data modeling
- Voice dictation
- Server persistence and migration safety
- Performance and scaling tradeoffs

## Tech Stack

| Part | Technology |
| --- | --- |
| Frontend | Vue 3 + TypeScript |
| Build tool | Vite |
| Editor | Tiptap / ProseMirror |
| Collaboration | Yjs CRDT + y-websocket |
| Sync server | Node.js + ws |
| Persistence | IndexedDB in browser, LevelDB on server |
| Voice | Web Speech API |
| Styling | Tailwind CSS v4 |
| Tests | Vitest |
| Lint / format | OXLint + Prettier |

## How To Run Locally

Install dependencies:

```bash
pnpm install
```

Start the frontend:

```bash
pnpm dev
```

Open:

```text
http://localhost:5173
```

To run the sync server locally:

```bash
cd server
npm install
PORT=4444 node main.mjs
```

Then use this frontend environment variable:

```bash
VITE_SIGNALING_SERVERS=ws://localhost:4444
```

## How It Works

At a high level, Writeboard has three main parts:

1. The Vue app renders the editor, sidebar, pages, folders, voice button, and participants.
2. Yjs stores shared document state and makes concurrent edits merge safely.
3. The Node.js WebSocket server syncs Yjs updates between users in the same room.

```text
Browser A -- WebSocket --+
                         +-- Sync Server -- Yjs room state
Browser B -- WebSocket --+
```

The editor uses Tiptap, which is built on ProseMirror. Tiptap is connected to a Yjs document, so edits from one user are sent to other users through the sync server.

## Important Design Choices

### 1. Yjs For Collaboration

Real-time editing is hard because two users can edit the same document at the same time. Writeboard uses Yjs, a CRDT library, so edits can merge without writing a custom conflict-resolution system.

Tradeoff: Yjs requires careful data modeling, but it is safer than building collaboration logic from scratch.

### 2. Flat File Tree

The page/folder tree is stored as:

- one `Y.Map` for all nodes
- one `Y.Array` for root children
- one `Y.Array` per folder for child order

This is easier to move safely in Yjs than deeply nested shared objects.

Tradeoff: the structure is less natural than a normal nested tree, but it is safer for collaborative moves and edits.

### 3. One Room Per Page

Large notebooks should not load every page's content at once. Writeboard keeps the file tree in one room and opens page content in separate page rooms only when needed.

```text
writeboard-<roomId>                 file tree and room presence
writeboard-<roomId>--page--<pageId> page content
```

Tradeoff: this creates more WebSocket connections, but it keeps memory and initial sync smaller for large documents.

### 4. Custom Sync Server

The server is intentionally small and explicit. It handles:

- WebSocket connections
- Yjs sync messages
- awareness/presence updates
- LevelDB persistence
- warm-room LRU eviction
- update coalescing
- backpressure for slow clients
- graceful shutdown
- migration from old document structure to per-page documents

Tradeoff: this is more work than using a managed service, but it makes the collaboration architecture easier to understand and explain.

## Project Structure

```text
src/
  app/                  app entry, root component, config, global CSS
  shared/               shared UI, icons, and shared types
  features/
    rooms/              home page and room page screens
    editor/             editor UI, voice, practice, and text-to-speech logic
    file-tree/          sidebar tree UI and collaborative tree state
    collaboration/      Yjs room connection and collaboration cursor
    documents/          local persistence and lazy page-document loading

apps/
  backend/              AdonisJS TypeScript API backend
    app/
      controllers/      HTTP controllers
      models/           Lucid models
      services/         Yjs, rooms, and metrics services
      validators/       request validators
    config/             Adonis and Yjs runtime config
    database/           migrations and schema
    tests/              unit and functional backend tests

server/                 legacy Node sync server during backend migration
```

## Useful Commands

```bash
pnpm dev            # start frontend dev server
pnpm build          # build production frontend
pnpm test           # run tests in watch mode
pnpm test:run       # run tests once
pnpm lint           # lint source files
pnpm format         # format source files
pnpm type-check     # run TypeScript checks
npm run backend:dev       # start Adonis backend
npm run backend:test      # run backend tests
npm run backend:lint      # lint backend
npm run backend:typecheck # type-check backend
npm run backend:build     # build backend
```

## Deployment

The frontend is deployed with GitHub Pages.

The sync server runs on a VPS behind Caddy.

```bash
bash server/deploy.sh
```

Production sync endpoint:

```text
wss://coldbrew-api.brianle.dev
```

Health check:

```bash
curl https://coldbrew-api.brianle.dev/health
```

Example response:

```json
{"status":"ok","version":"3.0.0","rooms":0}
```

## Environment Variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_SIGNALING_SERVERS` | `wss://coldbrew-api.brianle.dev` | WebSocket sync server URL |
| `VITE_APP_NAME` | `Writeboard` | App name in the UI |
| `VITE_MAX_RECENT_ROOMS` | `20` | Max number of recent rooms saved |
| `VITE_DOC_SAVE_DEBOUNCE_MS` | `500` | Delay before saving local document changes |

## Browser Support

| Feature | Chrome | Edge | Firefox | Safari |
| --- | --- | --- | --- | --- |
| Editor and collaboration | Yes | Yes | Yes | Yes |
| Voice dictation | Yes | Yes | No | No |

## Interview Talking Points

If you use this project in your CV, focus on these points:

- I built a real-time collaborative editor, not just a static frontend.
- I chose Yjs because concurrent editing needs safe conflict resolution.
- I used a flat CRDT file tree because nested shared objects are harder to move safely.
- I split page content into separate page rooms so large notebooks do not load everything at once.
- I built a custom sync server to understand and control persistence, backpressure, and migration.
- I can explain the tradeoffs: more WebSocket connections, more server code, and browser limits for voice dictation.

## Next Improvements

Good next steps for a stronger version:

- Add screenshots or a short demo GIF to this README.
- Add Playwright tests with two users editing the same room.
- Add better reconnect/offline UI.
- Add server metrics for rooms, connections, skipped sends, and persistence errors.
- Add optional private rooms or room passwords.
- Add search across pages without loading every page into the browser.

## License

MIT
