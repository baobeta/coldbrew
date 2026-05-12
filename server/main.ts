/**
 * y-webrtc signaling server for Deno Deploy.
 *
 * Compatible with y-webrtc's WebrtcProvider signaling protocol.
 * Deploy: https://dash.deno.com → New Project → Link GitHub repo → set entry to server/main.ts
 */

const topics = new Map<string, Set<WebSocket>>();
const PING_TIMEOUT = 30_000;

function send(conn: WebSocket, message: Record<string, unknown>): void {
  if (conn.readyState === WebSocket.OPEN) {
    try {
      conn.send(JSON.stringify(message));
    } catch {
      conn.close();
    }
  }
}

function onConnection(conn: WebSocket): void {
  const subscribedTopics = new Set<string>();
  let closed = false;
  let pongReceived = true;

  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      conn.close();
      clearInterval(pingInterval);
    } else {
      pongReceived = false;
      try {
        conn.send(JSON.stringify({ type: "ping" }));
      } catch {
        conn.close();
      }
    }
  }, PING_TIMEOUT);

  conn.addEventListener("pong", () => {
    pongReceived = true;
  });

  conn.addEventListener("close", () => {
    closed = true;
    clearInterval(pingInterval);
    for (const topicName of subscribedTopics) {
      const subs = topics.get(topicName);
      if (subs) {
        subs.delete(conn);
        if (subs.size === 0) {
          topics.delete(topicName);
        }
      }
    }
    subscribedTopics.clear();
  });

  conn.addEventListener("message", (event) => {
    if (closed) return;
    let message: any;
    try {
      message = JSON.parse(typeof event.data === "string" ? event.data : "");
    } catch {
      return;
    }

    if (!message || !message.type) return;

    switch (message.type) {
      case "subscribe":
        for (const topicName of message.topics || []) {
          if (typeof topicName === "string") {
            if (!topics.has(topicName)) {
              topics.set(topicName, new Set());
            }
            topics.get(topicName)!.add(conn);
            subscribedTopics.add(topicName);
          }
        }
        break;

      case "unsubscribe":
        for (const topicName of message.topics || []) {
          const subs = topics.get(topicName);
          if (subs) {
            subs.delete(conn);
          }
        }
        break;

      case "publish":
        if (message.topic) {
          const receivers = topics.get(message.topic);
          if (receivers) {
            message.clients = receivers.size;
            for (const receiver of receivers) {
              send(receiver, message);
            }
          }
        }
        break;

      case "ping":
        send(conn, { type: "pong" });
        break;
    }
  });
}

Deno.serve({ port: Number(Deno.env.get("PORT")) || 4444 }, (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return new Response("ok", { status: 200 });
  }

  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    onConnection(socket);
    return response;
  }

  return new Response("Writeboard Signaling Server", { status: 200 });
});
