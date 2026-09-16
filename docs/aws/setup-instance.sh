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
dnf install -y -q git tar gzip xz libatomic >/dev/null

# Node 22 from the official tarball: AL2023 ships nodejs20 at most, and Next.js 16
# wants >=20.9. Pinning the major version avoids distro-alternatives ambiguity.
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null)" != v22* ]]; then
  BASE=https://nodejs.org/dist/latest-v22.x
  FILE=$(curl -fsSL "$BASE/" | grep -oE 'node-v22\.[0-9.]+-linux-arm64\.tar\.xz' | head -1)
  echo "[+] installing $FILE"
  curl -fsSL "$BASE/$FILE" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /opt
  rm -rf /opt/node22 && mv "/opt/${FILE%.tar.xz}" /opt/node22
  for b in node npm npx; do ln -sf "/opt/node22/bin/$b" "/usr/local/bin/$b"; done
  rm -f /tmp/node.tar.xz
fi
echo "[=] node $(node -v) at $(command -v node), npm $(npm -v)"

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
git config --global --add safe.directory "$APPDIR" 2>/dev/null || true
if [[ -d "$APPDIR/.git" ]]; then
  git -C "$APPDIR" fetch --depth 1 origin main -q && git -C "$APPDIR" reset --hard origin/main -q
  echo "[=] repo updated to $(git -C "$APPDIR" rev-parse --short HEAD)"
else
  git clone --depth 1 "$REPO" "$APPDIR" -q
  echo "[+] repo cloned at $(git -C "$APPDIR" rev-parse --short HEAD)"
fi

# ---- build -----------------------------------------------------------------
cd "$APPDIR/app"

# pnpm pinned to the repo's packageManager field, so pnpm doesn't auto-fetch a
# different binary from its store (that path needed extra shared libs on ARM).
PNPM_PIN=$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' package.json)
PNPM_PIN=${PNPM_PIN:-11.1.1}
if [[ "$(pnpm -v 2>/dev/null)" != "$PNPM_PIN" ]]; then
  npm uninstall -g pnpm >/dev/null 2>&1 || true
  npm install -g "pnpm@$PNPM_PIN" >/dev/null 2>&1
  ln -sf /opt/node22/bin/pnpm /usr/local/bin/pnpm 2>/dev/null || true
fi
echo "[=] pnpm $(pnpm -v) (repo pin $PNPM_PIN)"

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

# ---- caddy service unit (binary install has no unit of its own) ------------
cat >/etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy web server
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
Environment=HOME=/var/lib/caddy
Environment=XDG_CONFIG_HOME=/var/lib/caddy/.config
Environment=XDG_DATA_HOME=/var/lib/caddy/.local/share
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
chown -R caddy:caddy /etc/caddy /var/lib/caddy

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
systemctl enable -q surety caddy
# `enable --now` does NOT restart an already-running unit — without an explicit
# restart the previous build keeps serving. Restart the app; reload Caddy.
systemctl restart surety
systemctl reload-or-restart caddy
sleep 6
echo "=== status ==="
systemctl is-active surety caddy
echo "=== local check ==="
curl -s -o /dev/null -w "app:%{http_code}\n" http://127.0.0.1:3207/ || true
curl -s -o /dev/null -w "caddy:%{http_code}\n" http://127.0.0.1:80/ || true
echo "=== done ==="
