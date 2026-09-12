#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Raccoglie le schede a livello di CORSO, un ateneo per volta e in modo ripartibile.

PERCHE' ESISTE, visto che c'e' gia' esegui_harvest.py
---------------------------------------------------
`esegui_harvest.py` scarica gli aggregati: 93 selezioni, una manciata di minuti,
tutto in un file solo. I corsi sono un altro ordine di grandezza — ~4.000 corsi
per 2 indagini, cioe' ~8.000 richieste, misurate a ~2,3 s l'una: sei o sette ore.
Due conseguenze, e da entrambe nasce questo file:

  1. NON ENTRA IN UNA SESSIONE SOLA. Serve poter fermare e riprendere senza
     ricominciare. `esegui()` e' idempotente ma non salta niente: rilanciarlo
     riscarica tutto. Qui invece cosa e' gia' in cassaforte sta scritto NEL
     database stesso (tabelle `_corsi` e `_fatte`), quindi una ripartenza
     riprende da dove eravamo anche a distanza di giorni, e anche se nel
     frattempo la macchina si e' spenta.

  2. UN DATABASE PER ATENEO. Tutti i corsi in un file solo pesano ~483 MB, e il
     sito carica il database DENTRO IL BROWSER: sarebbe la morte dell'architettura
     a costo zero. Spezzando per ateneo si scende a ~8 MB l'uno, scaricati solo
     quando quell'ateneo entra davvero in una colonna. Non e' una forzatura: e'
     gia' la forma del codice (`interrogaScheda()` interroga un ateneo per
     colonna) e della fonte (AlmaLaurea vuole `pa`=<ateneo> per elencare i corsi).

EDUCAZIONE VERSO LA FONTE
-------------------------
Sono migliaia di richieste da un IP solo. La pausa predefinita qui e' **2 secondi**,
non 1 come nell'harvest degli aggregati, e c'e' `--max-minuti` per fermarsi da
solo. Il `User-Agent` dichiara il progetto (vedi scarica.py). Non togliere la
pausa per fare prima: il sito e' di qualcun altro.

USO
---
    python3 tools/raccogli_corsi.py --atenei 70003,70055 --out /tmp/corsi
    python3 tools/raccogli_corsi.py --primi 5 --max-minuti 90
    python3 tools/raccogli_corsi.py --atenei 70003 --solo-scoperta

Si lancia da qualunque cartella: i percorsi partono dalla radice del repository.
"""

import argparse
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

RADICE = Path(__file__).resolve().parent.parent

# Stessa acrobazia di esegui_harvest.py: i moduli del progetto vivono in due
# cartelle e si importano per nome.
for _cartella in (RADICE / "tools", RADICE / "backend" / "src"):
    if str(_cartella) not in sys.path:
        sys.path.insert(0, str(_cartella))

from harvest import ATENEI, GRUPPI, INDAGINI, genera_corsi, params_tendine  # noqa: E402
from salva import apri_db, salva_righe  # noqa: E402
from scarica import leggi_tendine, raccogli_scheda, scarica_scheda  # noqa: E402

PAUSA_PREDEFINITA = 2.0
CARTELLA_PREDEFINITA = RADICE / "backend" / "backup-db" / "corsi"

# Il registro di cosa e' gia' fatto vive DENTRO il database dell'ateneo, non in
# un file di stato a fianco: cosi' il database e' autosufficiente e non puo'
# desincronizzarsi da un registro esterno che qualcuno sposta o cancella.
SCHEMA_REGISTRO = """
CREATE TABLE IF NOT EXISTS _corsi (
    ateneo TEXT NOT NULL,
    gruppo TEXT NOT NULL,
    codice TEXT NOT NULL,
    nome   TEXT NOT NULL,
    PRIMARY KEY (ateneo, codice)   -- lo stesso corso puo' comparire in due
);                                 -- gruppi: si tiene la prima occorrenza

CREATE TABLE IF NOT EXISTS _fatte (
    chiave TEXT PRIMARY KEY,       -- "<ateneo>/<corso>/<indagine>"
    righe  INTEGER NOT NULL,
    quando TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS _scoperta (
    ateneo TEXT NOT NULL,
    gruppo TEXT NOT NULL,
    quando TEXT NOT NULL,
    PRIMARY KEY (ateneo, gruppo)   -- un gruppo gia' interrogato non si ripete
);
"""


class Budget:
    """Il tetto a orologio. Un turno di notte ha una fascia oraria da rispettare:
    meglio fermarsi puliti a meta' che essere ammazzati a meta' scrittura."""

    def __init__(self, minuti):
        self.scadenza = time.time() + minuti * 60 if minuti else None

    def scaduto(self):
        return self.scadenza is not None and time.time() > self.scadenza

    def restano(self):
        if self.scadenza is None:
            return "senza tetto"
        return f"{max(0, int(self.scadenza - time.time())) // 60} min"


def apri(cartella, ateneo):
    """Il database di UN ateneo: schema dei dati (identico a quello del sito,
    cosi' i file si possono fondere o servire tali e quali) piu' il registro."""
    cartella.mkdir(parents=True, exist_ok=True)
    conn = apri_db(str(cartella / f"{ateneo}.sqlite"))
    conn.executescript(SCHEMA_REGISTRO)
    conn.commit()
    return conn


def scopri(conn, ateneo, gruppi, pausa, budget):
    """Chiede a solotendine.php quali corsi esistono, gruppo per gruppo.

    Un gruppo gia' interrogato non si ripete: sta in `_scoperta`. Un ateneo che
    non ha corsi in un gruppo risponde con una tendina vuota o con un errore
    HTTP — sono entrambi "non ho niente qui", non guasti, e si segnano come
    fatti per non richiederli in eterno.

    Un guasto di RETE invece (timeout, connessione caduta) non dice niente sui
    corsi: segnarlo come fatto farebbe sparire per sempre, e in silenzio, tutti
    i corsi di quel gruppo. Quello NON si segna, e la ripartenza lo ritenta."""
    gia = {g for (g,) in conn.execute(
        "SELECT gruppo FROM _scoperta WHERE ateneo = ?", (ateneo,))}
    da_fare = [g for g in gruppi if g not in gia]
    if not da_fare:
        return 0, 0, False

    nuovi = falliti = 0
    for gruppo in da_fare:
        if budget.scaduto():
            return nuovi, falliti, True
        try:
            tendine = leggi_tendine(params_tendine(ateneo, gruppo))
            corsi = tendine.get("postcorso", [])
        except requests.HTTPError as e:
            print(f"    gr.{gruppo}: tendine non disponibili (HTTP "
                  f"{e.response.status_code if e.response is not None else '?'})")
            corsi = []
        except Exception as e:
            falliti += 1
            print(f"    gr.{gruppo}: FALLITA la scoperta, si ritenta alla "
                  f"ripartenza -> {type(e).__name__}: {e}")
            time.sleep(pausa)
            continue
        for codice, nome in corsi:
            cur = conn.execute(
                "INSERT OR IGNORE INTO _corsi (ateneo, gruppo, codice, nome) "
                "VALUES (?,?,?,?)", (ateneo, gruppo, codice, nome))
            nuovi += cur.rowcount
        conn.execute(
            "INSERT OR REPLACE INTO _scoperta (ateneo, gruppo, quando) VALUES (?,?,?)",
            (ateneo, gruppo, datetime.now().isoformat(timespec="seconds")))
        conn.commit()
        time.sleep(pausa)
    return nuovi, falliti, False


def scarica_corsi(conn, ateneo, indagini, pausa, budget, max_corsi=None):
    """Scarica le schede dei corsi gia' scoperti. Salta quelle in `_fatte`."""
    corsi = list(conn.execute(
        "SELECT gruppo, codice, nome FROM _corsi WHERE ateneo = ? ORDER BY codice",
        (ateneo,)))
    fatte = {c for (c,) in conn.execute("SELECT chiave FROM _fatte")}

    lavoro = []
    for indagine in indagini:
        for gruppo, codice, nome in corsi:
            chiave = f"{ateneo}/{codice}/{indagine}"
            if chiave not in fatte:
                lavoro.append((chiave, indagine, gruppo, codice, nome))
    if max_corsi:
        lavoro = lavoro[:max_corsi]

    ok = vuote = falliti = 0
    for n, (chiave, indagine, gruppo, codice, nome) in enumerate(lavoro, start=1):
        if budget.scaduto():
            print(f"    tetto raggiunto: mi fermo pulito a {n - 1}/{len(lavoro)}")
            return ok, vuote, falliti, True
        combo = genera_corsi({ateneo: [(gruppo, codice, nome)]}, config=indagine)[0]
        try:
            righe = raccogli_scheda(scarica_scheda(combo["params"]), combo["params"])
            n_righe = salva_righe(conn, righe)
            if n_righe == 0:
                # HTTP 200 ma nessuna tabella-dato: manutenzione, ondata non
                # ancora pubblicata, pagina cambiata, o un corso senza laureati.
                # Da qui non si distinguono, quindi NON la segno come fatta:
                # un "fatto" a zero righe non si ritenterebbe mai piu'.
                vuote += 1
                print(f"    [{n}/{len(lavoro)}] VUOTA    {indagine} {codice} -> "
                      f"nessuna tabella-dato, si ritenta alla ripartenza")
                time.sleep(pausa)
                continue
            conn.execute(
                "INSERT OR REPLACE INTO _fatte (chiave, righe, quando) VALUES (?,?,?)",
                (chiave, n_righe, datetime.now().isoformat(timespec="seconds")))
            conn.commit()
            ok += 1
            print(f"    [{n}/{len(lavoro)}] {indagine:11s} {nome[:46]:46s} {n_righe:4d} righe")
        except Exception as e:
            # Una scheda che esplode non si porta dietro l'ateneo. Non la segno
            # come fatta, cosi' la ripartenza la ritenta da sola.
            falliti += 1
            print(f"    [{n}/{len(lavoro)}] FALLITA  {indagine} {codice} -> "
                  f"{type(e).__name__}: {e}")
        time.sleep(pausa)
    return ok, vuote, falliti, False


def riepilogo(cartella, ateneo):
    f = cartella / f"{ateneo}.sqlite"
    if not f.exists():
        return None
    # as_uri() codifica i caratteri che in un URI hanno un significato (? # %):
    # incollato a mano, un '?' nel percorso apriva un ALTRO file.
    c = sqlite3.connect(f"{f.resolve().as_uri()}?mode=ro", uri=True)
    try:
        corsi = c.execute("SELECT COUNT(*) FROM _corsi").fetchone()[0]
        fatte = c.execute("SELECT COUNT(*) FROM _fatte").fetchone()[0]
        righe = c.execute("SELECT COUNT(*) FROM dati").fetchone()[0]
    finally:
        c.close()
    return corsi, fatte, righe, f.stat().st_size


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--atenei", help="codici separati da virgola, es. 70003,70055")
    g.add_argument("--primi", type=int, help="i primi N atenei della lista ufficiale")
    p.add_argument("--out", default=str(CARTELLA_PREDEFINITA),
                   help=f"cartella dei database (default: {CARTELLA_PREDEFINITA})")
    p.add_argument("--pausa", type=float, default=PAUSA_PREDEFINITA,
                   help=f"secondi fra richieste (default: {PAUSA_PREDEFINITA})")
    p.add_argument("--gruppi", help="gruppi da interrogare (default: tutti e 15)")
    p.add_argument("--indagini", default=",".join(INDAGINI),
                   help=f"default: {','.join(INDAGINI)}")
    p.add_argument("--max-corsi", type=int,
                   help="tetto di schede per ateneo, per una raccolta pacata")
    p.add_argument("--max-minuti", type=float,
                   help="tetto a orologio: oltre, si ferma pulito")
    p.add_argument("--solo-scoperta", action="store_true",
                   help="elenca i corsi senza scaricarne le schede")
    a = p.parse_args()

    # `is not None`, non la verita' della stringa: `--atenei ""` (una variabile
    # vuota in un cron) cadeva nel ramo di --primi con primi=None, cioe' TUTTI i
    # 78 atenei — giorni di raccolta partiti per sbaglio.
    if a.atenei is not None:
        atenei = [x.strip() for x in a.atenei.split(",") if x.strip()]
        if not atenei:
            print("--atenei e' vuoto: nessun ateneo indicato.", file=sys.stderr)
            return 2
    else:
        # Un N negativo taglierebbe dalla FINE: --primi -3 prendeva 75 atenei.
        if a.primi < 1:
            print(f"--primi vuole un numero da 1 in su, non {a.primi}.", file=sys.stderr)
            return 2
        atenei = ATENEI[:a.primi]
    ignoti = [x for x in atenei if x not in ATENEI]
    if ignoti:
        print(f"Codici ateneo non nella lista ufficiale: {ignoti}", file=sys.stderr)
        return 2

    # Controllato qui come le indagini: un gruppo sbagliato altrimenti esplodeva
    # dentro scopri() e finiva segnato come "fatto" senza dire del refuso.
    gruppi = ([x.strip() for x in a.gruppi.split(",") if x.strip()]
              if a.gruppi else list(GRUPPI))
    ignoti = [g for g in gruppi if g not in GRUPPI]
    if ignoti:
        print(f"Gruppi non nella lista ufficiale: {ignoti} (attesi: {GRUPPI})",
              file=sys.stderr)
        return 2
    indagini = [x.strip() for x in a.indagini.split(",")]
    sconosciute = [i for i in indagini if i not in INDAGINI]
    if sconosciute:
        print(f"Indagini sconosciute: {sconosciute} (attese: {INDAGINI})", file=sys.stderr)
        return 2

    # Relativo = dalla radice del repository, come --db in esegui_harvest.py.
    # Dalla cartella corrente, una ripartenza lanciata da un altro posto non
    # trovava i database gia' fatti e riscaricava tutto.
    cartella = Path(a.out)
    if not cartella.is_absolute():
        cartella = RADICE / cartella
    budget = Budget(a.max_minuti)
    print(f"Raccolta corsi — {len(atenei)} atenei, pausa {a.pausa}s, "
          f"tetto {budget.restano()}")
    print(f"Cartella: {cartella}\n")

    tot_ok = tot_vuote = tot_falliti = tot_scoperta_fallita = 0
    interrotto = False
    for ateneo in atenei:
        if budget.scaduto():
            interrotto = True
            print(f"\nTetto a orologio raggiunto: {ateneo} e i successivi non partono.")
            break
        print(f"  ateneo {ateneo}  ({budget.restano()} residui)")
        conn = apri(cartella, ateneo)
        try:
            nuovi, falliti_scoperta, stop = scopri(conn, ateneo, gruppi, a.pausa, budget)
            tot_scoperta_fallita += falliti_scoperta
            print(f"    scoperta: {nuovi} corsi nuovi"
                  f"{f', {falliti_scoperta} gruppi da ritentare' if falliti_scoperta else ''}")
            if stop:
                interrotto = True
                break
            if not a.solo_scoperta:
                ok, vuote, falliti, stop = scarica_corsi(
                    conn, ateneo, indagini, a.pausa, budget, a.max_corsi)
                tot_ok += ok
                tot_vuote += vuote
                tot_falliti += falliti
                if stop:
                    interrotto = True
                    break
        finally:
            conn.close()

    print(f"\n{'=' * 62}")
    print(f"Schede salvate: {tot_ok}   vuote: {tot_vuote}   fallite: {tot_falliti}"
          f"{'   (INTERROTTO dal tetto)' if interrotto else ''}")
    if tot_scoperta_fallita:
        print(f"Gruppi con la scoperta fallita: {tot_scoperta_fallita} "
              f"(si ritentano alla ripartenza)")
    print(f"{'=' * 62}")
    for ateneo in atenei:
        r = riepilogo(cartella, ateneo)
        if r:
            corsi, fatte, righe, peso = r
            print(f"  {ateneo}: {corsi:4d} corsi scoperti · {fatte:4d} schede · "
                  f"{righe:6d} righe · {peso / 1e6:.1f} MB")

    # Fermarsi per il tetto NON e' un errore: e' il comportamento voluto, e un
    # codice diverso da zero farebbe suonare l'allarme del turno di notte per
    # una raccolta andata benissimo.
    return 1 if (tot_falliti or tot_scoperta_fallita) and not tot_ok else 0


if __name__ == "__main__":
    sys.exit(main())
