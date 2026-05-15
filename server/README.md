# Writeboard Sync Server

A y-websocket server (Node.js) that syncs Yjs documents across clients over WebSocket.

## Deploy to VPS

```bash
# Add DNS A record: coldbrew-api.brianle.dev → 160.22.161.36
# Then run:
bash server/deploy.sh
```

## Run locally

```bash
cd server
npm install
PORT=4444 node main.mjs
```

## Health check

```
GET /health → {"status":"ok","version":"3.0.0","rooms":0}
```
