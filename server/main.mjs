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

const rooms = new Map();

function getOrCreateRoom(name) {
  let room = rooms.get(name);
  if (room) return room;

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);

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

  doc.on("update", (update) => docCoalescer.push(update));

  room = { doc, awareness, conns: new Map(), docCoalescer };
  rooms.set(name, room);
  return room;
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
    for (const [name, r] of rooms) {
      if (r === room) {
        room.docCoalescer.dispose(); // cancel any pending timer before tearing down
        room.awareness.destroy();
        room.doc.destroy();
        rooms.delete(name);
        console.log(`[room] destroyed ${name}`);
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

function onConnection(conn, roomName) {
  const room = getOrCreateRoom(roomName);
  room.conns.set(conn, new Set());
  console.log(`[ws] join ${roomName} (${room.conns.size} conns)`);

  let alive = true;
  const pingInterval = setInterval(() => {
    if (!alive) {
      closeConn(room, conn);
      try { conn.close(); } catch { /* already closed */ }
      clearInterval(pingInterval);
    } else {
      alive = false;
    }
  }, PING_TIMEOUT);

  conn.on("close", () => {
    clearInterval(pingInterval);
    closeConn(room, conn);
    console.log(`[ws] leave ${roomName} (${room.conns.size} conns)`);
  });

  conn.on("message", (data) => {
    alive = true;
    handleMessage(room, conn, new Uint8Array(data));
  });

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
