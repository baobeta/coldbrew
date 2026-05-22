# Writeboard Sync Server

Node.js WebSocket server that syncs Yjs documents across clients. All clients in a room connect to the same server process and share an in-memory `Y.Doc`.

## How It Works

```
Client A ──WebSocket──┐
                      ├── Room "abc123" ── Y.Doc (in memory)
Client B ──WebSocket──┘
```

1. Client connects to `wss://coldbrew-api.brianle.dev/<room-name>`
2. Server creates or joins an in-memory room
3. Yjs sync protocol exchanges document state bidirectionally
4. Updates from any client are broadcast to all others in the room
5. Room is destroyed when the last client disconnects

## Run Locally

```bash
cd server
npm install
PORT=4444 node main.mjs
```

Then set `VITE_SIGNALING_SERVERS=ws://localhost:4444` in the frontend.

## Deploy to VPS

Prerequisites: A VPS with SSH access and Caddy installed.

1. Point DNS: `coldbrew-api.brianle.dev → <your-vps-ip>`
2. Run: `bash server/deploy.sh`

The script will:
- Sync server files to the VPS
- Install Node.js if needed
- Install npm dependencies
- Create a systemd service (`coldbrew-sync`)
- Add Caddy reverse proxy config with automatic SSL

## Health Check

```bash
curl https://coldbrew-api.brianle.dev/health
# → {"status":"ok","version":"3.0.0","rooms":0}
```

## Managing the Service

```bash
# SSH into VPS
ssh root@160.22.161.36

# Service commands
systemctl status coldbrew-sync
systemctl restart coldbrew-sync
journalctl -u coldbrew-sync -f    # tail logs
```

## Protocol

The server implements the [y-websocket binary protocol](https://github.com/yjs/y-websocket):

| Message Type | ID | Description |
|-------------|-----|-------------|
| Sync | 0 | Yjs document sync (state vector + updates) |
| Awareness | 1 | User presence (cursor position, name, color) |
