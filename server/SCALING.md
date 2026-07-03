# Coldbrew Sync Server — Horizontal Scaling Strategy

> **Status**: Single-instance deployment (root@160.22.161.36, port 4444).  
> This document describes how to scale when that becomes insufficient.

---

## 1. Current Architecture and Its Ceiling

### How it works today

`main.mjs` is a hand-rolled Yjs WebSocket server. Every room is stored in a single
in-memory `Map`:

```
rooms: Map<roomName, { doc: Y.Doc, awareness: Awareness, conns: Map }>
```

When a client connects to `wss://coldbrew-api.brianle.dev`, Caddy proxies it to
`localhost:4444`. The room name comes from the URL path (`/writeboard-<roomId>`).
`main.mjs` creates or reuses the in-memory room, hands back sync step1/step2, and
from then on broadcasts all updates to every other connection in the same `Map` entry.

### Why multi-instance naively breaks

If you spin up a second instance on port 4445 and put both behind a round-robin load
balancer, two users who join the same room name but land on **different instances** end
up in **two completely separate in-memory Y.Doc objects**. Those docs are never merged.
User A edits on :4444, User B edits on :4445 — they silently never see each other's
changes. There is no error, no warning; it simply looks like the collaborators are gone.

This is the fundamental constraint: **Yjs CRDT state is process-local. Any scaling
strategy must ensure that all connections for a given room reach the same process.**

### The practical ceiling

| Resource | Bottleneck |
|---|---|
| Memory | Each room holds a full Y.Doc + Awareness snapshot. A room with large content or many historical updates consumes more RAM. Dozens of concurrently active rooms on a 2GB VPS is fine. Thousands may not be. |
| CPU | Broadcast is O(conns-in-room). Task G's update coalescing (`DOC_FLUSH_MS=8`) and backpressure (`MAX_BUFFERED_BYTES=1MB`) significantly reduce per-keystroke fan-out. One busy room with many cursors is the real stress case. |
| Network | All WebSocket traffic goes through a single Caddy → Node pipe. Gigabit VPS uplink is rarely the limit at typical document-collaboration scale. |

**Verdict**: A single well-specced VPS comfortably handles WriteBoard's workload
(many small rooms, a few users each). Vertical scaling — move to a bigger box — should
be the first move. Horizontal scaling becomes necessary only when a single node's
memory or CPU is genuinely saturated.

---

## 2. Recommended First Step: Sticky-by-Room Routing

### The principle

Route WebSocket connections so that **all connections for a given room name always land
on the same instance**. Each instance then operates exactly as today — no cross-process
state sharing needed. Rooms are distributed across N nodes; each node owns a slice.

A single room is still bounded by one node's resources, but:
- N nodes means N times as many rooms fit in aggregate.
- A "hot" room with many connections still lands on one node — that is acceptable
  for WriteBoard's use pattern (docs rarely have >20 simultaneous editors).

### 2a. Running multiple instances via systemd template units

Create a template unit file on the VPS so each instance gets its own port:

```ini
# /etc/systemd/system/coldbrew-sync@.service
[Unit]
Description=Coldbrew Sync Server (instance %i)
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/coldbrew-sync
ExecStart=/usr/bin/node main.mjs
Restart=always
RestartSec=5
Environment=PORT=%i

[Install]
WantedBy=multi-user.target
```

Enable and start three instances:

```bash
systemctl daemon-reload
systemctl enable --now coldbrew-sync@4444
systemctl enable --now coldbrew-sync@4445
systemctl enable --now coldbrew-sync@4446
```

> The original `coldbrew-sync.service` (non-template) can be disabled once the
> template units are running: `systemctl disable --now coldbrew-sync`.

### 2b. Nginx — the most straightforward sticky-by-room router

Nginx's `upstream` block supports `hash $uri consistent;` which deterministically maps
each URL path to one backend. Connections for `/writeboard-abc123` always go to the
same upstream. Install nginx alongside Caddy (on a different internal port) or replace
Caddy for the WebSocket proxy path.

```nginx
upstream coldbrew_nodes {
    hash $uri consistent;       # sticky by full URL path = room name
    server 127.0.0.1:4444;
    server 127.0.0.1:4445;
    server 127.0.0.1:4446;
}

server {
    listen 8080;                # nginx on internal port; Caddy still terminates TLS

    location / {
        proxy_pass         http://coldbrew_nodes;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host       $host;
        proxy_read_timeout 86400s;
    }
}
```

Then update the Caddyfile to proxy to nginx instead of directly to Node:

```caddyfile
coldbrew-api.brianle.dev {
    reverse_proxy localhost:8080
}
```

`hash $uri consistent` uses a consistent-hash ring so adding/removing an instance
only remaps ~1/N of the rooms (those rooms temporarily lose state until clients
reconnect and re-sync — acceptable for a soft-state CRDT document server).

### 2c. Caddy alternative

Caddy's built-in `lb_policy` options (`round_robin`, `least_conn`, `ip_hash`,
`client_ip_hash`, `cookie`, `header`) do not include a URL-path hash as of Caddy 2.x.
`client_ip_hash` would pin a user to an instance by IP but does **not** guarantee that
two users in the same room (different IPs) land on the same instance — so it is
**not suitable** for this use case.

Options within Caddy:

1. **Caddy matcher per-room prefix → fixed upstream**: If you know the room IDs in
   advance (e.g. tenant-partitioned), you can write named matchers:

   ```caddyfile
   coldbrew-api.brianle.dev {
       @shard0 path /writeboard-a* /writeboard-b* /writeboard-c* /writeboard-d*
       @shard1 path /writeboard-e* /writeboard-f* /writeboard-g* /writeboard-h*
       @shard2 path *   # catch-all

       handle @shard0 { reverse_proxy localhost:4444 }
       handle @shard1 { reverse_proxy localhost:4445 }
       handle @shard2 { reverse_proxy localhost:4446 }
   }
   ```

   This is a crude static shard — not balanced, but stable. Better done via nginx.

2. **Caddy + a custom plugin**: A `caddy-dynamic-proxy` or `caddy-layer4` plugin could
   enable path-hash routing, but requires building a custom Caddy binary.

**Recommendation**: Use nginx for the WebSocket proxy layer. Keep Caddy as the TLS
terminator pointing to nginx on `localhost:8080`. This is the standard setup and
requires zero custom builds.

---

## 3. Advanced Option: Redis Pub/Sub Fan-out (Defer Until Needed)

If a **single room** must support more concurrent editors than one Node process can
handle (e.g. hundreds of simultaneous writers in one document), sticky routing
alone is insufficient. The solution is to back the broadcast with Redis pub/sub:

- Each instance subscribes to a Redis channel per room (e.g. `room:writeboard-abc123`).
- When a client sends an update, the receiving instance:
  1. Applies it to its local Y.Doc.
  2. Publishes the binary update to the Redis channel.
- All other instances subscribed to that channel receive the update and rebroadcast
  it to their local connections for that room.

This allows any instance to serve any room, eliminating the need for sticky routing.

**Trade-offs**:
- Requires a Redis instance (or Redis Cluster for HA).
- Network round-trip to Redis adds latency to every update (typically 1–5ms LAN).
- Adds operational complexity: Redis uptime becomes a dependency.
- Awareness (cursor positions) must also be relayed through Redis — same pattern.
- Y.Doc state (for new joiners) still needs to be stored somewhere durable; ephemeral
  in-memory docs across instances mean a joiner on instance B cannot reconstruct the
  doc from instance A without a shared store.

**Recommendation**: **Defer until sticky routing is proven insufficient.** For
WriteBoard's use pattern (collaborative docs, not live-coding with 100 participants),
sticky routing will handle the realistic load. Redis fan-out is real work; do it when
profiling shows a room saturating a single node.

---

## 4. Alternative: Adopt Hocuspocus

[`@hocuspocus/server`](https://tiptap.dev/hocuspocus/) is a batteries-included Yjs
backend that supports:
- Persistence via `@hocuspocus/extension-database` (LevelDB, Postgres, etc.)
- Horizontal scaling via `@hocuspocus/extension-redis` (Redis pub/sub, same pattern
  described in §3 but pre-built)
- Authentication hooks, awareness, and document change hooks

It would replace the hand-rolled `main.mjs` (~220 lines) with a config-driven server.

**Trade-offs**:
- Pro: Less code to maintain; scaling and persistence are solved problems.
- Con: Heavier dependency footprint; requires a migration of the existing protocol
  (clients connect the same way, but server internals differ).
- Con: The current `main.mjs` is well-understood and tuned (coalescer, backpressure).
  Hocuspocus abstracts these away; you'd lose direct control.

**Recommendation**: Capture as a future migration option. Not a now-action. The
hand-rolled server is intentionally lean and fully understood.

---

## 5. Persistence Interaction

See Task C1 (server-side LevelDB persistence) for the persistence implementation.

**With sticky-by-room routing** (§2): each instance persists only the rooms it owns.
This is correct and self-contained — instance :4444 persists rooms in its LevelDB,
instance :4445 in its own. No shared state needed.

**With Redis fan-out** (§3) or on instance failover: if instance :4444 crashes,
its rooms must be rehydrated by another instance. This requires a **shared durable
store** (e.g. a single LevelDB on a shared volume, or Postgres) accessible by any
instance — not the per-instance LevelDB from Task C1. This is a significant
architectural change; it is another reason to defer Redis fan-out until necessary.

**With sticky routing**, if an instance crashes, clients reconnect and will be rerouted
by the load balancer to a surviving instance. That instance has no in-memory state for
the room. With Task C1's LevelDB persistence, the instance can reload the room from
disk on the first join — but only if the LevelDB file is accessible to the new instance
(shared volume, or rooms are re-routed back to the original instance once it recovers).
This edge case should be handled in the persistence implementation.

---

## 6. Health Check and Multi-Instance Observability

The existing `/health` endpoint:

```
GET https://coldbrew-api.brianle.dev/health
→ {"status":"ok","version":"3.0.0","rooms":4}
```

`rooms` is **per-instance only**. With multiple instances, this endpoint reports only
the room count on whichever instance Caddy/nginx happens to route the HTTP request to.

For aggregate visibility across all instances, scrape each directly:

```bash
# Check all three instances
curl -s http://localhost:4444/health | jq .
curl -s http://localhost:4445/health | jq .
curl -s http://localhost:4446/health | jq .
```

Or add a simple aggregator script that sums `rooms` across instances. A full
monitoring solution (Prometheus node exporter, Grafana) is beyond scope but follows
naturally from having per-instance health endpoints.

---

## Summary: What to Do and When

| Trigger | Action |
|---|---|
| Memory/CPU on the current VPS is the bottleneck | Vertical scale first: move to a larger Hetzner/DigitalOcean box |
| Too many rooms for one node | Sticky routing: nginx `hash $uri consistent` + systemd template units (§2) |
| One specific room has too many concurrent editors | Redis pub/sub fan-out (§3) — or reconsider whether such a room is expected |
| Ops complexity is growing faster than traffic | Evaluate Hocuspocus migration (§4) |

**Today's action**: nothing. The single-node setup is appropriate for current scale.
Document and revisit when the `/health` endpoint on `coldbrew-api.brianle.dev` reports
consistent memory pressure or CPU saturation.
