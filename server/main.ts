/**
 * y-websocket server for Deno Deploy.
 *
 * Each isolate keeps rooms in memory. BroadcastChannel relays
 * updates across isolates. When a new isolate creates a room,
 * it requests the full doc state from other isolates via
 * a state-request/response handshake over BroadcastChannel.
 *
 * Clients persist to localStorage and send their state on
 * connect via the standard Yjs sync protocol, so no server-side
 * persistence is needed.
 */

import * as Y from "npm:yjs@^13.6.30";
import {
  readSyncMessage,
  writeSyncStep1,
  writeSyncStep2,
  writeUpdate,
} from "npm:y-protocols@^1.0.6/sync";
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
  Awareness,
} from "npm:y-protocols@^1.0.6/awareness";
import * as encoding from "npm:lib0@^0.2.108/encoding";
import * as decoding from "npm:lib0@^0.2.108/decoding";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const PING_TIMEOUT = 30_000;
const CROSS_ISOLATE = "cross-isolate";

interface Room {
  doc: Y.Doc;
  awareness: Awareness;
  conns: Map<WebSocket, Set<number>>;
}

const rooms = new Map<string, Room>();

// --- Cross-isolate relay via BroadcastChannel ---

const channel = new BroadcastChannel("yjs-sync");

channel.onmessage = (event: MessageEvent) => {
  const msg = event.data as {
    roomName: string;
    type: "sync" | "awareness" | "state-request" | "state-response";
    data: number[];
  };

  if (msg.type === "state-request") {
    const room = rooms.get(msg.roomName);
    if (room && room.conns.size > 0) {
      channel.postMessage({
        roomName: msg.roomName,
        type: "state-response",
        data: Array.from(Y.encodeStateAsUpdate(room.doc)),
      });
    }
    return;
  }

  if (msg.type === "state-response") {
    const room = rooms.get(msg.roomName);
    if (room) {
      Y.applyUpdate(room.doc, new Uint8Array(msg.data), CROSS_ISOLATE);
      broadcastToRoom(room, buildSyncStep2(room.doc), null);
    }
    return;
  }

  const room = rooms.get(msg.roomName);
  if (!room) return;

  const update = new Uint8Array(msg.data);
  if (msg.type === "sync") {
    Y.applyUpdate(room.doc, update, CROSS_ISOLATE);
  } else {
    applyAwarenessUpdate(room.awareness, update, CROSS_ISOLATE);
  }
};

function buildSyncStep2(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  writeSyncStep2(encoder, doc);
  return encoding.toUint8Array(encoder);
}

// --- Room management ---

function getOrCreateRoom(name: string): Room {
  const existing = rooms.get(name);
  if (existing) return existing;

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const room: Room = { doc, awareness, conns: new Map() };

  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      const changedClients = [...added, ...updated, ...removed];
      const update = encodeAwarenessUpdate(awareness, changedClients);

      if (origin !== CROSS_ISOLATE) {
        channel.postMessage({
          roomName: name,
          type: "awareness",
          data: Array.from(update),
        });
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, update);
      broadcastToRoom(room, encoding.toUint8Array(encoder), null);
    },
  );

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== CROSS_ISOLATE) {
      channel.postMessage({
        roomName: name,
        type: "sync",
        data: Array.from(update),
      });
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    writeUpdate(encoder, update);
    broadcastToRoom(room, encoding.toUint8Array(encoder), origin);
  });

  rooms.set(name, room);

  channel.postMessage({ roomName: name, type: "state-request", data: [] });

  return room;
}

function broadcastToRoom(room: Room, msg: Uint8Array, origin: unknown): void {
  for (const [conn] of room.conns) {
    if (conn !== origin && conn.readyState === WebSocket.OPEN) {
      try {
        conn.send(msg);
      } catch {
        closeConn(room, conn);
      }
    }
  }
}

function closeConn(room: Room, conn: WebSocket): void {
  const controlledIds = room.conns.get(conn);
  room.conns.delete(conn);

  if (controlledIds) {
    removeAwarenessStates(room.awareness, Array.from(controlledIds), null);
  }

  if (room.conns.size === 0) {
    const roomName = [...rooms.entries()].find(([, r]) => r === room)?.[0];
    if (roomName) {
      room.awareness.destroy();
      room.doc.destroy();
      rooms.delete(roomName);
    }
  }
}

function handleMessage(room: Room, conn: WebSocket, data: Uint8Array): void {
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
      default:
        break;
    }
  } catch {
    // malformed message — ignore
  }
}

function onConnection(conn: WebSocket, roomName: string): void {
  const room = getOrCreateRoom(roomName);
  room.conns.set(conn, new Set());
  console.log(`[ws] join ${roomName} (${room.conns.size} conns, doc ${room.doc.store.clients.size > 0 ? "has data" : "empty"})`);

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

  conn.addEventListener("close", () => {
    clearInterval(pingInterval);
    closeConn(room, conn);
    console.log(`[ws] leave ${roomName} (${room.conns.size} conns)`);
  });

  conn.addEventListener("message", (event: MessageEvent) => {
    alive = true;
    let data: Uint8Array;
    if (event.data instanceof ArrayBuffer) {
      data = new Uint8Array(event.data);
    } else if (event.data instanceof Uint8Array) {
      data = event.data;
    } else {
      return;
    }
    handleMessage(room, conn, data);
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

Deno.serve({ port: Number(Deno.env.get("PORT")) || 4444 }, (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return Response.json({
      status: "ok",
      version: "2.0.0-bc",
      rooms: rooms.size,
    });
  }

  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const roomName = url.pathname.slice(1) || "default";
    socket.binaryType = "arraybuffer";

    socket.addEventListener("open", () => {
      onConnection(socket, roomName);
    });

    return response;
  }

  return new Response("Writeboard Sync Server", { status: 200 });
});
