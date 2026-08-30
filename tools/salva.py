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
    """Apre (o crea) il database e assicura lo schema. Ritorna la connessione."""
    conn = sqlite3.connect(path)
    conn.execute(SCHEMA)
    conn.commit()
    return conn


# Le righe di UNA scheda condividono questi campi: sono l'identita' della scheda.
# NOTA: `definizione` NON va qui, pur essendo nella chiave primaria. Una singola
# scheda 'occupazione' porta righe di ENTRAMBE le definizioni: metterla fra le
# chiavi-scheda farebbe cancellare solo meta' della scheda a ogni ri-esecuzione.
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
    """Inserisce le righe di UNA scheda, sostituendola per intero.
    Prima cancella le righe gia' presenti per quella scheda, poi reinserisce:
    cosi' ri-eseguire rimuove anche le righe che non devono piu' esistere
    (es. spazzatura di una versione buggata del parser), non solo aggiorna.
    Ritorna quante righe sono state scritte."""
    if not righe:
        return 0

    # Tutte le righe condividono l'identita' della scheda: la prendo dalla prima.
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
