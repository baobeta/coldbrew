# Backup Export and Import Design

**Status:** Approved design
**Date:** 2026-11-01

## Goal

Let people save a room, folder or page to a file, and restore that file later, in the same room or another one.

## Rules

- **Import only adds.** Applying old Yjs state to a live page merges instead of rolling back, so a restore always creates new pages in a `Restored <date>` folder. Existing pages are never touched.
- **All or nothing.** If any page fails, export downloads nothing, and import adds nothing to the file tree.
- **No partial backups.** Export and import both need a server connection.
- **A backup file is untrusted input.** It's fully validated before anything is written.

## Approach

Manual and browser-only, with no server changes. Automatic server backups are not part of this version.

## File format

One JSON file, `*.coldbrew.json`, with `format`, `version`, `exportedAt`, `checksum` and a nested `nodes` tree. A room, folder and page all use this format.

- No live room IDs are stored, so a restore must create new ones.
- Text is Tiptap JSON. Strokes keep their packed `pts` bytes, as base64.
- The SHA-256 checksum catches a damaged file. It isn't tamper protection, so validation is what keeps a bad file safe.
- Backup files hold content in plain form, so anyone with the file can read it.

## Validation

- Limits: 50 MB, 2,000 pages, nesting depth 32.
- Unknown fields, node kinds and tools are rejected.
- Text must pass the editor schema. Links must be relative or use `http`, `https`, `mailto` or `tel`.
- Stroke bytes must decode.
- Export runs this same validation before downloading, so a file that can't be restored is never saved.

## Export

1. List the pages in the chosen part of the tree.
2. Open each in a temporary document, three at a time, bypassing the `usePageDocs` cache so the open page isn't evicted.
3. Wait for IndexedDB and the server, for up to 15 seconds per page.
4. If any page fails, stop and name the failed pages.
5. Validate the file, then download it.

A stroke that can't be decoded is skipped with a console warning, matching how the renderer treats it.

## Import

1. Validate the whole file.
2. Ask for confirmation.
3. Write each page into a new page document.
4. Read each page back over a separate connection to confirm the server has it. y-websocket has no save acknowledgement.
5. Add the folder and pages to the file tree in one transaction, last of all.

A failed import leaves unlinked page documents on the server. Nobody can see them and they do no harm.

## Interface

- Sidebar: Export room and Import buttons.
- Right-click menu: Export on any page or folder.
- A status bar shows progress with Cancel, and errors with Dismiss.
