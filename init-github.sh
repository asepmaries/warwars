#!/usr/bin/env bash
# Siapkan folder wdp untuk push ke GitHub repo baru.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f package.json ]]; then
  echo "Jalankan dari folder wdp/"
  exit 1
fi

echo "Install dependencies..."
npm install --omit=dev

echo ""
echo "Langkah push ke GitHub:"
echo "  1. Buat repo baru di GitHub (mis: wdp-sheet)"
echo "  2. git init"
echo "  3. git add ."
echo "  4. git commit -m 'Initial WDP Sheet API'"
echo "  5. git remote add origin https://github.com/USER/wdp-sheet.git"
echo "  6. git branch -M main && git push -u origin main"
echo ""
echo "Deploy di VPS (sekali jalan):"
echo "  WDP_REPO_URL=https://github.com/USER/wdp-sheet.git ./deploy-vps.sh"