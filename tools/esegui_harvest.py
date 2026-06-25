# -*- coding: utf-8 -*-
"""Esegue l'harvest degli aggregati: per ogni selezione scarica la scheda,
la monta in righe tidy e la salva su SQLite. Resiliente e ri-eseguibile."""

import time

from salva import apri_db, salva_righe
from scarica import raccogli_scheda, scarica_scheda

PAUSA_SECONDI = 1.0
DB_PATH = "almalaurea.sqlite"


def etichetta_di(combo):
    """Etichetta leggibile per i log, dall'involucro prodotto da harvest.py."""
    return f"{combo['livello']}={combo['codice']}"


def esegui(combinazioni, db_path=DB_PATH, pausa=PAUSA_SECONDI):
    """Scarica e salva tutte le combinazioni. Ogni combinazione e' l'involucro
    prodotto da genera_combinazioni(): {'livello', 'codice', 'params'}, dove
    'params' sono i parametri piatti da passare a visualizza.php.
    Ritorna la lista dei falliti (combo, errore), cosi' puoi ri-eseguire solo quelli."""
    conn = apri_db(db_path)
    falliti = []
    combinazioni = list(combinazioni)
    totale = len(combinazioni)

    try:
        for n, combo in enumerate(combinazioni, start=1):
            params = combo["params"]  # i parametri piatti per visualizza.php
            etichetta = etichetta_di(combo)
            try:
                html = scarica_scheda(params)
                righe = raccogli_scheda(html, params)
                n_salvate = salva_righe(conn, righe)
                print(f"[{n}/{totale}] OK  {etichetta}  ({n_salvate} righe)")
            except (
                Exception
            ) as e:  # rete, sito lento, struttura inattesa: non fermo tutto
                print(f"[{n}/{totale}] FALLITO  {etichetta}  -> {e}")
                falliti.append((combo, str(e)))
            time.sleep(pausa)  # frequenza educata

        # Rete di sicurezza su TUTTO il dataset: celle dal formato inatteso.
        # Su 93 schede mai ispezionate, e' il modo di scoprire una sorpresa di
        # struttura senza guardarle a mano.
        rossi = conn.execute(
            "SELECT sezione, indicatore, valore_raw FROM dati "
            "WHERE nota = 'non_riconosciuto' LIMIT 10"
        ).fetchall()
        n_rossi = conn.execute(
            "SELECT COUNT(*) FROM dati WHERE nota = 'non_riconosciuto'"
        ).fetchone()[0]
    finally:
        conn.close()  # chiude anche se interrompi con Ctrl-C: il committato resta

    print(f"\nFatto. {totale - len(falliti)}/{totale} schede salvate.")
    print(f"Valori non riconosciuti su tutto il dataset (attesi 0): {n_rossi}")
    for sez, ind, raw in rossi:
        print(f"  - {sez} / {ind} = {raw!r}")
    if falliti:
        print(f"Falliti ({len(falliti)}): ", [etichetta_di(c) for c, _ in falliti])
        print(
            "Rilancia l'harvester (o solo questi) quando vuoi: la riscrittura e' sicura."
        )
    return falliti


if __name__ == "__main__":
    # Le 93 selezioni aggregate vengono dalla tua harvest.py.
    from harvest import genera_combinazioni

    combinazioni = list(genera_combinazioni())
    print(f"Combinazioni da scaricare: {len(combinazioni)}\n")
    esegui(combinazioni)
