# Load-test harness — WebSocket fan-out broadcast latency

## Purpose

This harness establishes a **broadcast latency baseline** for the Yjs sync server before any performance optimisations are applied.

The server's hot path is `broadcastToRoom`: when a client sends a doc update the server synchronously iterates every other connection in the room and calls `conn.send()` once per peer.  As the fan-out width `N` grows, each write blocks the event loop for `O(N)` iterations.

`ws-fanout.mjs` opens `N` WebSocket connections to the server in a single Node.js process, designates one connection as the **writer** (sends a Yjs text mutation every `EDIT_INTERVAL_MS`), and treats the remaining `N - 1` connections as **readers**.  It measures the delta between the writer's send timestamp and each reader's receive timestamp, then prints p50 / p95 / p99 / max.

---

## How to run

### 1. Start the sync server

```sh
cd server
npm install
node main.mjs
# → [server] listening on port 4444
```

### 2. Run the harness (separate terminal)

```sh
cd server
node loadtest/ws-fanout.mjs
```

With explicit configuration:

```sh
N=50 DURATION_MS=10000 EDIT_INTERVAL_MS=100 ROOM=loadtest node loadtest/ws-fanout.mjs
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `N` | `50` | Total WebSocket connections (1 writer + N-1 readers) |
| `ROOM` | `loadtest` | Yjs room name |
| `URL` | `ws://localhost:4444` | Server WebSocket base URL |
| `DURATION_MS` | `10000` | How long to run the test (ms) |
| `EDIT_INTERVAL_MS` | `100` | How often the writer mutates its doc (ms) |

---

## Latency measurement caveat

All connections are opened **within the same Node.js process**.  Latency is computed as:

```
latency = reader.performance.now() — writer.performance.now() (at send)
```

Because both sides share a single JS thread and `performance.now()` clock, this measures **intra-process I/O round-trip** (the time for the kernel to deliver the bytes back through the loopback or local network stack), **not** true network latency from a remote client.

What it does capture well:
- How much the event loop is blocked by the synchronous `broadcastToRoom` fan-out.
- How quickly the server drains its send buffers under N concurrent sockets.

For a more accurate end-to-end measurement use separate processes or machines and align clocks with NTP/PTP.

---

## Baseline numbers (fill in after a real run)

Run the harness with the command below and record results here before applying Task G optimisations.

```sh
N=50 DURATION_MS=10000 EDIT_INTERVAL_MS=100 node loadtest/ws-fanout.mjs
```

Recorded baseline below was captured with `N=40 DURATION_MS=6000 EDIT_INTERVAL_MS=50`
against the pre-optimisation server (commit before Task G). Re-run the SAME command
after Task G and fill in the "After Task G" column.

```sh
N=40 DURATION_MS=6000 EDIT_INTERVAL_MS=50 URL=ws://localhost:4455 node loadtest/ws-fanout.mjs
```

| Metric | Baseline (pre-optimisation) | After Task G |
|---|---|---|
| N connections | 40 | 40 |
| Latency p50 (ms) | 2.07 | _TBD_ |
| Latency p95 (ms) | 5.67 | _TBD_ |
| Latency p99 (ms) | 7.97 | _TBD_ |
| Latency max (ms) | 10.40 | _TBD_ |
| Total msgs / sec | 760 | _TBD_ |

> Note: at 40 conns / 50ms the current server is already fast (single-digit ms) — the
> synchronous fan-out only becomes a bottleneck at higher N or edit rates. Task G's
> coalescing + backpressure targets the tail (p99/max) under bursty load; re-run at
> higher N (e.g. `N=150 EDIT_INTERVAL_MS=20`) to see the divergence.

---

## Event-loop delay (server-side) — Task G follow-up

The harness does **not** modify `server/main.mjs` (that is Task G's scope).

Once Task G lands you can add server-side event-loop delay monitoring using `perf_hooks.monitorEventLoopDelay`:

```js
import { monitorEventLoopDelay } from 'node:perf_hooks';
const h = monitorEventLoopDelay({ resolution: 10 });
h.enable();
// ...after test duration...
h.disable();
console.log('ELD p99:', h.percentile(99), 'ms');
```

Add a `LOADTEST=1` env-var branch in `main.mjs` (Task G) to emit this alongside the harness run for a fully correlated before/after view.
