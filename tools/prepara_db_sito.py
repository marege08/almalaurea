#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prende i database della raccolta corsi e ne fa la versione da servire al sito.

PERCHE' ESISTE
--------------
`raccogli_corsi.py` produce un database per ateneo che serve a LUI: dentro ci
sono i dati, ma anche il registro di cosa e' gia' fatto (`_corsi`, `_fatte`,
`_scoperta`, `_inesistenti`) e l'indice della chiave primaria, che tiene in
piedi l'INSERT OR REPLACE di una raccolta ripartibile.

Il sito non ha bisogno di niente di tutto questo. Lui scarica il file intero
dentro il browser e lo legge con sql.js, quindi ogni byte che manda giu' e'
banda e RAM dell'utente. Misurato su Bari (`70002`, 148 schede):

    17,4 MB   com'esce dalla raccolta
    15,9 MB   senza le tabelle di servizio
     8,3 MB   senza anche l'indice della chiave primaria   <- questo file

L'indice pesa quasi meta' del file perche' la chiave primaria e' fatta di
undici colonne di testo: e' quasi una seconda copia della tabella. Toglierlo
costa una scansione completa a ogni interrogazione, che su qualche decina di
migliaia di righe in memoria non si sente; tenerlo costa il doppio del file a
ogni apertura della pagina, che si sente eccome.

COSA NON FA, DI PROPOSITO
-------------------------
Non tocca i database di partenza: li apre in sola lettura e scrive altrove.
Puo' quindi girare mentre la raccolta e' in corso.

Non butta via nessuna colonna. Ce ne sono che oggi il sito non interroga
(`anno`, `tipo_corso`, `classe`, `sezione`), ma servono ai generatori offline e
buttarle e' una decisione sui dati, non una compattazione: se un giorno si
decide, si decide a parte e per scritto.

Non salta gli atenei a meta': li SALTA sul serio, perche' un ateneo con meta'
delle schede pubblicato sul sito e' un dato sbagliato che sembra giusto. Con
`--anche-parziali` si forza, e il riepilogo lo scrive a chiare lettere.

USO
---
    python3 tools/prepara_db_sito.py --da ~/Documents/AlmaLaurea-raccolta-corsi
    python3 tools/prepara_db_sito.py --solo 70002,70048 --out /tmp/prova
    python3 tools/prepara_db_sito.py --check        # verifica senza riscrivere

Si lancia da qualunque cartella: i percorsi partono dalla radice del repository.
"""

import argparse
import hashlib
import sqlite3
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent

for _cartella in (RADICE / "tools", RADICE / "backend" / "src"):
    if str(_cartella) not in sys.path:
        sys.path.insert(0, str(_cartella))

from salva import COLONNE  # noqa: E402

CARTELLA_DA = Path.home() / "Documents" / "AlmaLaurea-raccolta-corsi"
CARTELLA_OUT = Path.home() / "Documents" / "AlmaLaurea-db-sito"

# Lo stesso schema di `salva.py` SENZA la chiave primaria. I NOT NULL restano:
# non pesano niente e dicono a chi legge il file che quelle colonne ci sono
# sempre. Le colonne sono prese da COLONNE, cosi' se un giorno lo schema
# cambia, questo file non resta indietro in silenzio.
TIPI = {
    "valore": "REAL",
    "nota": "TEXT",
    "valore_raw": "TEXT NOT NULL",
    "numero_laureati": "INTEGER",
    "numero_compilatori": "INTEGER",
}


def schema_senza_indice():
    """Il CREATE TABLE della copia per il sito: stesse colonne, stesso ordine,
    nessuna chiave primaria e quindi nessun indice."""
    righe = [f"    {c:18s} {TIPI.get(c, 'TEXT NOT NULL')}" for c in COLONNE]
    return "CREATE TABLE dati (\n" + ",\n".join(righe) + "\n)"


# L'ordine con cui si scorre la tabella per calcolare l'impronta. Non e' la
# chiave primaria per bellezza: e' l'unico ordine che esiste in entrambi i
# file, e senza un ORDER BY esplicito due database con le stesse righe possono
# restituirle in ordine diverso e sembrare diversi.
ORDINE = ("anno, indagine, definizione, tipo_corso, ateneo, gruppo, classe, "
          "corso, sezione, categoria, indicatore")


def impronta(conn):
    """Lo sha256 di TUTTE le righe della tabella `dati`, in ordine canonico.

    Serve a dire "la copia contiene esattamente gli stessi dati", che contare
    le righe non dice: una copia con lo stesso numero di righe e un valore
    storpiato passerebbe il conteggio e non passa questa.

    `repr()` e non `str()`: su un float str() puo' arrotondare, repr() no, e
    None si distingue dalla stringa 'None'."""
    h = hashlib.sha256()
    sql = f"SELECT {','.join(COLONNE)} FROM dati ORDER BY {ORDINE}"
    n = 0
    for riga in conn.execute(sql):
        h.update(repr(riga).encode("utf-8"))
        n += 1
    return h.hexdigest(), n


def apri_sola_lettura(percorso):
    # as_uri() codifica ? # % nel percorso: la stessa trappola gia' pagata in
    # raccogli_corsi.py, dove un '?' apriva un ALTRO file.
    return sqlite3.connect(f"{percorso.resolve().as_uri()}?mode=ro", uri=True)


def stato_ateneo(conn):
    """Quanto e' completo un ateneo: schede attese, fatte, inesistenti.

    Attese = corsi x indagini. Le indagini si contano dai dati veri invece di
    darle per due: un database raccolto con `--indagini profilo` ne ha una
    sola, e darlo per meta' vuoto sarebbe un falso allarme."""
    corsi = conn.execute("SELECT COUNT(*) FROM _corsi").fetchone()[0]
    fatte = conn.execute("SELECT COUNT(*) FROM _fatte").fetchone()[0]
    ha = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' "
                      "AND name='_inesistenti'").fetchone()
    inesistenti = (conn.execute("SELECT COUNT(*) FROM _inesistenti").fetchone()[0]
                   if ha else 0)
    indagini = conn.execute("SELECT COUNT(DISTINCT indagine) FROM dati").fetchone()[0]
    attese = corsi * max(1, indagini)
    return corsi, fatte, inesistenti, attese


def copia(sorgente, destinazione):
    """Scrive la copia compatta e ne verifica il contenuto. Ritorna
    (righe, peso_prima, peso_dopo).

    Scrive su un file temporaneo e rinomina solo alla fine: un'interruzione a
    meta' lascia un `.parziale` evidente invece di un database mutilato col
    nome giusto, che il sito servirebbe senza accorgersi di niente."""
    temp = destinazione.with_suffix(".sqlite.parziale")
    temp.unlink(missing_ok=True)

    letto = apri_sola_lettura(sorgente)
    scritto = sqlite3.connect(str(temp))
    try:
        scritto.execute(schema_senza_indice())
        segnaposto = ",".join("?" * len(COLONNE))
        sql = f"INSERT INTO dati ({','.join(COLONNE)}) VALUES ({segnaposto})"
        # A blocchi invece che tutto in memoria: i database grossi (Bologna,
        # Sapienza) sono centinaia di migliaia di righe.
        cur = letto.execute(f"SELECT {','.join(COLONNE)} FROM dati")
        while True:
            blocco = cur.fetchmany(20000)
            if not blocco:
                break
            scritto.executemany(sql, blocco)
        scritto.commit()
        # VACUUM ricompatta: senza, il file resta grande quanto le pagine
        # allocate durante l'inserimento.
        scritto.execute("VACUUM")
        scritto.commit()

        atteso, n_atteso = impronta(letto)
        ottenuto, n_ottenuto = impronta(scritto)
    finally:
        letto.close()
        scritto.close()

    if n_atteso != n_ottenuto or atteso != ottenuto:
        temp.unlink(missing_ok=True)
        raise RuntimeError(
            f"la copia non corrisponde all'originale "
            f"({n_ottenuto} righe contro {n_atteso}; "
            f"impronta {ottenuto[:12]} contro {atteso[:12]})")

    peso_prima = sorgente.stat().st_size
    peso_dopo = temp.stat().st_size
    temp.replace(destinazione)
    return n_atteso, peso_prima, peso_dopo


def verifica(sorgente, destinazione):
    """Il `--check`: la copia esiste e contiene gli stessi dati? Non riscrive
    niente. Ritorna (esito, messaggio)."""
    if not destinazione.exists():
        return False, "manca"
    a = apri_sola_lettura(sorgente)
    b = apri_sola_lettura(destinazione)
    try:
        indici = b.execute("SELECT COUNT(*) FROM sqlite_master "
                           "WHERE type='index'").fetchone()[0]
        servizio = b.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' "
                             "AND name LIKE '\\_%' ESCAPE '\\'").fetchone()[0]
        atteso, n_atteso = impronta(a)
        ottenuto, n_ottenuto = impronta(b)
    finally:
        a.close()
        b.close()
    if n_atteso != n_ottenuto:
        return False, f"{n_ottenuto} righe invece di {n_atteso}"
    if atteso != ottenuto:
        return False, "stesse righe ma contenuto diverso"
    if indici:
        return False, f"ha ancora {indici} indici"
    if servizio:
        return False, f"ha ancora {servizio} tabelle di servizio"
    return True, f"{n_ottenuto} righe, pulito"


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--da", default=str(CARTELLA_DA),
                   help=f"cartella dei database della raccolta (default: {CARTELLA_DA})")
    p.add_argument("--out", default=str(CARTELLA_OUT),
                   help=f"cartella delle copie per il sito (default: {CARTELLA_OUT})")
    p.add_argument("--solo", help="codici separati da virgola, es. 70002,70048")
    p.add_argument("--anche-parziali", action="store_true",
                   help="copia anche gli atenei con schede ancora da raccogliere")
    p.add_argument("--check", action="store_true",
                   help="verifica le copie gia' fatte senza riscriverle")
    a = p.parse_args()

    # Relativo = dalla radice del repository, come --out in raccogli_corsi.py.
    da = Path(a.da)
    out = Path(a.out)
    da = da if da.is_absolute() else RADICE / da
    out = out if out.is_absolute() else RADICE / out

    # Il database che il sito pubblica oggi e' `frontend/public/almalaurea.sqlite`,
    # e un `--out frontend/public` con un ateneo chiamato "almalaurea" o una
    # distrazione futura lo sovrascriverebbe con dati di un altro livello.
    # Stessa guardia di `--incrocio senza --db` in esegui_harvest.py.
    pubblico = (RADICE / "frontend" / "public").resolve()
    if out.resolve() == pubblico or pubblico in out.resolve().parents:
        print(f"--out non puo' stare dentro {pubblico}: li' c'e' il database "
              f"che il sito pubblica.", file=sys.stderr)
        return 2

    if not da.is_dir():
        print(f"La cartella di partenza non esiste: {da}", file=sys.stderr)
        return 2

    sorgenti = sorted(da.glob("*.sqlite"))
    if a.solo:
        voluti = {x.strip() for x in a.solo.split(",") if x.strip()}
        sorgenti = [s for s in sorgenti if s.stem in voluti]
        mancanti = voluti - {s.stem for s in sorgenti}
        if mancanti:
            print(f"Database non trovati in {da}: {sorted(mancanti)}", file=sys.stderr)
            return 2
    if not sorgenti:
        print(f"Nessun database in {da}", file=sys.stderr)
        return 2

    print(f"{'Verifica' if a.check else 'Preparazione'} — {len(sorgenti)} database")
    print(f"  da:  {da}")
    print(f"  a:   {out}\n")

    if not a.check:
        out.mkdir(parents=True, exist_ok=True)

    fatti = saltati = rotti = 0
    tot_prima = tot_dopo = tot_righe = 0
    for s in sorgenti:
        destinazione = out / s.name
        if a.check:
            ok, messaggio = verifica(s, destinazione)
            print(f"  {s.stem}: {'ok' if ok else 'ROTTO'} — {messaggio}")
            fatti += ok
            rotti += not ok
            continue

        c = apri_sola_lettura(s)
        try:
            corsi, schede, inesistenti, attese = stato_ateneo(c)
        finally:
            c.close()
        residue = attese - schede - inesistenti
        if residue > 0 and not a.anche_parziali:
            print(f"  {s.stem}: SALTATO — {residue} schede ancora da raccogliere "
                  f"su {attese} (--anche-parziali per forzare)")
            saltati += 1
            continue

        try:
            righe, prima, dopo = copia(s, destinazione)
        except Exception as e:
            print(f"  {s.stem}: FALLITO — {type(e).__name__}: {e}")
            rotti += 1
            continue
        avviso = f"  [PARZIALE: {residue} schede mancanti]" if residue > 0 else ""
        print(f"  {s.stem}: {righe:6d} righe · {prima / 1e6:5.1f} MB -> "
              f"{dopo / 1e6:5.1f} MB  (-{100 * (prima - dopo) / prima:4.1f}%)"
              f"{avviso}")
        fatti += 1
        tot_prima += prima
        tot_dopo += dopo
        tot_righe += righe

    print(f"\n{'=' * 62}")
    if a.check:
        print(f"Verificati: {fatti} ok, {rotti} da rifare")
    else:
        print(f"Preparati: {fatti}   saltati: {saltati}   falliti: {rotti}")
        if tot_prima:
            print(f"Peso: {tot_prima / 1e6:.1f} MB -> {tot_dopo / 1e6:.1f} MB "
                  f"(-{100 * (tot_prima - tot_dopo) / tot_prima:.1f}%), "
                  f"{tot_righe} righe")
    print(f"{'=' * 62}")
    return 1 if rotti else 0


if __name__ == "__main__":
    sys.exit(main())
