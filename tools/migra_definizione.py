# -*- coding: utf-8 -*-
"""Migrazione: aggiunge la colonna `definizione` alla tabella dati.

PERCHE' SERVE: le schede dell'indagine `occupazione` contengono DUE volte le
stesse sezioni, una per ciascuna definizione ufficiale di "occupato"
(restrittiva e ampia/ISTAT-Forze di Lavoro). Hanno sezione, categoria e
indicatore identici: senza una colonna che le distingua avrebbero la stessa
chiave primaria e una sovrascriverebbe l'altra in silenzio, lasciando in
database un tasso di occupazione di cui non si sa piu' quale definizione sia.

SQLite non sa modificare una chiave primaria: l'unica strada e' ricreare la
tabella e travasare. La migrazione e' idempotente (se la colonna c'e' gia',
non fa nulla) e verifica il conteggio righe prima di buttare la vecchia.

Le righe esistenti (indagine 'profilo') prendono definizione = '', che e' la
stessa convenzione gia' usata dallo schema per "casella spenta".

USO:
    python3 tools/migra_definizione.py            # migra
    python3 tools/migra_definizione.py --check    # dice solo se serve
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
DB = RADICE / "frontend" / "public" / "almalaurea.sqlite"
CARTELLA_BACKUP = RADICE / "backend" / "backup-db"

SCHEMA_NUOVO = """
CREATE TABLE dati_migrata (
    anno               TEXT    NOT NULL,
    indagine           TEXT    NOT NULL,   -- profilo / occupazione
    definizione        TEXT    NOT NULL,   -- '' | restrittiva | ampia (solo occupazione)
    tipo_corso         TEXT    NOT NULL,
    ateneo             TEXT    NOT NULL,
    gruppo             TEXT    NOT NULL,
    classe             TEXT    NOT NULL,
    corso              TEXT    NOT NULL,
    sezione            TEXT    NOT NULL,
    categoria          TEXT    NOT NULL,
    indicatore         TEXT    NOT NULL,
    valore             REAL,
    nota               TEXT,
    valore_raw         TEXT    NOT NULL,
    numero_laureati    INTEGER,
    numero_compilatori INTEGER,
    PRIMARY KEY (
        anno, indagine, definizione, tipo_corso, ateneo, gruppo, classe, corso,
        sezione, categoria, indicatore
    )
);
"""

TRAVASO = """
INSERT INTO dati_migrata (
    anno, indagine, definizione, tipo_corso, ateneo, gruppo, classe, corso,
    sezione, categoria, indicatore, valore, nota, valore_raw,
    numero_laureati, numero_compilatori
)
SELECT
    anno, indagine, '', tipo_corso, ateneo, gruppo, classe, corso,
    sezione, categoria, indicatore, valore, nota, valore_raw,
    numero_laureati, numero_compilatori
FROM dati;
"""


def colonne_di(conn, tabella):
    return [r[1] for r in conn.execute(f"PRAGMA table_info({tabella})")]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="non modifica nulla: esce 1 se la migrazione serve ancora")
    argomenti = parser.parse_args()

    if not DB.exists():
        sys.exit(f"Database non trovato: {DB}")

    conn = sqlite3.connect(DB)
    try:
        colonne = colonne_di(conn, "dati")
        if "definizione" in colonne:
            print("Gia' migrato: la colonna `definizione` c'e' gia'. Niente da fare.")
            return 0
        righe_prima = conn.execute("SELECT COUNT(*) FROM dati").fetchone()[0]
        print(f"Colonna `definizione` assente. Righe attuali: {righe_prima:,}")
        if argomenti.check:
            print("DA MIGRARE.")
            return 1

        # Copia di sicurezza prima di riscrivere: la tabella viene ricreata.
        CARTELLA_BACKUP.mkdir(parents=True, exist_ok=True)
        marca = datetime.now().strftime("%Y%m%d-%H%M%S")
        copia = CARTELLA_BACKUP / f"almalaurea-pre-definizione-{marca}.sqlite"
        shutil.copy2(DB, copia)
        print(f"Copia di sicurezza: {copia.relative_to(RADICE)}")

        conn.execute("BEGIN")
        conn.execute("DROP TABLE IF EXISTS dati_migrata")
        conn.executescript(SCHEMA_NUOVO)
        conn.execute(TRAVASO)

        righe_dopo = conn.execute("SELECT COUNT(*) FROM dati_migrata").fetchone()[0]
        if righe_dopo != righe_prima:
            conn.execute("ROLLBACK")
            sys.exit(
                f"ANNULLATA: travasate {righe_dopo:,} righe su {righe_prima:,}. "
                "Il database non e' stato modificato."
            )

        conn.execute("DROP TABLE dati")
        conn.execute("ALTER TABLE dati_migrata RENAME TO dati")
        conn.execute("COMMIT")
        conn.execute("VACUUM")

        finali = conn.execute("SELECT COUNT(*) FROM dati").fetchone()[0]
        print(f"Migrato: {finali:,} righe, colonna `definizione` = '' su tutte le righe esistenti.")
        print(f"Colonne ora: {colonne_di(conn, 'dati')}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
