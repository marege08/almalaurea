#!/usr/bin/env bash
# sync-db.sh — allinea la copia servita del database al master.
#
# Un solo database e' la fonte di verita': data/almalaurea.sqlite,
# prodotto dall'harvester di Fase 0. frontend/public/almalaurea.sqlite
# e' solo la COPIA servita al browser (l'hosting statico serve la
# cartella public/, quindi il file deve stare fisicamente li').
#
# Dopo ogni aggiornamento del dataset (nuovo run dell'harvester),
# lancia questo script per rinfrescare la copia servita. Non modificare
# mai a mano la copia in public/: verrebbe sovrascritta da qui.
set -euo pipefail
CARTELLA_PROGETTO="$(cd "$(dirname "$0")/.." && pwd)"
MASTER="$CARTELLA_PROGETTO/data/almalaurea.sqlite"
COPIA="$CARTELLA_PROGETTO/frontend/public/almalaurea.sqlite"
if [[ ! -f "$MASTER" ]]; then
  echo "ERRORE: manca il master $MASTER" >&2; exit 1
fi
cp -f "$MASTER" "$COPIA"
echo "Sync fatto: data/almalaurea.sqlite -> frontend/public/almalaurea.sqlite"
