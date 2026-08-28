# -*- coding: utf-8 -*-
"""Rigenera frontend/public/js/config-filtri.js a partire dal database.

PERCHE' ESISTE: config-filtri.js non e' scritto a mano. Nasce da una query
DISTINCT (sezione, categoria, indicatore) su almalaurea.sqlite. Prima questo
script viveva solo nella sessione in cui e' stato usato: il file generato era
nel repo, il generatore no. Bastava un aggiornamento annuale dei dati per
ritrovarsi a dover mantenere 997 righe a mano, o a riscrivere da zero la
logica di raggruppamento. Ora e' qui.

COSA FA (le stesse regole documentate in fase1-resoconto.md §5.1-5.2):
  - L'unita' di filtro e' la DOMANDA, non l'indicatore grezzo:
      categoria != ''  -> la domanda e' (sezione, categoria); gli indicatore
                          sotto di essa sono le opzioni di risposta.
      categoria == ''  -> l'indicatore e' gia' completo da solo: e' la sua
                          stessa domanda, un gruppo da un elemento.
  - La macro-categoria si deriva meccanicamente dalla sezione ufficiale
    AlmaLaurea (tabella SEZIONE_A_MACRO qui sotto), non voce per voce.
  - L'id e' uno slug dell'etichetta: minuscolo, accenti spogliati, tutto cio'
    che non e' lettera/numero diventa '_', troncato a 60 caratteri.

USO:
    python3 tools/genera_config_filtri.py            # scrive il file
    python3 tools/genera_config_filtri.py --check    # non scrive, dice solo
                                                     # se il file e' allineato

ATTENZIONE PER IL FUTURO: se un aggiornamento dei dati cambia le etichette,
cambiano anche gli id (sono derivati dalle etichette). Gli id finiscono nel
vocabolario che lo strato AI mostra al modello, quindi vanno rigenerati
insieme, mai lasciati disallineati. Vedi la sezione "Come si aggiornano i
dati" nel README.
"""

import argparse
import json
import re
import sqlite3
import sys
import unicodedata
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
DB = RADICE / "frontend" / "public" / "almalaurea.sqlite"
USCITA = RADICE / "frontend" / "public" / "js" / "config-filtri.js"

# Le 10 sezioni ufficiali della scheda AlmaLaurea raggruppate nelle 4
# macro-categorie pensate per chi sta scegliendo un corso (fase1-resoconto §3.2).
SEZIONE_A_MACRO = {
    "1. CARATTERISTICHE ANAGRAFICHE": "Profilo Studente",
    "2. ORIGINE SOCIALE": "Profilo Studente",
    "3. STUDI SECONDARI DI SECONDO GRADO": "Profilo Studente",
    "4. RIUSCITA NEGLI STUDI UNIVERSITARI": "Successo e Percorso",
    "5. CONDIZIONI DI STUDIO": "Competenze e Ambiente",
    "6. LAVORO DURANTE GLI STUDI UNIVERSITARI": "Lavoro e Futuro",
    "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA": "Lavoro e Futuro",
    "8. CONOSCENZE LINGUISTICHE E INFORMATICHE": "Competenze e Ambiente",
    "9. PROSPETTIVE DI STUDIO": "Successo e Percorso",
    "10. PROSPETTIVE DI LAVORO": "Lavoro e Futuro",
}

# Ordine in cui le macro-categorie compaiono nella UI: dal percorso di studi
# al dopo-laurea, poi il contorno. Non alfabetico: e' una scelta di lettura.
ORDINE_MACRO = [
    "Successo e Percorso",
    "Lavoro e Futuro",
    "Competenze e Ambiente",
    "Profilo Studente",
]

LUNGHEZZA_MASSIMA_ID = 60

INTESTAZIONE = """/**
 * config-filtri.js
 *
 * Mappatura reale indicatori AlmaLaurea -> macro-categorie, generata
 * direttamente da almalaurea.sqlite (query DISTINCT sezione, categoria,
 * indicatore), non scritta a mano: se il dataset cambia, questo file si
 * rigenera con lo stesso script, non si modifica a mano riga per riga.
 *
 * UNITA' DI FILTRO = "domanda", non il singolo indicatore grezzo:
 *  - se `categoria` non e' vuota, la domanda e' (sezione, categoria) e
 *    `indicatori` elenca le opzioni di risposta da mostrare come
 *    sotto-colonne (es. "Decisamente si'/no" hanno senso solo insieme
 *    alla domanda a cui appartengono — da soli sono ambigui: la stessa
 *    coppia di risposte compare in 24 domande diverse nel dataset).
 *  - se `categoria` e' vuota (''), l'indicatore e' gia' completo da solo
 *    (es. "Dottorato di ricerca"): e' la sua stessa "domanda", un
 *    gruppo da un solo elemento.
 *
 * La macro-categoria si ricava dalla sezione ufficiale AlmaLaurea
 * (fase1-resoconto.md, §3.2) — non e' un giudizio indicatore per
 * indicatore, e' una semplice tabella sezione -> macro-categoria.
 *
 * Per il rendering: dato un elemento di CONFIG_FILTRI,
 *  - se categoria != '' -> query: WHERE categoria = elemento.categoria
 *  - se categoria == '' -> query: WHERE categoria = '' AND indicatore = elemento.indicatori[0]
 * (la categoria, quando presente, e' di per se' univoca nel dataset:
 * verificato che nessuna categoria si ripete in sezioni diverse).
 *
 * Nota su una stranezza ereditata dai dati originali, NON corretta a
 * mano: nella sezione 1 la categoria "Eta' alla laurea (%)" include
 * anche "Cittadini stranieri (%)" come indicatore. E' cosi' nella
 * struttura ufficiale della scheda AlmaLaurea (non e' un bug del
 * parser di Fase 0): si lascia com'e', per fedelta' alla fonte.
 */
"""


def slug(etichetta):
    """Etichetta leggibile -> id stabile e usabile come id HTML.
    Spoglia gli accenti invece di cancellarli ('Regolarità' -> 'regolarita'),
    cosi' l'id resta leggibile e non dipende dalla codifica."""
    senza_accenti = "".join(
        c
        for c in unicodedata.normalize("NFD", etichetta)
        if unicodedata.category(c) != "Mn"
    )
    ripulito = re.sub(r"[^a-z0-9]+", "_", senza_accenti.lower()).strip("_")
    return ripulito[:LUNGHEZZA_MASSIMA_ID].rstrip("_")


def leggi_triple(db_path):
    """Le combinazioni distinte (sezione, categoria, indicatore) del dataset.
    E' l'unica lettura dal DB: nessun valore numerico entra in questo file."""
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute(
            "SELECT DISTINCT sezione, categoria, indicatore FROM dati"
        ).fetchall()
    finally:
        conn.close()


def costruisci_config(triple):
    """Raggruppa le triple in domande e le smista nelle macro-categorie.
    Ritorna (config, problemi): i problemi non fermano la generazione, si
    stampano — un dataset nuovo puo' portare sorprese e vanno viste, non
    nascoste."""
    problemi = []
    domande = {}  # (sezione, categoria, indicatore_se_standalone) -> voce

    for sezione, categoria, indicatore in triple:
        if sezione not in SEZIONE_A_MACRO:
            problemi.append(f"sezione non mappata, voci ignorate: {sezione!r}")
            continue
        # Standalone: ogni indicatore e' una domanda a se'. Con categoria:
        # tutti gli indicatori confluiscono nella stessa domanda.
        chiave = (sezione, categoria, indicatore if categoria == "" else "")
        etichetta = categoria if categoria else indicatore
        voce = domande.setdefault(
            chiave,
            {
                "id": slug(etichetta),
                "label": etichetta,
                "sezione": sezione,
                "categoria": categoria,
                "indicatori": set(),
            },
        )
        voce["indicatori"].add(indicatore)

    config = {macro: [] for macro in ORDINE_MACRO}
    for voce in domande.values():
        voce["indicatori"] = sorted(voce["indicatori"])
        config[SEZIONE_A_MACRO[voce["sezione"]]].append(voce)

    for macro in ORDINE_MACRO:
        # Ordine stabile e riproducibile: sezione, poi categoria, poi etichetta.
        config[macro].sort(key=lambda v: (v["sezione"], v["categoria"], v["label"]))

    visti = {}
    for macro in ORDINE_MACRO:
        for voce in config[macro]:
            if voce["id"] in visti:
                problemi.append(
                    f"id duplicato {voce['id']!r}: {visti[voce['id']]!r} e {voce['label']!r} "
                    f"(il troncamento a {LUNGHEZZA_MASSIMA_ID} caratteri li ha fatti collidere)"
                )
            visti[voce["id"]] = voce["label"]

    return config, problemi


def rendi_javascript(config):
    corpo = json.dumps(config, indent=2, ensure_ascii=False)
    return f"{INTESTAZIONE}\nexport const CONFIG_FILTRI = {corpo};\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="non scrive nulla: esce con codice 1 se il file sul disco e' diverso",
    )
    argomenti = parser.parse_args()

    if not DB.exists():
        sys.exit(f"Database non trovato: {DB}")

    config, problemi = costruisci_config(leggi_triple(DB))
    testo = rendi_javascript(config)

    for p in problemi:
        print(f"ATTENZIONE: {p}")

    totale = sum(len(v) for v in config.values())
    riepilogo = ", ".join(f"{m}: {len(config[m])}" for m in ORDINE_MACRO)
    print(f"{totale} domande ({riepilogo})")

    attuale = USCITA.read_text(encoding="utf-8") if USCITA.exists() else None
    if argomenti.check:
        if attuale == testo:
            print(f"OK: {USCITA.relative_to(RADICE)} e' allineato al database.")
            return 0
        print(f"DIVERSO: {USCITA.relative_to(RADICE)} non corrisponde al database.")
        return 1

    if attuale == testo:
        print(f"Nessuna modifica: {USCITA.relative_to(RADICE)} era gia' allineato.")
        return 0
    USCITA.write_text(testo, encoding="utf-8")
    print(f"Scritto {USCITA.relative_to(RADICE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
