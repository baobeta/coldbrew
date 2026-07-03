#!/bin/bash
set -e

VPS="root@160.22.161.36"
REMOTE_DIR="~/coldbrew-sync"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

ssh "$VPS" "mkdir -p $REMOTE_DIR"

echo "==> Syncing server files..."
rsync -avz \
  "$SCRIPT_DIR/main.mjs" \
  "$SCRIPT_DIR/coalesce.mjs" \
  "$SCRIPT_DIR/persistence.mjs" \
  "$SCRIPT_DIR/migrate.mjs" \
  "$SCRIPT_DIR/package.json" \
  "$SCRIPT_DIR/package-lock.json" \
  "$VPS:$REMOTE_DIR/"

echo "==> Installing dependencies & restarting service..."
ssh "$VPS" << 'EOF'
  cd ~/coldbrew-sync

  # Install Node.js if missing
  if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi

  npm ci --omit=dev

  # Create systemd service
  cat > /etc/systemd/system/coldbrew-sync.service << 'SERVICE'
[Unit]
Description=Coldbrew Sync Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/coldbrew-sync
ExecStart=/usr/bin/node main.mjs
Restart=always
RestartSec=5
Environment=PORT=4444

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable coldbrew-sync
  systemctl restart coldbrew-sync

  # Add Caddy reverse proxy (if not already present).
  # NOTE: This configures a single upstream on :4444. For multi-instance
  # horizontal scaling (sticky-by-room routing), see server/SCALING.md §2.
  if ! grep -q "coldbrew-api.brianle.dev" /etc/caddy/Caddyfile; then
    cat >> /etc/caddy/Caddyfile << 'CADDY'

coldbrew-api.brianle.dev {
    reverse_proxy localhost:4444
}
CADDY
    systemctl reload caddy
    echo "Caddy config added and reloaded"
  else
    echo "Caddy config already exists"
  fi

  sleep 2
  systemctl status coldbrew-sync --no-pager
EOF

echo ""
echo "==> Checking health..."
sleep 3
curl -sf "https://coldbrew-api.brianle.dev/health" 2>/dev/null \
  && echo "" \
  || echo "Not ready yet — check DNS and wait for Caddy to provision SSL."
echo ""
echo "==> Done! WebSocket server at wss://coldbrew-api.brianle.dev"
