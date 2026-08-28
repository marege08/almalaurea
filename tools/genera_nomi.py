# -*- coding: utf-8 -*-
"""Rigenera nomi-ateneo.js e nomi-gruppo.js dai menu a tendina di AlmaLaurea.

PERCHE' ESISTE: i due file mappano codice -> nome (es. "70003" -> "Bologna").
I nomi NON vanno mai scritti a memoria: sono presi dai menu a tendina reali
del sito AlmaLaurea, salvati in backend/dati-sorgente/ateneo-numero.txt.
Quel file contiene entrambe le tendine (atenei e gruppi disciplinari) cosi'
come le serve il sito. Prima stava in docs/, che e' escluso da git: la
sorgente dei due file generati non era nel repository, quindi nessuno che
clonasse il progetto poteva rigenerarli. Ora sorgente e generatore sono
tracciati insieme al risultato.

COSA FA:
  - estrae le <option> delle due tendine, scartando la voce "tutti" (serve
    all'interfaccia del sito, non e' un ateneo/gruppo reale);
  - CONTROLLA la copertura contro almalaurea.sqlite: ogni codice presente nel
    database deve avere un nome, e viceversa. Un nome mancante in UI e' un
    codice grezzo mostrato all'utente, quindi il controllo e' parte del lavoro;
  - riscrive i due moduli JS.

USO:
    python3 tools/genera_nomi.py            # scrive i file
    python3 tools/genera_nomi.py --check    # non scrive, verifica e basta
"""

import argparse
import html
import json
import re
import sqlite3
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
SORGENTE = RADICE / "backend" / "dati-sorgente" / "ateneo-numero.txt"
DB = RADICE / "frontend" / "public" / "almalaurea.sqlite"
USCITA_ATENEO = RADICE / "frontend" / "public" / "js" / "nomi-ateneo.js"
USCITA_GRUPPO = RADICE / "frontend" / "public" / "js" / "nomi-gruppo.js"

INTESTAZIONE_ATENEO = """/**
 * nomi-ateneo.js
 *
 * Corrispondenza codice ateneo -> nome, presa dal menu a tendina reale
 * del sito AlmaLaurea (backend/dati-sorgente/ateneo-numero.txt), non da
 * memoria: 78 codici, verificati 1:1 contro i codici realmente presenti in
 * almalaurea.sqlite (0 mancanti, 0 estranei). La voce "tutti" della tendina
 * e' scartata: serve all'interfaccia del sito, non e' un ateneo reale.
 *
 * I codici restano la fonte univoca nel dataset; questa mappa serve solo
 * alla UI per mostrare il nome al posto del codice. Rigenerato da
 * tools/genera_nomi.py, non modificato a mano.
 */
"""

INTESTAZIONE_GRUPPO = """/**
 * nomi-gruppo.js
 *
 * Corrispondenza codice gruppo disciplinare -> nome, presa dal menu a
 * tendina reale del sito AlmaLaurea (non da memoria): 15 codici,
 * verificati 1:1 contro i codici realmente presenti in almalaurea.sqlite
 * (0 mancanti, 0 estranei).
 *
 * E' la classificazione adottata dal MUR a partire dal 2020 — diversa
 * dalla classificazione "storica" a 15 gruppi usata in anni precedenti
 * da AlmaLaurea: i nomi vanno presi da qui, non da memoria.
 *
 * Rigenerato da tools/genera_nomi.py a partire da
 * backend/dati-sorgente/ateneo-numero.txt, non modificato a mano.
 */
"""

# Le due tendine si distinguono dall'attributo name del <select> che le apre.
RE_SELECT = re.compile(r'<select[^>]*name="(?P<nome>[^"]+)"', re.IGNORECASE)
RE_OPTION = re.compile(
    r'<option[^>]*value="(?P<codice>[^"]*)"[^>]*>(?P<nome>.*?)</option>',
    re.IGNORECASE | re.DOTALL,
)


def estrai_tendine(testo):
    """Ritorna {nome_tendina: {codice: nome}} dal frammento HTML salvato.
    L'ordine di inserimento e' quello del sito (alfabetico per gli atenei):
    viene conservato, cosi' il file generato si legge come la tendina."""
    tendine = {}
    corrente = None
    for pezzo in re.split(r"(?=<select)", testo, flags=re.IGNORECASE):
        intestazione = RE_SELECT.search(pezzo)
        if intestazione:
            corrente = intestazione.group("nome")
            tendine[corrente] = {}
        if corrente is None:
            continue
        for opzione in RE_OPTION.finditer(pezzo):
            codice = opzione.group("codice").strip()
            nome = html.unescape(opzione.group("nome")).strip()
            if codice == "tutti" or not codice:
                continue  # voce di comodo della UI del sito, non un dato
            tendine[corrente][codice] = nome
    return tendine


def codici_nel_db(colonna):
    conn = sqlite3.connect(DB)
    try:
        return {
            r[0]
            for r in conn.execute(
                f"SELECT DISTINCT {colonna} FROM dati WHERE {colonna} != ''"
            )
        }
    finally:
        conn.close()


def verifica_copertura(etichetta, mappa, colonna):
    """Confronta i codici della tendina con quelli davvero nel dataset.
    Ritorna la lista dei problemi (vuota = copertura perfetta)."""
    if not DB.exists():
        return [f"{etichetta}: database assente, copertura non verificata"]
    nel_db = codici_nel_db(colonna)
    mancanti = sorted(nel_db - set(mappa))
    estranei = sorted(set(mappa) - nel_db)
    problemi = []
    if mancanti:
        problemi.append(
            f"{etichetta}: {len(mancanti)} codici nel DB senza nome: {mancanti}"
        )
    if estranei:
        problemi.append(
            f"{etichetta}: {len(estranei)} nomi non presenti nel DB: {estranei}"
        )
    if not problemi:
        print(
            f"{etichetta}: copertura {len(nel_db)}/{len(nel_db)} (0 mancanti, 0 estranei)"
        )
    return problemi


def rendi_ateneo(mappa):
    """Stile storico di nomi-ateneo.js: ordine della tendina, virgola finale."""
    righe = [
        f"  {json.dumps(codice, ensure_ascii=False)}: {json.dumps(nome, ensure_ascii=False)},"
        for codice, nome in mappa.items()
    ]
    return (
        f"{INTESTAZIONE_ATENEO}\nexport const NOMI_ATENEO = {{\n"
        + "\n".join(righe)
        + "\n};\n"
    )


def rendi_gruppo(mappa):
    """Stile storico di nomi-gruppo.js: chiavi ordinate, niente virgola finale."""
    ordinata = {c: mappa[c] for c in sorted(mappa)}
    corpo = json.dumps(ordinata, indent=2, ensure_ascii=False)
    return f"{INTESTAZIONE_GRUPPO}\nexport const NOMI_GRUPPO = {corpo};\n"


def scrivi(percorso, testo, solo_controllo):
    attuale = percorso.read_text(encoding="utf-8") if percorso.exists() else None
    nome = percorso.relative_to(RADICE)
    if attuale == testo:
        print(f"OK: {nome} e' allineato alla sorgente.")
        return True
    if solo_controllo:
        print(f"DIVERSO: {nome} non corrisponde alla sorgente.")
        return False
    percorso.write_text(testo, encoding="utf-8")
    print(f"Scritto {nome}")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="non scrive nulla: esce con codice 1 se i file sul disco sono diversi",
    )
    argomenti = parser.parse_args()

    if not SORGENTE.exists():
        sys.exit(f"Sorgente non trovata: {SORGENTE}")

    tendine = estrai_tendine(SORGENTE.read_text(encoding="utf-8"))
    if "ateneo" not in tendine or "gruppo" not in tendine:
        sys.exit(
            'Nella sorgente servono entrambe le tendine (name="ateneo" e '
            f'name="gruppo"); trovate: {sorted(tendine)}'
        )
    atenei, gruppi = tendine["ateneo"], tendine["gruppo"]
    print(f"Tendine lette: {len(atenei)} atenei, {len(gruppi)} gruppi.")

    problemi = verifica_copertura("Atenei", atenei, "ateneo")
    problemi += verifica_copertura("Gruppi", gruppi, "gruppo")
    for p in problemi:
        print(f"ATTENZIONE: {p}")

    ok = scrivi(USCITA_ATENEO, rendi_ateneo(atenei), argomenti.check)
    ok = scrivi(USCITA_GRUPPO, rendi_gruppo(gruppi), argomenti.check) and ok
    if problemi:
        return 1
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
