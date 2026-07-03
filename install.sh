#!/usr/bin/env bash
#
# Satu perintah deploy WDP Sheet ke VPS baru (Ubuntu/Debian).
#
#   curl -fsSL https://raw.githubusercontent.com/asepmaries/warwars/main/install.sh | bash
#
set -euo pipefail

export WDP_REPO_URL="${WDP_REPO_URL:-https://github.com/asepmaries/warwars.git}"
export WDP_INSTALL_DIR="${WDP_INSTALL_DIR:-/war}"
export WDP_PORT="${WDP_PORT:-8080}"
export WDP_HOST="${WDP_HOST:-0.0.0.0}"

curl -fsSL https://raw.githubusercontent.com/asepmaries/warwars/main/deploy-vps.sh | bash