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
    che non e' lettera/numero diventa '_', troncato a 80 caratteri (con
    disambiguazione se due etichette collidono lo stesso).

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

# Le sezioni ufficiali delle schede AlmaLaurea raggruppate nelle macro-categorie
# pensate per chi sta scegliendo un corso (fase1-resoconto §3.2).
#
# Sono DUE indagini, e si riconoscono a occhio: il profilo dei laureati usa
# titoli in maiuscolo, l'indagine occupazione no. Le 8 sezioni di occupazione
# stanno tutte in una macro-categoria sola, "Dopo la Laurea", per una ragione
# di sostanza e non di estetica: "Lavoro e Futuro" del profilo raccoglie le
# ASPETTATIVE del neolaureato, occupazione racconta cosa gli e' successo
# DAVVERO a 1/3/5 anni. Mescolarle farebbe leggere un numero credendo che ne
# dica un altro. Sono 22 domande (108 indicatori grezzi, che il
# raggruppamento per (sezione, categoria) riduce a 22).
SEZIONE_A_MACRO = {
    # --- indagine "profilo" ---
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
    # --- indagine "occupazione" ---
    "2b. Formazione post-laurea": "Dopo la Laurea",
    "3. Condizione occupazionale": "Dopo la Laurea",
    "4. Ingresso nel mercato del lavoro": "Dopo la Laurea",
    "5. Caratteristiche dell´attuale lavoro": "Dopo la Laurea",
    "6. Caratteristiche dell´impresa": "Dopo la Laurea",
    "7. Retribuzione": "Dopo la Laurea",
    "8. Utilizzo e richiesta della laurea nell´attuale lavoro": "Dopo la Laurea",
    "9. Efficacia della laurea e soddisfazione per l´attuale lavoro": "Dopo la Laurea",
}

# Ordine in cui le macro-categorie compaiono nella UI: dal percorso di studi
# al dopo-laurea, poi il contorno. Non alfabetico: e' una scelta di lettura.
ORDINE_MACRO = [
    "Successo e Percorso",
    "Lavoro e Futuro",
    "Dopo la Laurea",
    "Competenze e Ambiente",
    "Profilo Studente",
]

# 80 e non 60: due domande di "Dopo la Laurea" cominciano con le stesse
# 60 lettere e divergono al carattere 61, quindi a 60 producevano lo stesso
# id. Con id duplicati getElementById restituisce solo il primo e la
# seconda domanda avrebbe una casella che non risponde.
LUNGHEZZA_MASSIMA_ID = 80

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
 * OGNI VOCE DICHIARA LA SUA INDAGINE (`indagine`: "profilo" oppure
 * "occupazione") E LE SUE DEFINIZIONI (`definizioni`). Non e' decorazione: il
 * database contiene due indagini, e dentro `occupazione` quasi tutte le
 * domande esistono in DUE definizioni ufficiali di "occupato" (ampia e
 * restrittiva) con numeri diversi. Chi interroga il database DEVE filtrare su
 * `indagine` e su `definizione`, altrimenti 69 coppie (categoria, indicatore)
 * collidono e l'ultima riga letta sovrascrive la prima in silenzio.
 *
 * Valori possibili in `definizioni`:
 *   [""]              -> indagine profilo: la doppia definizione non esiste
 *   ["ampia", "restrittiva"] -> la domanda esiste in entrambe, con numeri diversi
 *   ["ampia"] / ["restrittiva"] -> esiste SOLO con quella definizione
 *   ["condivisa"]     -> blocco non doppiato nella pagina AlmaLaurea: vale
 *                        per entrambe le definizioni, va mostrato sempre
 *
 * Regola per la UI, data la definizione scelta dall'utente:
 *   mostra la voce se definizioni contiene "", "condivisa", o la scelta.
 *
 * Per il rendering: dato un elemento di CONFIG_FILTRI,
 *  - sempre: WHERE indagine = elemento.indagine
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


def leggi_combinazioni(db_path):
    """Le combinazioni distinte (indagine, definizione, sezione, categoria,
    indicatore). E' l'unica lettura dal DB: nessun valore numerico entra qui.

    La `definizione` serve perche' le due definizioni di "occupato" NON pongono
    esattamente le stesse domande: 16 sono in comune, 2 esistono solo con la
    definizione ampia ("Ricerca del lavoro", "Ripartizione geografica di
    lavoro") e 2 solo con la restrittiva ("Condizione occupazionale", "Area
    geografica di lavoro"). Ogni voce si porta quindi l'elenco delle
    definizioni sotto cui esiste, cosi' la UI puo' nascondere quelle che non
    ci sono invece di mostrare una riga di trattini."""
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute(
            "SELECT DISTINCT indagine, definizione, sezione, categoria, indicatore "
            "FROM dati"
        ).fetchall()
    finally:
        conn.close()


def costruisci_config(combinazioni):
    """Raggruppa le combinazioni in domande e le smista nelle macro-categorie.
    Ritorna (config, problemi): i problemi non fermano la generazione, si
    stampano — un dataset nuovo puo' portare sorprese e vanno viste, non
    nascoste."""
    problemi = []
    domande = {}  # (sezione, categoria, indicatore_se_standalone) -> voce
    # Ogni sezione deve appartenere a UNA sola indagine: e' il presupposto che
    # permette alla voce di portarsi dietro l'indagine, e quindi ad app.js di
    # filtrarci sopra senza doverla dedurre. Se un dataset futuro lo rompesse,
    # si deve sapere subito invece di scoprirlo da un numero sbagliato.
    indagine_di_sezione = {}
    # Una sezione non mappata dev'essere segnalata UNA volta con il conteggio:
    # un avviso per voce sono cento righe identiche, cioe' un avviso che
    # nessuno legge. Le sezioni dell'indagine 'occupazione' finiscono qui
    # finche' non vengono assegnate a una macro-categoria.
    non_mappate = {}

    for indagine, definizione, sezione, categoria, indicatore in combinazioni:
        vista = indagine_di_sezione.setdefault(sezione, indagine)
        if vista != indagine:
            problemi.append(
                f"la sezione {sezione!r} compare in due indagini ({vista!r} e "
                f"{indagine!r}): la voce generata ne puo' dichiarare una sola"
            )
        if sezione not in SEZIONE_A_MACRO:
            non_mappate[sezione] = non_mappate.get(sezione, 0) + 1
            continue
        # Standalone: ogni indicatore e' una domanda a se'. Con categoria:
        # tutti gli indicatori confluiscono nella stessa domanda.
        chiave = (sezione, categoria, indicatore if categoria == "" else "")
        etichetta = categoria if categoria else indicatore
        voce = domande.setdefault(
            chiave,
            {
                "id": None,  # assegnato dopo l'ordinamento, vedi sotto
                "label": etichetta,
                "indagine": indagine,
                "definizioni": set(),
                "sezione": sezione,
                "categoria": categoria,
                "indicatori": set(),
            },
        )
        voce["indicatori"].add(indicatore)
        voce["definizioni"].add(definizione)

    config = {macro: [] for macro in ORDINE_MACRO}
    for voce in domande.values():
        voce["indicatori"] = sorted(voce["indicatori"])
        voce["definizioni"] = sorted(voce["definizioni"])
        config[SEZIONE_A_MACRO[voce["sezione"]]].append(voce)

    for macro in ORDINE_MACRO:
        # Ordine stabile e riproducibile: sezione, poi categoria, poi etichetta.
        config[macro].sort(key=lambda v: (v["sezione"], v["categoria"], v["label"]))

    # Gli id si assegnano QUI, dopo l'ordinamento, non alla creazione della
    # voce: cosi' l'ordine di assegnazione e' riproducibile e, se due etichette
    # collidono, il suffisso cade sempre sulla stessa delle due, run dopo run.
    # Prima questo blocco si limitava a SEGNALARE i duplicati e scriveva
    # comunque un file rotto (due voci con lo stesso id HTML: la seconda
    # casella non risponde). Ora il duplicato viene reso impossibile.
    visti = {}
    for macro in ORDINE_MACRO:
        for voce in config[macro]:
            radice = slug(voce["label"])
            id_finale = radice
            n = 1
            while id_finale in visti:
                n += 1
                id_finale = f"{radice}_{n}"
            if n > 1:
                problemi.append(
                    f"id {radice!r} era gia' di {visti[radice]!r}: "
                    f"{voce['label']!r} prende {id_finale!r} (il troncamento a "
                    f"{LUNGHEZZA_MASSIMA_ID} caratteri le ha fatte collidere)"
                )
            voce["id"] = id_finale
            visti[id_finale] = voce["label"]

    for sezione in sorted(non_mappate):
        problemi.append(
            f"sezione non mappata in SEZIONE_A_MACRO, {non_mappate[sezione]} voci "
            f"ignorate: {sezione!r}"
        )

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

    config, problemi = costruisci_config(leggi_combinazioni(DB))
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
