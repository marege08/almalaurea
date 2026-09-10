# -*- coding: utf-8 -*-
"""Save the tidy dataset to SQLite.

Writes are idempotent: rerunning the harvester replaces existing rows instead
of duplicating them, using the composite primary key and INSERT OR REPLACE.
"""

import sqlite3

# Keep the column order used by INSERT as the single source of truth.
COLONNE = [
    "anno",
    "indagine",
    "definizione",
    "tipo_corso",
    "ateneo",
    "gruppo",
    "classe",
    "corso",
    "sezione",
    "categoria",
    "indicatore",
    "valore",
    "nota",
    "valore_raw",
    "numero_laureati",
    "numero_compilatori",
]

# `indagine` identifies the graduate profile survey or employment outcomes survey.
# `definizione` is '' for the graduate profile survey, and otherwise takes
# 'restrittiva', 'ampia', 'condivisa', or 'sconosciuta'. Include 'condivisa'
# in every query because those rows apply to both employment definitions.
# `tipo_corso` is '' for university- or group-level sheets.
# `ateneo` is '' on a group sheet; `gruppo` is '' on a university sheet.
# `corso` is '' on aggregate sheets and populated on course sheets.
# `categoria` is '' when an indicator has no category.
# `valore` is NULL when a cell contains a special symbol.
# `nota` records 'oscurato_meno_di_5', 'zero_casi', or 'non_disponibile'.
# `valore_raw` preserves the exact cell text supplied by AlmaLaurea.
SCHEMA = """
CREATE TABLE IF NOT EXISTS dati (
    anno               TEXT    NOT NULL,
    indagine           TEXT    NOT NULL,   -- profilo / occupazione
    -- Solo per l'indagine 'occupazione': la scheda contiene DUE volte le stesse
    -- sezioni, una per definizione ufficiale di "occupato" (restrittiva e
    -- ampia/ISTAT-Forze di Lavoro). Senza questa colonna avrebbero la stessa
    -- chiave primaria e una sovrascriverebbe l'altra in silenzio.
    -- '' su 'profilo', dove il problema non esiste.
    -- 'condivisa' quando il blocco NON e' doppiato nella pagina (e' il caso di
    -- "2b. Formazione post-laurea"): quel dato vale per entrambe le
    -- definizioni, ed e' diverso da '' — li' la domanda non si pone proprio,
    -- qui si pone e la risposta e' "tutt'e due". Chi interroga deve includerlo
    -- SEMPRE, qualunque definizione l'utente abbia scelto.
    definizione        TEXT    NOT NULL,   -- '' | restrittiva | ampia | condivisa | sconosciuta
    tipo_corso         TEXT    NOT NULL,   -- '' = casella spenta (livello ateneo/gruppo)
    ateneo             TEXT    NOT NULL,   -- '' su una scheda-gruppo
    gruppo             TEXT    NOT NULL,   -- '' su una scheda-ateneo
    classe             TEXT    NOT NULL,
    corso              TEXT    NOT NULL,   -- '' sugli aggregati, valorizzato sui corsi
    sezione            TEXT    NOT NULL,
    categoria          TEXT    NOT NULL,   -- '' = nessuna categoria
    indicatore         TEXT    NOT NULL,
    valore             REAL,               -- NULL quando la cella e' un simbolo speciale
    nota               TEXT,               -- oscurato_meno_di_5 / zero_casi / non_disponibile / ...
    valore_raw         TEXT    NOT NULL,   -- la cella esatta come l'ha scritta AlmaLaurea
    numero_laureati    INTEGER,
    numero_compilatori INTEGER,
    PRIMARY KEY (
        anno, indagine, definizione, tipo_corso, ateneo, gruppo, classe, corso,
        sezione, categoria, indicatore
    )
);
"""


def apri_db(path):
    """Open or create a database, ensure its schema, and return the connection.

    Args:
        path: SQLite database path.

    Returns:
        An open SQLite connection.
    """
    conn = sqlite3.connect(path)
    conn.execute(SCHEMA)
    conn.commit()
    return conn


# Rows from one sheet share these fields, which identify the sheet.
# ``definizione`` is intentionally excluded despite being part of the primary
# key: an occupation sheet contains both definitions, and including it here
# would delete only half the sheet on rerun.
CHIAVI_SCHEDA = [
    "anno",
    "indagine",
    "tipo_corso",
    "ateneo",
    "gruppo",
    "classe",
    "corso",
]


def salva_righe(conn, righe):
    """Replace one sheet's rows and return the number of rows written.

    Existing rows for the sheet are deleted before insertion, so rerunning
    also removes rows that should no longer exist, such as parser artefacts,
    rather than merely updating matching rows.

    Args:
        conn: Open SQLite connection.
        righe: Tidy rows belonging to one sheet.

    Returns:
        The number of rows written, or zero for an empty input.
    """
    if not righe:
        return 0

    # All rows share the sheet identity, which can be read from the first row.
    ident = righe[0]
    where = " AND ".join(f"{c} = ?" for c in CHIAVI_SCHEDA)
    conn.execute(
        f"DELETE FROM dati WHERE {where}",
        tuple(ident[c] for c in CHIAVI_SCHEDA),
    )

    segnaposto = ",".join("?" * len(COLONNE))
    sql = f"INSERT OR REPLACE INTO dati ({','.join(COLONNE)}) VALUES ({segnaposto})"
    dati = [tuple(r.get(c) for c in COLONNE) for r in righe]
    conn.executemany(sql, dati)
    conn.commit()
    return len(righe)
