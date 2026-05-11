# Writeboard Refactoring Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the Writeboard codebase for scalability, maintainability, and production-readiness.

**Architecture:** Convert to TypeScript, reorganize files into feature modules, split the 814-line monolith CSS into scoped styles, add Vitest testing, centralize configuration, and remove dead code.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, Tiptap, Yjs

---

## Current State Assessment

**What's good:**
- Clean composable separation (collaboration, file tree, voice capture)
- Yjs data structure is well-designed (Approach C — flat nodes + children arrays)
- Components are small and focused
- The editor-ready event pattern is solid

**What needs fixing (priority order):**

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | Dead code: `usePages.js` and `PageList.vue` are unused (replaced by file tree) | P0 | Small |
| 2 | No TypeScript — no type safety on props, composable returns, or Yjs data | P0 | Large |
| 3 | Single 814-line `style.css` — hard to maintain, no scoping | P1 | Medium |
| 4 | All components in flat `components/` — no feature grouping | P1 | Medium |
| 5 | No tests — composables are pure logic, very testable | P1 | Medium |
| 6 | `useCollaboration.js` mixes 4 concerns: Yjs doc, WebRTC, localStorage, room tracking | P1 | Medium |
| 7 | No environment config — signaling server URL is hardcoded | P1 | Small |
| 8 | `btoa/atob` for localStorage persistence — breaks on large docs (call stack overflow on spread) | P1 | Small |
| 9 | No ESLint/Prettier — no consistent code style | P2 | Small |
| 10 | SVG icons inline in templates — verbose, hard to maintain | P2 | Medium |
| 11 | No `@tiptap/extension-collaboration-cursor` in package.json cleanup | P2 | Small |

---

### Task 1: Remove Dead Code

**Files:**
- Delete: `src/composables/usePages.js`
- Delete: `src/components/PageList.vue`
- Modify: `package.json` (remove `@tiptap/extension-collaboration-cursor` — we use custom extension)

**Step 1: Delete unused files**

```bash
rm src/composables/usePages.js src/components/PageList.vue
```

**Step 2: Remove unused npm dependency**

```bash
npm uninstall @tiptap/extension-collaboration-cursor
```

**Step 3: Verify build still passes**

Run: `npm run build`
Expected: Clean build, no errors

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead code (usePages, PageList, unused cursor dep)"
```

---

### Task 2: Add TypeScript Support

**Files:**
- Modify: `package.json` (add typescript, vue-tsc)
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `src/env.d.ts`
- Rename: `src/main.js` → `src/main.ts`
- Modify: `index.html` (update script src)
- Modify: `vite.config.js` → `vite.config.ts`

**Step 1: Install TypeScript tooling**

```bash
npm install -D typescript vue-tsc @tsconfig/node22 @vue/tsconfig
```

**Step 2: Create tsconfig.json**

```json
{
  "references": [{ "path": "./tsconfig.app.json" }],
  "compilerOptions": {
    "module": "NodeNext"
  }
}
```

**Step 3: Create tsconfig.app.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "baseUrl": "."
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue"],
  "exclude": ["node_modules"]
}
```

**Step 4: Create src/env.d.ts**

```ts
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
```

**Step 5: Rename main.js to main.ts and update index.html**

```bash
mv src/main.js src/main.ts
```

In `index.html`, change `src="/src/main.js"` to `src="/src/main.ts"`.

**Step 6: Add type-check script to package.json**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "type-check": "vue-tsc --build"
  }
}
```

**Step 7: Add path alias to vite.config**

Rename `vite.config.js` to `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

**Step 8: Verify build**

Run: `npm run build`
Expected: Build passes (TS files are transpiled by Vite, strict checking is separate)

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: add TypeScript support with path aliases"
```

---

### Task 3: Add Environment Config

**Files:**
- Create: `src/config.ts`
- Create: `.env`
- Create: `.env.example`
- Modify: `src/composables/useCollaboration.js` (import from config)

**Step 1: Create .env and .env.example**

`.env.example`:
```
VITE_SIGNALING_SERVERS=wss://signaling.yjs.dev
VITE_APP_NAME=Writeboard
VITE_MAX_RECENT_ROOMS=20
VITE_DOC_SAVE_DEBOUNCE_MS=500
```

Copy to `.env` with same values.

**Step 2: Create src/config.ts**

```ts
export const config = {
  appName: import.meta.env.VITE_APP_NAME || 'Writeboard',
  signalingServers: (import.meta.env.VITE_SIGNALING_SERVERS || 'wss://signaling.yjs.dev').split(','),
  maxRecentRooms: Number(import.meta.env.VITE_MAX_RECENT_ROOMS) || 20,
  docSaveDebounceMs: Number(import.meta.env.VITE_DOC_SAVE_DEBOUNCE_MS) || 500,
} as const
```

**Step 3: Update useCollaboration to use config**

Replace hardcoded `signaling: ['wss://signaling.yjs.dev']` with `signaling: config.signalingServers`.
Replace hardcoded `20` in room limit with `config.maxRecentRooms`.
Replace hardcoded `500` debounce with `config.docSaveDebounceMs`.

**Step 4: Add .env to .gitignore, commit .env.example**

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: centralize config with env variables"
```

---

### Task 4: Fix localStorage Persistence (btoa overflow)

**Files:**
- Modify: `src/composables/useCollaboration.js` (replace btoa/atob with IndexedDB or safe encoding)

**Step 1: Replace btoa/atob with Uint8Array-safe encoding**

The current code `btoa(String.fromCharCode(...state))` will throw `Maximum call stack size exceeded` when the Yjs doc grows beyond ~100KB because of the spread operator.

Replace the save/load logic with:

```ts
function encodeUpdate(update: Uint8Array): string {
  const chunks: string[] = []
  for (let i = 0; i < update.length; i += 8192) {
    chunks.push(String.fromCharCode(...update.subarray(i, i + 8192)))
  }
  return btoa(chunks.join(''))
}

function decodeUpdate(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
```

Replace the save callback and load logic to use these functions.

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add -A
git commit -m "fix: prevent btoa stack overflow on large docs"
```

---

### Task 5: Reorganize File Structure

**Files:**
- Move files into feature-based directories

Target structure:
```
src/
├── main.ts
├── App.vue
├── config.ts
├── env.d.ts
├── assets/
│   └── styles/
│       ├── base.css          (reset, variables, typography)
│       ├── layout.css        (room-page, sidebar, main-area)
│       ├── editor.css        (tiptap, cursors, placeholder)
│       ├── toolbar.css       (toolbar, mic, share)
│       ├── tree.css          (file tree, context menu)
│       ├── home.css          (home page, modal)
│       └── index.css         (imports all above)
├── components/
│   ├── common/
│   │   ├── ErrorBoundary.vue
│   │   └── UserNameModal.vue
│   ├── editor/
│   │   ├── TiptapEditor.vue
│   │   ├── Toolbar.vue
│   │   ├── MicButton.vue
│   │   ├── ShareButton.vue
│   │   └── InterimBanner.vue
│   ├── sidebar/
│   │   ├── Sidebar.vue
│   │   ├── FileTree.vue
│   │   ├── TreeNode.vue
│   │   └── ParticipantsList.vue
│   ├── HomePage.vue
│   └── RoomPage.vue
├── composables/
│   ├── useCollaboration.ts
│   ├── useFileTree.ts
│   ├── useVoiceCapture.ts
│   └── useLocalStorage.ts   (extracted from useCollaboration)
└── extensions/
    └── collaborationCursor.ts
```

**Step 1: Create directory structure**

```bash
mkdir -p src/components/{common,editor,sidebar}
mkdir -p src/assets/styles
```

**Step 2: Move components to feature directories**

```bash
mv src/components/ErrorBoundary.vue src/components/common/
mv src/components/UserNameModal.vue src/components/common/
mv src/components/TiptapEditor.vue src/components/editor/
mv src/components/Toolbar.vue src/components/editor/
mv src/components/MicButton.vue src/components/editor/
mv src/components/ShareButton.vue src/components/editor/
mv src/components/InterimBanner.vue src/components/editor/
mv src/components/Sidebar.vue src/components/sidebar/
mv src/components/FileTree.vue src/components/sidebar/
mv src/components/TreeNode.vue src/components/sidebar/
mv src/components/ParticipantsList.vue src/components/sidebar/
```

**Step 3: Update all import paths**

Update imports in: `App.vue`, `RoomPage.vue`, `Sidebar.vue`, `FileTree.vue`.
Use `@/` path alias for all imports.

**Step 4: Split style.css into modular files**

Split the 814-line `style.css` into:
- `base.css` — reset, `:root` vars, body, `#app`, typography
- `layout.css` — `.room-page`, `.sidebar`, `.main-area`, `.sidebar-section`, responsive
- `editor.css` — `.editor-container`, `.editor-content`, `.tiptap`, cursors, status bar
- `toolbar.css` — `.toolbar`, `.toolbar-btn`, `.mic-btn`, `.share-btn`, `.interim-banner`
- `tree.css` — `.file-tree`, `.tree-node`, `.tree-context-menu`, `.participants-list`
- `home.css` — `.home-page`, `.modal-overlay`, `.error-boundary`
- `index.css` — `@import` all of the above

Update `main.ts` to import `@/assets/styles/index.css`.

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: reorganize into feature-based directory structure"
```

---

### Task 6: Extract localStorage Composable

**Files:**
- Create: `src/composables/useLocalStorage.ts`
- Modify: `src/composables/useCollaboration.ts` (extract storage logic)

**Step 1: Create useLocalStorage.ts**

Extract three concerns from useCollaboration:
1. **Doc persistence** — save/load Y.Doc to localStorage
2. **Room tracking** — recent rooms list
3. **User preferences** — username storage

```ts
// useLocalStorage.ts
export function useDocPersistence(ydoc: Y.Doc, roomId: string, debounceMs: number) { ... }
export function useRecentRooms(roomId: string, maxRooms: number) { ... }
export function getStoredUserName(): string | null { ... }
export function setStoredUserName(name: string): void { ... }
```

**Step 2: Simplify useCollaboration**

After extraction, useCollaboration only handles: Y.Doc creation, WebRTC provider, awareness (participants/status). ~50 lines instead of 111.

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: extract localStorage logic into useLocalStorage composable"
```

---

### Task 7: Add Vitest + First Tests

**Files:**
- Modify: `package.json` (add vitest)
- Create: `vitest.config.ts`
- Create: `src/composables/__tests__/useFileTree.test.ts`
- Create: `src/composables/__tests__/useLocalStorage.test.ts`

**Step 1: Install Vitest**

```bash
npm install -D vitest @vue/test-utils happy-dom
```

**Step 2: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

**Step 3: Add test script**

```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 4: Write useFileTree tests**

Test the core tree operations against a real Y.Doc (no mocking needed — Yjs works in Node):
- Create a page at root → tree has 1 page
- Create a folder, create page inside folder → tree is nested
- Rename a node → title updates
- Delete a page → tree shrinks
- Delete a folder → all children deleted
- Move a node → parent changes
- Move into own descendant → blocked (cycle detection)

**Step 5: Write useLocalStorage tests**

- getStoredUserName returns null when empty
- setStoredUserName + getStoredUserName roundtrip
- Doc persistence encode/decode roundtrip
- Recent rooms list maintains order and max size

**Step 6: Run tests**

Run: `npm run test:run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add -A
git commit -m "test: add Vitest with useFileTree and useLocalStorage tests"
```

---

### Task 8: Add ESLint + Prettier

**Files:**
- Modify: `package.json`
- Create: `eslint.config.js`
- Create: `.prettierrc`

**Step 1: Install ESLint + Prettier**

```bash
npm install -D eslint @eslint/js eslint-plugin-vue prettier eslint-config-prettier typescript-eslint
```

**Step 2: Create eslint.config.js**

Flat config with Vue + TypeScript rules. Enable `vue/multi-word-component-names: off` (single-word names like `Sidebar` are fine).

**Step 3: Create .prettierrc**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

**Step 4: Add scripts**

```json
"lint": "eslint src/",
"format": "prettier --write src/"
```

**Step 5: Run format on entire codebase**

```bash
npm run format
```

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: add ESLint + Prettier with initial formatting"
```

---

### Task 9: Convert Composables to TypeScript

**Files:**
- Rename + convert: all `.js` files in `src/composables/` and `src/extensions/` to `.ts`
- Create: `src/types.ts` (shared type definitions)

**Step 1: Create src/types.ts**

```ts
export interface TreeNode {
  id: string
  type: 'page' | 'folder'
  title: string
  children?: TreeNode[]
}

export interface Participant {
  clientId: number
  name: string
  color: string
  speaking: boolean
  isLocal: boolean
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'
```

**Step 2: Convert composables one at a time**

For each `.js` file: rename to `.ts`, add type annotations to function signatures and return types, import from `@/types`. Update imports in Vue files.

Order: `useLocalStorage.ts` → `useCollaboration.ts` → `useFileTree.ts` → `useVoiceCapture.ts` → `collaborationCursor.ts`

**Step 3: Run type-check**

Run: `npm run type-check`
Expected: No errors (may need to add `// @ts-expect-error` for some Yjs/Tiptap type gaps initially)

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: convert composables and extensions to TypeScript"
```

---

### Task 10: Add SVG Icon System

**Files:**
- Create: `src/components/common/Icon.vue`
- Create: `src/assets/icons.ts`
- Modify: `TreeNode.vue`, `Sidebar.vue`, `MicButton.vue`, `ParticipantsList.vue`

**Step 1: Create icon registry**

`src/assets/icons.ts` — export an object mapping icon names to SVG path data. This eliminates duplicated inline SVGs across components.

**Step 2: Create Icon.vue**

A single `<Icon name="file" :size="16" />` component that renders the SVG from the registry.

**Step 3: Replace all inline SVGs**

Update TreeNode, Sidebar, MicButton, ParticipantsList to use `<Icon>` instead of inline SVGs.

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: centralize SVG icons into reusable Icon component"
```

---

## Summary

| Task | What | Effort | Impact |
|------|------|--------|--------|
| 1 | Remove dead code | 5 min | Clean |
| 2 | Add TypeScript | 30 min | Foundation |
| 3 | Environment config | 15 min | Config |
| 4 | Fix btoa overflow | 15 min | Bug fix |
| 5 | Reorganize files | 30 min | Structure |
| 6 | Extract localStorage | 20 min | SoC |
| 7 | Add Vitest + tests | 45 min | Safety |
| 8 | ESLint + Prettier | 15 min | Style |
| 9 | Convert to TypeScript | 45 min | Type safety |
| 10 | Icon system | 30 min | Maintainability |

**Total: ~4 hours of focused work**

Tasks 1–4 are quick wins (P0/P1). Tasks 5–6 are the main structural refactor. Tasks 7–10 add long-term quality infrastructure.
