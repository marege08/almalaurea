#!/usr/bin/env bash
# serve.sh — avvia un server statico locale per vedere l'app nel browser.
#
# L'app usa moduli ES e fa fetch del database: NON funziona aprendo
# index.html con doppio click (file://). Serve un server http vero,
# anche solo locale. Questo lo avvia sulla cartella pubblicata.
#
# Uso:  ./tools/serve.sh          (porta 8000)
#       ./tools/serve.sh 8080     (porta a scelta)
# Poi apri l'indirizzo stampato nel browser. Ctrl+C per fermarlo.
set -euo pipefail
PORTA="${1:-8000}"
CARTELLA_PROGETTO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$CARTELLA_PROGETTO/frontend/public"
echo "Server avviato. Apri:  http://localhost:$PORTA"
echo "(Ctrl+C per fermare)"
exec python3 -m http.server "$PORTA"
