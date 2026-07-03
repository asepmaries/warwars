#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "WDP Sheet Server (dev): http://0.0.0.0:${PORT}"
echo "Menu:  http://127.0.0.1:${PORT}/"
echo "Sheet: http://127.0.0.1:${PORT}/sheet"
echo "Production VPS: gunakan ./deploy-pm2.sh"
exec php -S "0.0.0.0:${PORT}" router.php