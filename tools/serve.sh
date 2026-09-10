#!/usr/bin/env bash
# serve.sh — start a local static server for viewing the app in a browser.
#
# The app uses ES modules and fetches the database: it does NOT work when
# index.html is opened by double-clicking (file://). A real HTTP server is
# required, even if it is local. This starts one for the published directory.
#
# Usage:  ./tools/serve.sh          (port 8000)
#         ./tools/serve.sh 8080     (custom port)
# Then open the printed address in a browser. Press Ctrl+C to stop it.
set -euo pipefail
PORTA="${1:-8000}"
CARTELLA_PROGETTO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$CARTELLA_PROGETTO/frontend/public"
echo "Server avviato. Apri:  http://localhost:$PORTA"
echo "(Ctrl+C per fermare)"
exec python3 -m http.server "$PORTA"
