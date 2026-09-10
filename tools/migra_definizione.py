# -*- coding: utf-8 -*-
"""Migrate the data table by adding the `definizione` column.

WHY IT IS NEEDED: `occupazione` employment outcomes survey sheets contain the same sections
TWICE, once for each official definition of "occupato" (restrictive and
broad/ISTAT-Forze di Lavoro). Their section, category, and indicator are
identical: without a column distinguishing them, they would have the same
primary key and one would silently overwrite the other, leaving an employment
rate whose definition could no longer be identified.

SQLite cannot modify a primary key: the only option is to recreate the table
and transfer the data. The migration is idempotent (if the column already
exists, it does nothing) and checks the row count before dropping the old
table.

Existing rows (`profilo` graduate profile survey) receive definizione = '', the same convention
already used by the schema for a field to which the definition does not apply.

USAGE:
    python3 tools/migra_definizione.py            # migrates
    python3 tools/migra_definizione.py --check    # only reports whether needed
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

# The `definizione` column takes '', 'restrittiva', or 'ampia'.
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
    """Return the column names reported by SQLite for a table.

    Args:
        conn: Open SQLite connection.
        tabella: Table whose columns should be inspected.

    Returns:
        A list of column names in SQLite's reported order.
    """
    return [r[1] for r in conn.execute(f"PRAGMA table_info({tabella})")]


def main():
    """Parse arguments and migrate the database when required."""
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

        # Create a safety copy before rewriting because the table is recreated.
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
