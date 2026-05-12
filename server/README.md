# Writeboard Signaling Server

A y-webrtc signaling server for Deno Deploy. Helps peers discover each other for WebRTC connections.

## Deploy to Deno Deploy (Free)

1. Go to [dash.deno.com](https://dash.deno.com)
2. Click **"New Project"**
3. Select **"Link GitHub repo"** → choose `baobeta/coldbrew`
4. Set **entrypoint** to `server/main.ts`
5. Click **Deploy**

Your server will be at: `https://<project-name>.deno.dev`

## Update your app

Add your server URL to `.env`:

```
VITE_SIGNALING_SERVERS=wss://<project-name>.deno.dev
```

## Run locally

```bash
deno run --allow-net --allow-env server/main.ts
```

## Health check

```
GET /health → 200 "ok"
```
