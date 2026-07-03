#!/usr/bin/env bash
#
# Deploy WDP Sheet API ke VPS — sekali jalan.
#
# VPS baru (satu perintah):
#   curl -fsSL https://raw.githubusercontent.com/asepmaries/warwars/main/install.sh | bash
#
# Atau manual:
#   curl -fsSL https://raw.githubusercontent.com/asepmaries/warwars/main/deploy-vps.sh | bash
#
set -euo pipefail

PORT="${WDP_PORT:-8080}"
HOST="${WDP_HOST:-0.0.0.0}"
REPO_URL="${WDP_REPO_URL:-https://github.com/asepmaries/warwars.git}"
INSTALL_DIR="${WDP_INSTALL_DIR:-/war}"
SOURCE_PATH="${1:-}"

log() { echo "[wdp-deploy] $*"; }
die() { echo "[wdp-deploy] ERROR: $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Perintah '$1' tidak ditemukan"
}

install_node_if_missing() {
  if command -v node >/dev/null 2>&1; then
    log "Node.js: $(node -v)"
    return
  fi
  log "Node.js belum ada, mencoba install via NodeSource (Ubuntu/Debian)..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    die "Install Node.js 18+ manual lalu jalankan ulang script ini"
  fi
}

install_pm2_if_missing() {
  if command -v pm2 >/dev/null 2>&1; then
    log "PM2: $(pm2 -v)"
    return
  fi
  log "Install PM2 global..."
  sudo npm install -g pm2
}

prepare_source() {
  if [[ -n "$SOURCE_PATH" ]]; then
    INSTALL_DIR="$(cd "$SOURCE_PATH" && pwd)"
    log "Menggunakan folder lokal: $INSTALL_DIR"
    return
  fi

  if [[ -z "$REPO_URL" ]]; then
    if [[ -f "$(dirname "$0")/package.json" ]]; then
      INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
      log "Menggunakan folder script: $INSTALL_DIR"
      return
    fi
    die "Set WDP_REPO_URL atau jalankan install.sh"
  fi

  need_cmd git
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Git pull di $INSTALL_DIR"
    git -C "$INSTALL_DIR" pull --ff-only
  elif [[ -d "$INSTALL_DIR" ]]; then
    log "Folder $INSTALL_DIR ada tanpa git, clone ulang..."
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
  else
    log "Git clone $REPO_URL -> $INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
}

setup_pm2_boot() {
  if ! systemctl is-enabled pm2-root >/dev/null 2>&1; then
    pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
  fi
  pm2 save >/dev/null 2>&1 || true
  log "PM2 auto-start boot: aktif"
}

detect_public_ip() {
  curl -fsS --max-time 3 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "IP_VPS"
}

main() {
  need_cmd curl
  install_node_if_missing
  install_pm2_if_missing
  prepare_source

  cd "$INSTALL_DIR"
  mkdir -p data logs files

  log "npm install --production"
  npm install --omit=dev

  chmod +x deploy-vps.sh 2>/dev/null || true

  export WDP_PORT="$PORT"
  export WDP_HOST="$HOST"

  pm2 delete wdp-sheet 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
  setup_pm2_boot

  PUBLIC_IP="$(detect_public_ip)"

  echo ""
  echo "========================================"
  echo " WDP Sheet siap"
  echo "========================================"
  echo " Folder : $INSTALL_DIR"
  echo " Sheet  : http://${PUBLIC_IP}:${PORT}/sheet"
  echo " API    : http://${PUBLIC_IP}:${PORT}/api/meta"
  echo " Health : http://${PUBLIC_IP}:${PORT}/health"
  echo ""
  echo "Update nanti (satu perintah):"
  echo "  curl -fsSL https://raw.githubusercontent.com/asepmaries/warwars/main/install.sh | bash"
  echo ""
  echo "PM2:"
  echo "  pm2 status wdp-sheet"
  echo "  pm2 logs wdp-sheet"
  echo "  pm2 restart wdp-sheet"
  echo "========================================"
}

main "$@"