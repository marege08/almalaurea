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


def percorso_leggibile(percorso):
    """Il percorso accorciato rispetto alla radice del repository, quando ci
    sta dentro; altrimenti il percorso cosi' com'e'.

    Serve perche' --db accetta di proposito percorsi ASSOLUTI, anche fuori dal
    repository: li' `relative_to()` alza ValueError e farebbe morire l'harvest
    sulla riga di log, prima ancora di scaricare una sola scheda."""
    percorso = Path(percorso)
    try:
        return percorso.relative_to(RADICE)
    except ValueError:
        return percorso


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
        print(f"Copia di sicurezza del database: {percorso_leggibile(copia)}")
    print(f"Scrivo su: {percorso_leggibile(db_path)}\n")

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


def scopri_corsi(atenei, gruppi, filtro, config="profilo", pausa=PAUSA_SECONDI):
    """Chiede a solotendine.php quali corsi esistono davvero, ateneo per
    ateneo, e tiene quelli il cui nome contiene `filtro`.

    Ritorna {ateneo: [(gruppo, codice, nome), ...]}, pronto per genera_corsi().

    Un ateneo che non ha corsi in quel gruppo risponde con una tendina vuota,
    o con un errore HTTP: sono entrambi "non ho niente qui", non guasti, e
    non fermano la scoperta. Stessa lezione dell'incrocio ateneo x gruppo.

    Lo stesso corso puo' comparire in DUE gruppi (Bologna elenca "ingegneria
    e scienze informatiche" sia nel 10 che nel 12, con lo stesso codice):
    si tiene la prima occorrenza, cosi' non si scarica due volte la stessa
    scheda sotto due etichette diverse."""
    from harvest import params_tendine
    from scarica import leggi_tendine

    trovati = {}
    for ateneo in atenei:
        visti = set()
        for gruppo in gruppi:
            try:
                tendine = leggi_tendine(params_tendine(ateneo, gruppo, config=config))
            except Exception as e:  # 400/500 = combinazione inesistente
                print(f"  {ateneo}/gr.{gruppo}: tendine non disponibili ({e.__class__.__name__})")
                time.sleep(pausa)
                continue
            for codice, nome in tendine.get("postcorso", []):
                if filtro.lower() in nome.lower() and codice not in visti:
                    visti.add(codice)
                    trovati.setdefault(ateneo, []).append((gruppo, codice, nome))
                    print(f"  {ateneo}/gr.{gruppo}: {nome}  [{codice}]")
            time.sleep(pausa)
    return trovati


if __name__ == "__main__":
    # Le 93 selezioni aggregate vengono da backend/src/harvest.py.
    from harvest import INDAGINI, genera_combinazioni, genera_corsi, genera_incroci
    from harvest import ATENEI_INCROCIO

    # Quale indagine scaricare. Le due convivono nello stesso database: la
    # colonna `indagine` le tiene separate, quindi scaricarne una non tocca
    # le righe dell'altra.
    #   python3 tools/esegui_harvest.py              -> profilo (default)
    #   python3 tools/esegui_harvest.py occupazione  -> esiti occupazionali
    #
    # --incrocio scarica invece le schede ateneo x gruppo (informatica e
    # ingegneria nei singoli atenei), che le 93 aggregate non contengono.
    # Va SEMPRE accompagnato da --db: quelle righe sono un'indagine a parte,
    # non devono finire nel database che il sito pubblica finche' non decidiamo
    # che ci vanno.
    #   python3 tools/esegui_harvest.py occupazione --incrocio \
    #       --db backend/backup-db/incrocio.sqlite
    argomenti = sys.argv[1:]
    incrocio = "--incrocio" in argomenti
    if incrocio:
        argomenti.remove("--incrocio")

    # --corsi: livello CORSO (Fase 4). Scopre i corsi con solotendine.php e
    # scarica solo quelli il cui nome contiene --filtro. Come --incrocio,
    # pretende --db: sono righe di analisi, non un prodotto del sito.
    corsi = "--corsi" in argomenti
    if corsi:
        argomenti.remove("--corsi")

    filtro = "informatic"
    gruppi_corsi = ["12"]  # ingegneria industriale e dell'informazione
    for opzione, destinazione in (("--filtro", "filtro"), ("--gruppi", "gruppi")):
        if opzione in argomenti:
            i = argomenti.index(opzione)
            if i + 1 >= len(argomenti):
                sys.exit(f"{opzione} vuole un valore dopo di se'.")
            valore = argomenti[i + 1]
            if destinazione == "filtro":
                filtro = valore
            else:
                gruppi_corsi = [g.strip() for g in valore.split(",") if g.strip()]
            del argomenti[i : i + 2]

    db_path = DB_PATH
    if "--db" in argomenti:
        i = argomenti.index("--db")
        if i + 1 >= len(argomenti):
            sys.exit("--db vuole un percorso di file dopo di se'.")
        scelto = Path(argomenti[i + 1])
        db_path = scelto if scelto.is_absolute() else RADICE / scelto
        db_path.parent.mkdir(parents=True, exist_ok=True)
        del argomenti[i : i + 2]

    # Una svista qui riscriverebbe il database del sito con dati parziali, e
    # sarebbe una riga di log in mezzo a settantasei. Meglio fermarsi prima.
    if (incrocio or corsi) and db_path == DB_PATH:
        quale = "--incrocio" if incrocio else "--corsi"
        sys.exit(
            f"{quale} senza --db riscriverebbe il database pubblicato dal sito.\n"
            "Indica un file separato, es: --db backend/backup-db/incrocio.sqlite"
        )
    if incrocio and corsi:
        sys.exit("--incrocio e --corsi sono due livelli diversi: uno per volta.")

    indagine = argomenti[0] if argomenti else "profilo"
    if indagine not in INDAGINI:
        sys.exit(f"Indagine sconosciuta: {indagine!r}. Attese: {', '.join(INDAGINI)}")

    if corsi:
        print(f"Scoperta dei corsi (gruppi {', '.join(gruppi_corsi)}, filtro {filtro!r}):")
        mappa = scopri_corsi(ATENEI_INCROCIO, gruppi_corsi, filtro, config=indagine)
        quanti = sum(len(v) for v in mappa.values())
        if not quanti:
            sys.exit(f"\nNessun corso trovato col filtro {filtro!r}. Niente da scaricare.")
        print(f"\nTrovati {quanti} corsi in {len(mappa)} atenei.")
        combinazioni = genera_corsi(mappa, config=indagine)
        livello = f"corso (filtro {filtro!r})"
    else:
        genera = genera_incroci if incrocio else genera_combinazioni
        combinazioni = list(genera(config=indagine))
        livello = "ateneo x gruppo" if incrocio else "aggregati (ateneo, gruppo)"

    print(f"Indagine: {indagine}")
    print(f"Livello: {livello}")
    print(f"Combinazioni da scaricare: {len(combinazioni)}\n")
    esegui(combinazioni, db_path=db_path)

    if incrocio or corsi:
        print(
            "\nSalvato in un database a parte: il sito non lo vede e non e' cambiato\n"
            "nulla in frontend/public. Si interroga in SQL."
        )
    else:
        print(
            "\nDati aggiornati. Ora rigenera i file derivati, altrimenti la UI resta\n"
            "disallineata dal database:\n"
            "    python3 tools/genera_config_filtri.py\n"
            "    python3 tools/genera_nomi.py\n"
            "Poi controlla con ./tools/serve.sh e fai commit+push (il push pubblica)."
        )
