/**
 * ws-fanout.mjs — WebSocket fan-out load-test harness
 *
 * Measures broadcast latency: time from the writer sending a Yjs doc-update
 * message until each reader WebSocket receives it. Because all connections run
 * in the same Node.js process, `performance.now()` is a shared wall-clock and
 * the measurement is an approximation of in-process I/O round-trip time.
 * See README.md for caveats.
 *
 * Usage (from the server/ directory):
 *   N=50 DURATION_MS=10000 EDIT_INTERVAL_MS=100 node loadtest/ws-fanout.mjs
 */

import { WebSocket } from "ws";
import * as Y from "yjs";
import {
  readSyncMessage,
  writeSyncStep1,
  writeUpdate,
} from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { performance } from "node:perf_hooks";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const N = Number(process.env.N) || 50;
const ROOM = process.env.ROOM || "loadtest";
const URL_BASE = process.env.URL || "ws://localhost:4444";
const DURATION_MS = Number(process.env.DURATION_MS) || 10_000;
const EDIT_INTERVAL_MS = Number(process.env.EDIT_INTERVAL_MS) || 100;

const WS_URL = `${URL_BASE}/${ROOM}`;

const MESSAGE_SYNC = 0;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/**
 * Timestamp (performance.now()) of the last update sent by the writer.
 * Readers subtract this from their receive time to estimate latency.
 * Because all connections live in the same process, this is a shared clock.
 */
let lastSendTs = 0;

/** All reader latency samples (ms). */
const latencies = [];

/** Total messages received across all reader conns. */
let totalMessagesReceived = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Encode a Yjs binary update as a MESSAGE_SYNC update frame — the same wire
 * format the server relays to readers after a broadcastToRoom call.
 */
function encodeUpdateMessage(update) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

/**
 * Send the y-protocols syncStep1 frame so the server knows we want its state.
 */
function sendSyncStep1(ws, doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));
}

/**
 * Process an incoming raw WebSocket message frame.
 * Handles the sync handshake (Step1 → reply, Step2 → absorb) so the server
 * treats this connection as a valid y-websocket peer.
 */
function handleIncoming(ws, doc, rawData) {
  try {
    const bytes = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData);
    const decoder = decoding.createDecoder(bytes);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === MESSAGE_SYNC) {
      const replyEncoder = encoding.createEncoder();
      encoding.writeVarUint(replyEncoder, MESSAGE_SYNC);
      // readSyncMessage handles Step1 (writes Step2 reply into replyEncoder),
      // Step2 (applies state to doc), and Update (applies update to doc).
      readSyncMessage(decoder, replyEncoder, doc, null);
      if (encoding.length(replyEncoder) > 1) {
        ws.send(encoding.toUint8Array(replyEncoder));
      }
    }
    // Ignore MESSAGE_AWARENESS (type 1) — not needed for latency measurement.
  } catch {
    // malformed or unexpected — ignore
  }
}

// ---------------------------------------------------------------------------
// Open one client connection; resolves when first message received (handshake)
// ---------------------------------------------------------------------------

function openClient(isWriter) {
  return new Promise((resolve) => {
    const doc = new Y.Doc();
    const ws = new WebSocket(WS_URL);
    let ready = false;

    ws.on("open", () => {
      sendSyncStep1(ws, doc);
    });

    ws.on("message", (data) => {
      // Record receive time immediately.
      const recvTs = performance.now();

      if (!isWriter) {
        totalMessagesReceived++;
        // Record latency once handshake is done and writer has sent at least once.
        if (ready && lastSendTs > 0) {
          latencies.push(recvTs - lastSendTs);
        }
      }

      handleIncoming(ws, doc, data);

      if (!ready) {
        ready = true;
        resolve({ ws, doc });
      }
    });

    ws.on("error", (err) => {
      console.error(`[client] error: ${err.message}`);
      // Resolve anyway so we don't block the harness.
      if (!ready) {
        ready = true;
        resolve({ ws, doc });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[harness] connecting ${N} clients to ${WS_URL}`);
  console.log(
    `[harness] writer interval: ${EDIT_INTERVAL_MS} ms | duration: ${DURATION_MS} ms`,
  );

  // Open all connections concurrently; wait for all to receive first message.
  const connectPromises = [];
  for (let i = 0; i < N; i++) {
    connectPromises.push(openClient(i === 0));
  }

  // Race with a 10-second timeout so we don't block forever if the server is slow.
  let clients;
  try {
    clients = await Promise.race([
      Promise.all(connectPromises),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("timeout waiting for connections")),
          10_000,
        ),
      ),
    ]);
  } catch (err) {
    console.warn(`[harness] ${err.message} — proceeding with connected clients`);
    clients = await Promise.allSettled(connectPromises).then((results) =>
      results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value),
    );
  }

  console.log(`[harness] ${clients.length} connections ready — starting test`);

  const writerClient = clients[0];
  const { ws: writerWs, doc: writerDoc } = writerClient;

  // Wire up the writer's doc: every local mutation → encode → send to server.
  writerDoc.on("update", (update) => {
    if (writerWs.readyState !== WebSocket.OPEN) return;
    // Stamp the send time right before transmission.
    lastSendTs = performance.now();
    writerWs.send(encodeUpdateMessage(update));
  });

  const startTs = performance.now();

  // Writer sends a doc update every EDIT_INTERVAL_MS.
  const editInterval = setInterval(() => {
    writerDoc.transact(() => {
      writerDoc.getText("t").insert(0, "x");
    });
  }, EDIT_INTERVAL_MS);

  // Run for DURATION_MS.
  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));

  clearInterval(editInterval);

  // Close all connections gracefully.
  for (const { ws } of clients) {
    try {
      ws.close(1000, "test done");
    } catch {
      // already closed
    }
  }

  // Small drain so in-flight messages can arrive.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const elapsed = (performance.now() - startTs) / 1000;
  const sorted = latencies.slice().sort((a, b) => a - b);
  const readerCount = N - 1;
  const expectedEdits = Math.floor(DURATION_MS / EDIT_INTERVAL_MS);
  const expectedMsgs = expectedEdits * readerCount;

  console.log("");
  console.log("=".repeat(62));
  console.log("  LOAD TEST RESULTS  (ws-fanout — broadcast latency baseline)");
  console.log("=".repeat(62));
  console.log(`  Connections          : ${clients.length}  (1 writer + ${readerCount} readers)`);
  console.log(`  Duration             : ${elapsed.toFixed(2)} s`);
  console.log(`  Edit interval        : ${EDIT_INTERVAL_MS} ms`);
  console.log(`  Expected edits       : ~${expectedEdits}`);
  console.log(`  Expected reader msgs : ~${expectedMsgs}`);
  console.log(`  Msgs received        : ${totalMessagesReceived}`);
  console.log(
    `  Msgs/sec             : ${(totalMessagesReceived / elapsed).toFixed(1)}`,
  );
  console.log(`  Latency samples      : ${sorted.length}`);
  console.log("");
  if (sorted.length > 0) {
    console.log(
      `  Latency p50          : ${percentile(sorted, 50).toFixed(3)} ms`,
    );
    console.log(
      `  Latency p95          : ${percentile(sorted, 95).toFixed(3)} ms`,
    );
    console.log(
      `  Latency p99          : ${percentile(sorted, 99).toFixed(3)} ms`,
    );
    console.log(
      `  Latency max          : ${sorted[sorted.length - 1].toFixed(3)} ms`,
    );
  } else {
    console.log(
      "  No latency samples collected.",
      "(Did readers receive update messages?)",
    );
  }
  console.log("=".repeat(62));
  console.log("");
  console.log(
    "NOTE: Latency is an in-process approximation (single shared clock).",
  );
  console.log(
    "      See loadtest/README.md for caveats and baseline recording instructions.",
  );
}

main().catch((err) => {
  console.error("[harness] fatal:", err);
  process.exit(1);
});
