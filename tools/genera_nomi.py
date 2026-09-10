# -*- coding: utf-8 -*-
"""Regenerate nomi-ateneo.js and nomi-gruppo.js from AlmaLaurea dropdowns.

WHY IT EXISTS: the two files map codes to names (for example, "70003" to
"Bologna"). Names must NEVER be written from memory: they are taken from the
real AlmaLaurea dropdowns and saved in backend/dati-sorgente/ateneo-numero.txt.
That file contains both dropdowns (universities and disciplinary groups) as
used by the site. Keeping the source and generator with the generated files
allows any project clone to regenerate them.

WHAT IT DOES:
  - extracts the <option> elements from both dropdowns, excluding "tutti"
    (used by the site interface, not a real university or group);
  - CHECKS coverage against almalaurea.sqlite: every code in the database
    must have a name, and vice versa. A missing UI name exposes a raw code to
    the user, so this check is part of the work;
  - rewrites both JS modules.

USAGE:
    python3 tools/genera_nomi.py            # writes the files
    python3 tools/genera_nomi.py --check    # does not write; only checks
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

# The two dropdowns are distinguished by the name attribute of their <select>.
RE_SELECT = re.compile(r'<select[^>]*name="(?P<nome>[^"]+)"', re.IGNORECASE)
RE_OPTION = re.compile(
    r'<option[^>]*value="(?P<codice>[^"]*)"[^>]*>(?P<nome>.*?)</option>',
    re.IGNORECASE | re.DOTALL,
)


def estrai_tendine(testo):
    """Extract ``{dropdown_name: {code: name}}`` from the saved HTML fragment.

    Preserve the site's insertion order (alphabetical for universities) so
    that the generated file reads like the dropdown.

    Args:
        testo: Saved HTML containing the dropdowns.

    Returns:
        A mapping from dropdown names to code/name mappings.
    """
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
                continue  # Convenience UI option, not a data value.
            tendine[corrente][codice] = nome
    return tendine


def codici_nel_db(colonna):
    """Return the distinct non-empty codes stored in a database column.

    Args:
        colonna: Database column containing the codes.

    Returns:
        A set of distinct non-empty codes.
    """
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
    """Compare dropdown codes with those actually present in the dataset.

    Return a list of problems; an empty list means coverage is complete.

    Args:
        etichetta: Human-readable label for the coverage report.
        mappa: Dropdown code-to-name mapping.
        colonna: Database column containing the codes.

    Returns:
        A list of coverage problems.
    """
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
    """Render nomi-ateneo.js using its established format.

    The generated module preserves dropdown order and includes a trailing
    comma after each mapping entry.

    Args:
        mappa: University code-to-name mapping.

    Returns:
        The generated JavaScript module text.
    """
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
    """Render nomi-gruppo.js using sorted keys and no trailing comma.

    Args:
        mappa: Disciplinary-group code-to-name mapping.

    Returns:
        The generated JavaScript module text.
    """
    ordinata = {c: mappa[c] for c in sorted(mappa)}
    corpo = json.dumps(ordinata, indent=2, ensure_ascii=False)
    return f"{INTESTAZIONE_GRUPPO}\nexport const NOMI_GRUPPO = {corpo};\n"


def scrivi(percorso, testo, solo_controllo):
    """Write generated text unless check-only mode detects a mismatch.

    Args:
        percorso: Destination path.
        testo: Generated file contents.
        solo_controllo: Whether to report differences without writing.

    Returns:
        True when the destination matches or is written successfully.
    """
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
    """Parse arguments, generate both name modules, and report their status."""
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
