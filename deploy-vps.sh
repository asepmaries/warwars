#!/usr/bin/env bash
#
# Deploy WDP Sheet API ke VPS — sekali jalan.
#
# Contoh:
#   WDP_REPO_URL=https://github.com/USER/wdp-sheet.git ./deploy-vps.sh
#   ./deploy-vps.sh /path/to/existing/wdp-folder
#
set -euo pipefail

PORT="${WDP_PORT:-8080}"
HOST="${WDP_HOST:-0.0.0.0}"
REPO_URL="${WDP_REPO_URL:-}"
INSTALL_DIR="${WDP_INSTALL_DIR:-$HOME/wdp-sheet}"
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
    die "Set WDP_REPO_URL atau jalankan: ./deploy-vps.sh /path/to/wdp"
  fi

  need_cmd git
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Git pull di $INSTALL_DIR"
    git -C "$INSTALL_DIR" pull --ff-only
  else
    log "Git clone $REPO_URL -> $INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
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

  chmod +x deploy-vps.sh controller.php 2>/dev/null || true
  chmod +x upload-data upload-hasil upload-limit wdp-meta 2>/dev/null || true

  export WDP_PORT="$PORT"
  export WDP_HOST="$HOST"

  pm2 delete wdp-sheet 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save

  echo ""
  echo "========================================"
  echo " WDP Sheet siap"
  echo "========================================"
  echo " Folder : $INSTALL_DIR"
  echo " API    : http://$HOST:$PORT"
  echo " Sheet  : http://$HOST:$PORT/sheet"
  echo " Health : http://$HOST:$PORT/health"
  echo ""
  echo "Upload via PHP controller:"
  echo "  cd $INSTALL_DIR"
  echo "  php controller.php"
  echo ""
  echo "PM2:"
  echo "  pm2 status wdp-sheet"
  echo "  pm2 logs wdp-sheet"
  echo "  pm2 restart wdp-sheet"
  echo ""
  echo "Auto-start boot (jalankan sekali):"
  echo "  pm2 startup && pm2 save"
  echo "========================================"
}

main "$@"