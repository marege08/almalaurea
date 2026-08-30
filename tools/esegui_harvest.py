# -*- coding: utf-8 -*-
"""Esegue l'harvest degli aggregati: per ogni selezione scarica la scheda,
la monta in righe tidy e la salva su SQLite. Resiliente e ri-eseguibile.

Si lancia da QUALUNQUE cartella:  python3 tools/esegui_harvest.py
Tutti i percorsi sono calcolati dalla radice del repository, mai dalla
cartella corrente."""

import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent

# I moduli del progetto vivono in due cartelle diverse (tools/ e backend/src/)
# e si importano fra loro per nome. Senza queste due righe l'harvest muore
# all'import con ModuleNotFoundError, da qualunque cartella lo lanci.
for _cartella in (RADICE / "tools", RADICE / "backend" / "src"):
    if str(_cartella) not in sys.path:
        sys.path.insert(0, str(_cartella))

from salva import apri_db, salva_righe  # noqa: E402  (dopo il fix di sys.path)
from scarica import raccogli_scheda, scarica_scheda  # noqa: E402

PAUSA_SECONDI = 1.0

# IL database del sito, non una copia: e' il file che il frontend carica e che
# il deploy pubblica. Quando questo percorso era relativo alla cartella
# corrente, un harvest scriveva un file che nessuno leggeva e il sito
# continuava a servire i dati vecchi, senza un solo messaggio d'errore.
DB_PATH = RADICE / "frontend" / "public" / "almalaurea.sqlite"

# Le copie di sicurezza NON stanno in frontend/public: quella cartella viene
# pubblicata per intero, ci finirebbero online.
CARTELLA_BACKUP = RADICE / "backend" / "backup-db"


def fai_copia_di_sicurezza(db_path):
    """Copia il database prima di riscriverlo. Un harvest interrotto a meta'
    lascia un misto di schede nuove e vecchie: con la copia si torna indietro.
    Ritorna il percorso della copia, o None se non c'era nulla da copiare."""
    db_path = Path(db_path)
    if not db_path.exists():
        return None
    CARTELLA_BACKUP.mkdir(parents=True, exist_ok=True)
    marca = datetime.now().strftime("%Y%m%d-%H%M%S")
    destinazione = CARTELLA_BACKUP / f"{db_path.stem}-{marca}{db_path.suffix}"
    shutil.copy2(db_path, destinazione)
    return destinazione


def etichetta_di(combo):
    """Etichetta leggibile per i log, dall'involucro prodotto da harvest.py.
    Include l'indagine: le due convivono nello stesso database, e un log che
    non dice quale stai scaricando e' un log che non serve a niente."""
    indagine = combo["params"].get("CONFIG", "?")
    return f"{indagine}/{combo['livello']}={combo['codice']}"


def esegui(combinazioni, db_path=DB_PATH, pausa=PAUSA_SECONDI):
    """Scarica e salva tutte le combinazioni. Ogni combinazione e' l'involucro
    prodotto da genera_combinazioni(): {'livello', 'codice', 'params'}, dove
    'params' sono i parametri piatti da passare a visualizza.php.
    Ritorna la lista dei falliti (combo, errore), cosi' puoi ri-eseguire solo quelli."""
    copia = fai_copia_di_sicurezza(db_path)
    if copia:
        print(f"Copia di sicurezza del database: {copia.relative_to(RADICE)}")
    print(f"Scrivo su: {Path(db_path).relative_to(RADICE)}\n")

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
    # Le 93 selezioni aggregate vengono da backend/src/harvest.py.
    from harvest import INDAGINI, genera_combinazioni

    # Quale indagine scaricare. Le due convivono nello stesso database: la
    # colonna `indagine` le tiene separate, quindi scaricarne una non tocca
    # le righe dell'altra.
    #   python3 tools/esegui_harvest.py              -> profilo (default)
    #   python3 tools/esegui_harvest.py occupazione  -> esiti occupazionali
    indagine = sys.argv[1] if len(sys.argv) > 1 else "profilo"
    if indagine not in INDAGINI:
        sys.exit(f"Indagine sconosciuta: {indagine!r}. Attese: {', '.join(INDAGINI)}")

    combinazioni = list(genera_combinazioni(config=indagine))
    print(f"Indagine: {indagine}")
    print(f"Combinazioni da scaricare: {len(combinazioni)}\n")
    esegui(combinazioni)
    print(
        "\nDati aggiornati. Ora rigenera i file derivati, altrimenti la UI resta\n"
        "disallineata dal database:\n"
        "    python3 tools/genera_config_filtri.py\n"
        "    python3 tools/genera_nomi.py\n"
        "Poi controlla con ./tools/serve.sh e fai commit+push (il push pubblica)."
    )
