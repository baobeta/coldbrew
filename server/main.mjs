import http from "node:http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import {
  readSyncMessage,
  writeSyncStep1,
  writeSyncStep2,
  writeUpdate,
} from "y-protocols/sync";
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { Awareness } from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { createCoalescer } from "./coalesce.mjs";
import { loadRoom, storeRoom, closePersistence, flushAndReload } from "./persistence.mjs";
import { migrateRoom } from "./migrate.mjs";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PING_TIMEOUT = 30_000;
const PORT = Number(process.env.PORT) || 4444;

// Coalesce doc updates within a short window before broadcasting.
// Default 8ms (≈half a frame) merges same-burst updates while keeping
// per-keystroke latency imperceptible. Override with DOC_FLUSH_MS env var.
const DOC_FLUSH_MS = Number(process.env.DOC_FLUSH_MS) || 8;
// Skip conns whose send buffer exceeds 1MB; they catch up via CRDT.
const MAX_BUFFERED_BYTES = 1 << 20;

// LRU: keep at most this many rooms warm in memory after all conns leave.
const MAX_WARM_ROOMS = Number(process.env.MAX_WARM_ROOMS) || 100;
// Debounce interval for persisting room state to LevelDB.
const STORE_DEBOUNCE_MS = Number(process.env.STORE_DEBOUNCE_MS) || 2000;

const rooms = new Map();

/**
 * Extract the board/room ID from a tree room name ("writeboard-<roomId>").
 * Page rooms ("writeboard-<roomId>--page--<pageId>") are never passed here.
 *
 * @param {string} name
 * @returns {string}
 */
function roomIdFromName(name) {
  return name.replace(/^writeboard-/, '');
}

/**
 * Move the room entry to the end of the Map (most-recently-used).
 * The rooms Map is ordered by insertion; end = MRU, beginning = LRU.
 *
 * @param {string} name
 * @param {object} room
 */
function touchRoom(name, room) {
  rooms.delete(name);
  rooms.set(name, room);
}

function getOrCreateRoom(name) {
  let room = rooms.get(name);
  if (room) {
    touchRoom(name, room);
    return room;
  }

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);

  // Per-room debounced store timer.
  let storeTimer = null;
  const scheduleStore = () => {
    if (storeTimer) return;
    storeTimer = setTimeout(() => {
      storeTimer = null;
      storeRoom(name, doc).catch((err) =>
        console.error("[persist] store failed", name, err),
      );
    }, STORE_DEBOUNCE_MS);
  };

  awareness.on("update", ({ added, updated, removed }, _origin) => {
    const changedClients = [...added, ...updated, ...removed];
    const update = encodeAwarenessUpdate(awareness, changedClients);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, update);
    broadcastToRoom(room, encoding.toUint8Array(encoder), null);
  });

  // Coalesce doc updates so a burst of keystrokes becomes ONE broadcast message.
  // Broadcasting the merged update to all conns (origin=null) is safe: applying
  // an update you already have is idempotent in Yjs, so echoing to the origin
  // conn is harmless and lets us drop per-update origin tracking after merging.
  const docCoalescer = createCoalescer({
    flushMs: DOC_FLUSH_MS,
    onFlush: (updates) => {
      const merged = Y.mergeUpdates(updates);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      writeUpdate(encoder, merged);
      broadcastToRoom(room, encoding.toUint8Array(encoder), null);
    },
  });

  // Bug 3 fix: attach doc.on('update') AFTER loadRoom resolves so the load
  // itself doesn't trigger broadcasts or store-back churn. Real client edits
  // arrive after load completes and are handled normally.
  const loaded = loadRoom(name, doc)
    .then(() => {
      doc.on("update", (update) => {
        docCoalescer.push(update);
        scheduleStore();
      });
    })
    .catch((err) => {
      console.error("[persist] load failed", name, err);
      // Still attach the update handler even if load fails so live edits work.
      doc.on("update", (update) => {
        docCoalescer.push(update);
        scheduleStore();
      });
    });

  room = { doc, awareness, conns: new Map(), docCoalescer, loaded };
  // Expose a closure-capturing helper so evictRoom and shutdown can clear the
  // per-room store timer before destroying the doc.
  room.clearStoreTimer = () => {
    if (storeTimer) {
      clearTimeout(storeTimer);
      storeTimer = null;
    }
  };

  rooms.set(name, room);
  return room;
}

/**
 * Evict one room: flush to disk, dispose coalescer + timers, destroy doc.
 * Never evicts a room that still has active connections.
 *
 * @param {string} name
 * @param {object} room
 */
function evictRoom(name, room) {
  // Flush immediately (fire-and-forget with logging).
  storeRoom(name, room.doc).catch((err) =>
    console.error("[persist] evict flush failed", name, err),
  );
  // Clear pending store timer BEFORE destroying doc.
  room.clearStoreTimer?.();
  // Dispose coalescer BEFORE destroying doc (Task G ordering preserved).
  room.docCoalescer.dispose();
  room.awareness.destroy();
  room.doc.destroy();
  rooms.delete(name);
  console.log(`[room] evicted ${name}`);
}

/**
 * Run LRU eviction until rooms.size <= MAX_WARM_ROOMS.
 * Only evicts rooms with zero connections (LRU = start of Map).
 */
function runLruEviction() {
  if (rooms.size <= MAX_WARM_ROOMS) return;
  for (const [name, room] of rooms) {
    if (rooms.size <= MAX_WARM_ROOMS) break;
    if (room.conns.size === 0) {
      evictRoom(name, room);
    }
  }
}

function broadcastToRoom(room, msg, origin) {
  for (const [conn] of room.conns) {
    if (conn !== origin && conn.readyState === 1) {
      if (conn.bufferedAmount > MAX_BUFFERED_BYTES) continue; // backpressure: skip; CRDT catches up
      try {
        conn.send(msg);
      } catch {
        closeConn(room, conn);
      }
    }
  }
}

function closeConn(room, conn) {
  const controlledIds = room.conns.get(conn);
  room.conns.delete(conn);

  if (controlledIds) {
    removeAwarenessStates(room.awareness, Array.from(controlledIds), null);
  }

  if (room.conns.size === 0) {
    // Find the name for this room to persist it.
    for (const [name, r] of rooms) {
      if (r === room) {
        // Flush to disk (fire-and-forget; evictRoom will also flush if evicted).
        storeRoom(name, room.doc).catch((err) =>
          console.error("[persist] closeConn flush failed", name, err),
        );
        console.log(`[room] emptied ${name} (kept warm)`);
        // Run LRU eviction: if we're over the limit, evict least-recently-used
        // rooms with zero conns. The current room was already touchRoom'd on
        // last access so it's near the MRU end of the Map.
        runLruEviction();
        break;
      }
    }
  }
}

function handleMessage(room, conn, data) {
  try {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        readSyncMessage(decoder, encoder, room.doc, conn);
        if (encoding.length(encoder) > 1) {
          conn.send(encoding.toUint8Array(encoder));
        }
        break;
      }
      case MESSAGE_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        applyAwarenessUpdate(room.awareness, update, conn);
        const connControlled = room.conns.get(conn);
        if (connControlled) {
          const d = decoding.createDecoder(update);
          const len = decoding.readVarUint(d);
          for (let i = 0; i < len; i++) {
            const clientID = decoding.readVarUint(d);
            connControlled.add(clientID);
          }
        }
        break;
      }
    }
  } catch {
    // malformed message — ignore
  }
}

async function onConnection(conn, roomName) {
  const room = getOrCreateRoom(roomName);
  room.conns.set(conn, new Set());
  console.log(`[ws] join ${roomName} (${room.conns.size} conns)`);

  // Bug 1 fix: register close handler BEFORE awaiting room.loaded.
  // A WebSocket that disconnects during the async load now correctly calls
  // closeConn, removing the conn from room.conns so the room can empty + evict.
  // pingInterval is declared here so the close handler can clear it.
  let alive = true;
  let pingInterval = null;

  conn.on("close", () => {
    if (pingInterval) clearInterval(pingInterval);
    closeConn(room, conn);
    console.log(`[ws] leave ${roomName} (${room.conns.size} conns)`);
  });

  // Await persisted state before sending initial sync so the joining client
  // receives the full doc, not an empty one. Two simultaneous cold joins share
  // the same room.loaded promise — both wait for the single load.
  await room.loaded;

  // Guard: if the conn closed (or was closed) during the load await, bail.
  // The close handler has already run closeConn, so room.conns.has(conn) is
  // false. Sending on a CLOSING/CLOSED socket would throw.
  if (conn.readyState !== 1 /* WebSocket.OPEN */ || !room.conns.has(conn)) {
    return;
  }

  pingInterval = setInterval(() => {
    if (!alive) {
      closeConn(room, conn);
      try { conn.close(); } catch { /* already closed */ }
      clearInterval(pingInterval);
      pingInterval = null;
    } else {
      alive = false;
    }
  }, PING_TIMEOUT);

  conn.on("message", (data) => {
    alive = true;
    handleMessage(room, conn, new Uint8Array(data));
  });

  // On first load of a TREE room (not a page room), migrate legacy page-<id>
  // fragments into per-page rooms with a verify-then-delete durability gate.
  // Page rooms use the `--page--` delimiter (never present in roomIds), so
  // classification by !roomName.includes('--page--') is unambiguous.
  // Wrapped in .catch so a migration error never blocks the client connection.
  if (!roomName.includes('--page--')) {
    migrateRoom(roomIdFromName(roomName), room.doc, {
      // getPageDoc is async: await the page room's loaded promise BEFORE
      // returning the doc so that any pre-existing LevelDB state is applied
      // before migratePageFragment inspects the target fragment. This ensures
      // the `target.length > 0` duplication guard in migratePageFragment can
      // see already-migrated content and skip re-migration safely.
      getPageDoc: async (pageRoom) => {
        const pr = getOrCreateRoom(pageRoom);
        await pr.loaded;
        return pr.doc;
      },
      persistAndVerify: async (pageRoom, pageDoc) => {
        // flushAndReload writes to LevelDB, compacts, then reads back into
        // a fresh doc — if content round-trips, persistence is confirmed.
        const reloaded = await flushAndReload(pageRoom, pageDoc);
        const reloadedContent = reloaded.getXmlFragment('content');
        const sourceContent = pageDoc.getXmlFragment('content');
        const verified = (
          reloadedContent.length > 0 &&
          reloadedContent.toJSON() === sourceContent.toJSON()
        );
        reloaded.destroy(); // free the throwaway verify doc (LOW fix)
        return verified;
      },
    }).catch((err) => console.error('[migrate] room migration failed', roomName, err));
  }

  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    writeSyncStep1(encoder, room.doc);
    conn.send(encoding.toUint8Array(encoder));
  }

  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    writeSyncStep2(encoder, room.doc);
    conn.send(encoding.toUint8Array(encoder));
  }

  {
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
      );
      conn.send(encoding.toUint8Array(encoder));
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", version: "3.0.0", rooms: rooms.size }));
    return;
  }
  res.writeHead(200);
  res.end("Writeboard Sync Server");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const roomName = (req.url || "/").slice(1) || "default";
  onConnection(ws, roomName);
});

server.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});

// Graceful shutdown: flush all warm rooms to disk, then close the DB.
async function shutdown(signal) {
  console.log(`[server] ${signal} received — flushing ${rooms.size} warm room(s)...`);
  const flushes = [];
  for (const [name, room] of rooms) {
    room.clearStoreTimer?.();
    room.docCoalescer.dispose();
    flushes.push(
      storeRoom(name, room.doc).catch((err) =>
        console.error("[persist] shutdown flush failed", name, err),
      ),
    );
  }
  // Best-effort: wait up to 5 s for flushes.
  await Promise.race([
    Promise.allSettled(flushes),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  await closePersistence();
  console.log("[server] shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
