#!/usr/bin/env bash
# Surety instance setup — run ON the EC2 instance (via SSM).
# Idempotent. Installs Node 22, pnpm, Caddy; clones the app; builds; runs as a
# dedicated unprivileged user behind Caddy. Secrets come from /etc/surety/env
# (created separately, root-owned 0600) — never from this script or the repo.
set -euo pipefail

REPO="${REPO:-https://github.com/PhiBao/surety.git}"
APPDIR=/srv/surety
ENVFILE=/etc/surety/env
DATADIR=/var/lib/surety
SVC_USER=surety
PORT=3207

echo "=== surety instance setup $(date -u +%FT%TZ) ==="

# ---- swap (build headroom on a 2 GB instance) ------------------------------
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "[+] 2G swap enabled"
else
  echo "[=] swap already present"
fi

# ---- packages --------------------------------------------------------------
dnf install -y -q git tar gzip >/dev/null
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null)" != v22* ]]; then
  dnf install -y -q nodejs22 npm >/dev/null 2>&1 || dnf install -y -q nodejs npm >/dev/null
fi
echo "[=] node $(node -v), npm $(npm -v)"
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm >/dev/null 2>&1
echo "[=] pnpm $(pnpm -v)"

# ---- caddy (static arm64 binary, no repo needed) ---------------------------
if ! command -v caddy >/dev/null 2>&1; then
  VER=$(curl -fsSL https://api.github.com/repos/caddyserver/caddy/releases/latest \
        | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1)
  echo "[+] installing caddy v$VER"
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${VER}/caddy_${VER}_linux_arm64.tar.gz" \
    -o /tmp/caddy.tgz
  tar -xzf /tmp/caddy.tgz -C /tmp caddy && install -m 0755 /tmp/caddy /usr/local/bin/caddy
  rm -f /tmp/caddy.tgz /tmp/caddy
  id -u caddy >/dev/null 2>&1 || useradd --system --home /var/lib/caddy --shell /usr/sbin/nologin caddy
  mkdir -p /etc/caddy /var/lib/caddy
fi
echo "[=] caddy $(caddy version | head -1)"

# ---- unprivileged service user + dirs --------------------------------------
id -u "$SVC_USER" >/dev/null 2>&1 || useradd --system --home "$APPDIR" --shell /usr/sbin/nologin "$SVC_USER"
mkdir -p "$DATADIR" "$APPDIR"

# ---- code ------------------------------------------------------------------
if [[ -d "$APPDIR/.git" ]]; then
  git -C "$APPDIR" fetch --depth 1 origin main -q && git -C "$APPDIR" reset --hard origin/main -q
  echo "[=] repo updated to $(git -C "$APPDIR" rev-parse --short HEAD)"
else
  git clone --depth 1 "$REPO" "$APPDIR" -q
  echo "[+] repo cloned at $(git -C "$APPDIR" rev-parse --short HEAD)"
fi

# ---- build -----------------------------------------------------------------
cd "$APPDIR/app"
pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null
pnpm build 2>&1 | tail -4

chown -R "$SVC_USER":"$SVC_USER" "$APPDIR" "$DATADIR"
chmod 755 /srv /srv/surety

# ---- app service -----------------------------------------------------------
cat >/etc/systemd/system/surety.service <<EOF
[Unit]
Description=Surety — bonded agent-work demo
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SVC_USER
WorkingDirectory=$APPDIR/app
EnvironmentFile=-$ENVFILE
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=SURETY_DATA_DIR=$DATADIR
ExecStart=$APPDIR/app/node_modules/.bin/next start -p $PORT
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$DATADIR

[Install]
WantedBy=multi-user.target
EOF

# ---- caddy (HTTP now; TLS added once the domain is set) --------------------
if [[ ! -f /etc/caddy/Caddyfile ]]; then
  cat >/etc/caddy/Caddyfile <<'EOF'
:80 {
	encode gzip
	reverse_proxy 127.0.0.1:3207
}
EOF
fi

systemctl daemon-reload
systemctl enable -q --now surety
systemctl enable -q --now caddy
sleep 6
echo "=== status ==="
systemctl is-active surety caddy
echo "=== local check ==="
curl -s -o /dev/null -w "app:%{http_code}\n" http://127.0.0.1:3207/ || true
curl -s -o /dev/null -w "caddy:%{http_code}\n" http://127.0.0.1:80/ || true
echo "=== done ==="
