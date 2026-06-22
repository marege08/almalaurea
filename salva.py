# -*- coding: utf-8 -*-
"""Salvataggio del dataset tidy su SQLite.
Scrittura idempotente: rilanciare l'harvester riscrive le righe gia' presenti,
non le duplica (grazie alla chiave primaria composita + INSERT OR REPLACE)."""

import sqlite3

# Ordine delle colonne: lo stesso usato per l'INSERT, cosi' resta una sola
# fonte di verita' sull'ordine.
COLONNE = [
    "anno",
    "indagine",
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

SCHEMA = """
CREATE TABLE IF NOT EXISTS dati (
    anno               TEXT    NOT NULL,
    indagine           TEXT    NOT NULL,   -- profilo / occupazione
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
        anno, indagine, tipo_corso, ateneo, gruppo, classe, corso,
        sezione, categoria, indicatore
    )
);
"""


def apri_db(path):
    """Apre (o crea) il database e assicura lo schema. Ritorna la connessione."""
    conn = sqlite3.connect(path)
    conn.execute(SCHEMA)
    conn.commit()
    return conn


def salva_righe(conn, righe):
    """Inserisce/aggiorna le righe di UNA scheda. Idempotente.
    Ritorna quante righe sono state passate (per controllo a valle)."""
    if not righe:
        return 0
    segnaposto = ",".join("?" * len(COLONNE))
    sql = f"INSERT OR REPLACE INTO dati ({','.join(COLONNE)}) VALUES ({segnaposto})"
    dati = [tuple(r.get(c) for c in COLONNE) for r in righe]
    conn.executemany(sql, dati)
    conn.commit()
    return len(righe)
