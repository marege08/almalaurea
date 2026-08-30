# -*- coding: utf-8 -*-
"""Scarica una scheda da visualizza.php e la monta in righe tidy complete."""

import re

import requests
from bs4 import BeautifulSoup

from pulizia import pulisci_valore

VISUALIZZA_URL = (
    "https://www2.almalaurea.it/cgi-php/universita/statistiche/visualizza.php"
)
HEADERS = {"User-Agent": "progetto-orientamento-laurea"}

# Una scheda ateneo che conosci: Bari (70002), profilo, anno singolo.
# Livello "ateneo": ateneo acceso, tutto il resto su 'tutti'.
#
# I quattro parametri pa / cs_univ / cs_facoa / cs_corsb sembrano superflui,
# perche' l'indagine 'profilo' risponde anche senza. NON lo sono: con
# CONFIG=occupazione la stessa richiesta senza di loro torna HTTP 400. Questo
# set e' copiato dalla query string che manda il sito stesso, trovata in un
# commento HTML dentro docs/solotendine.php: e' il contratto vero, non
# ricostruito a memoria.
PARAMS = {
    "anno": "2025",
    "corstipo": "tutti",
    "ateneo": "70002",
    "facolta": "tutti",
    "gruppo": "tutti",
    "livello": "tutti",
    "area4": "tutti",
    "classe": "tutti",
    "postcorso": "tutti",
    "regione": "tutti",
    "dimensione": "tutti",
    "isstella": "0",
    "presiui": "tutti",
    "disaggregazione": "",
    "pa": "tutti",
    "cs_univ": "tutti",
    "cs_facoa": "tutti",
    "cs_corsb": "tutti",
    "LANG": "it",
    "CONFIG": "profilo",
}

# Le tabelle-dato hanno id 'datiN' e class 'datiprofiloM'.
#
# Nelle schede 'occupazione' le stesse sezioni compaiono DUE volte, una per
# ciascuna definizione ufficiale di "occupato", con sezione/categoria/
# indicatore identici. L'unico segno che le distingue e' quel numero di
# classe: il secondo blocco e' lo stesso indice +100. Confermato dal
# JavaScript della pagina (swapBlocchi), che nasconde .datiprofilo4..11 e
# mostra .datiprofilo104..114 quando la definizione attiva e' quella ampia.
# Sono due numeri ufficiali diversi, non un dettaglio di visualizzazione.
RE_ID_TABELLA = re.compile(r"^dati(\d+)$")
RE_CLASSE_BLOCCO = re.compile(r"^datiprofilo(\d+)$")
SOGLIA_BLOCCO_AMPIA = 100


def scarica_scheda(params):
    risposta = requests.get(VISUALIZZA_URL, params=params, headers=HEADERS, timeout=30)
    risposta.raise_for_status()
    return risposta.text


def e_intestazione_colonna(testo):
    """Vero se la cella e' l'intestazione di colonna 'Collettivo selezionato',
    con o senza un richiamo a nota tipo '(1)' attaccato. Usato come marcatore
    di struttura: niente che la contenga e' un dato."""
    return testo.startswith("Collettivoselezionato")


def tabelle_dato(zuppa):
    """Tutte le tabelle-dato della scheda, in ordine, ESCLUSA dati1 (che e' la
    numerosita', non dati). Scoperte dal documento invece che assunte: 'profilo'
    ne ha 11, 'occupazione' 16. Il vecchio range(2, 12) cablato perdeva le
    tabelle oltre l'undicesima senza dire niente — su una scheda occupazione
    faceva sparire 67 righe su 177."""
    trovate = []
    for tabella in zuppa.find_all("table", id=True):
        m = RE_ID_TABELLA.match(tabella["id"])
        if m and int(m.group(1)) >= 2:
            trovate.append((int(m.group(1)), tabella))
    trovate.sort(key=lambda coppia: coppia[0])
    return [tabella for _, tabella in trovate]


def indice_blocco(tabella):
    """Il numero N della classe 'datiprofiloN' di questa tabella, o None.
    E' la classe a distinguere i blocchi, non l'id: gli id (dati2, dati3, ...)
    sono un contatore progressivo che non dice niente su chi e' chi."""
    for classe in tabella.get("class", []):
        m = RE_CLASSE_BLOCCO.match(classe)
        if m:
            return int(m.group(1))
    return None


def indici_blocco(zuppa):
    """Tutti gli indici 'datiprofiloN' presenti nella scheda. Serve a sapere
    se un blocco ha il suo gemello: e' quello che distingue un blocco specifico
    di una definizione da un blocco condiviso."""
    return {
        i
        for tabella in zuppa.find_all("table", id=True)
        if (i := indice_blocco(tabella)) is not None
    }


def definizione_di(tabella, indagine, indici_presenti):
    """Quale definizione di "occupato" descrive questa tabella.

    '' per l'indagine 'profilo', dove il doppione non esiste.
    'sconosciuta' se la classe attesa non c'e': un valore che NON collide con
    gli altri, cosi' una sorpresa di struttura resta visibile nel dato invece
    di sovrascrivere silenziosamente una riga buona.

    NON basta guardare il numero. La pagina porta le due versioni una dopo
    l'altra, la seconda con lo stesso indice +100, e il suo swapBlocchi()
    nasconde .datiprofilo4..11 mostrando .datiprofilo104..114. Ma il ciclo che
    NASCONDE parte da 4 mentre quello che MOSTRA parte da 3: .datiprofilo3
    resta visibile in entrambe le modalita', ed e' figlio unico (103 non
    esiste). Quindi "non e' >= 100" significa soltanto "non e' la copia
    ampia" — per un blocco appaiato equivale a "restrittiva", per un blocco
    spaiato no. Prima si dava per scontato che equivalesse sempre, e le 837
    righe di "2b. Formazione post-laurea" finivano marchiate 'restrittiva' pur
    valendo per entrambe: filtrando su 'ampia' sarebbero sparite dalla vista
    pur avendo dati buoni. Ora il gemello si guarda invece di presumerlo."""
    if indagine != "occupazione":
        return ""
    indice = indice_blocco(tabella)
    if indice is None:
        return "sconosciuta"
    if indice >= SOGLIA_BLOCCO_AMPIA:
        return "ampia"
    if indice + SOGLIA_BLOCCO_AMPIA in indici_presenti:
        return "restrittiva"
    return "condivisa"


def estrai_righe(tabella):
    """Da una tabella dati2..dati11 a righe-dato, scorrendo le celle in modo
    lineare senza assumere un passo fisso (il preambolo puo' essere dispari).
    Ogni riga: {sezione, categoria, indicatore, valore} (valore ancora grezzo)."""
    sezione = tabella.get("summary", "").strip()
    celle = [c.get_text(strip=True) for c in tabella.find_all(["th", "td"])]

    righe = []
    categoria = None
    i = 0
    while i < len(celle):
        testo = celle[i]

        # cella di pura struttura: vuota, titolo sezione, header colonna
        if testo == "" or testo == sezione or e_intestazione_colonna(testo):
            i += 1
            continue

        valore = celle[i + 1] if i + 1 < len(celle) else ""

        # Se il "valore" e' l'intestazione di colonna, allora 'testo' e' un titolo
        # di tabella (non un indicatore): lo salto. Difende dal caso in cui il
        # titolo nella cella non combacia col 'summary' per via di apici diversi.
        if e_intestazione_colonna(valore):
            i += 1
            continue

        if valore == "":
            # etichetta senza valore = intestazione di categoria (contesto persistente)
            categoria = testo
            i += 1
        else:
            righe.append(
                {
                    "sezione": sezione,
                    "categoria": categoria,
                    "indicatore": testo,
                    "valore": valore,
                }
            )
            i += 2

    return righe


def estrai_numerosita(dati1):
    """Da dati1 ('PERCORSI DI LAUREA') -> numero_laureati (base amministrativa),
    numero_compilatori (base questionario) e tasso_compilazione (gia' dato dalla
    fonte, non ricalcolato). Cerca le etichette per contenuto: una piccola
    variazione di dicitura non rompe; se un'etichetta sparisce lo segnala."""
    celle = [c.get_text(strip=True) for c in dati1.find_all(["th", "td"])]
    titolo = dati1.get("summary", "").strip()

    coppie = {}
    i = 0
    while i < len(celle):
        testo = celle[i]
        if testo == "" or testo == titolo or e_intestazione_colonna(testo):
            i += 1
            continue
        valore = celle[i + 1] if i + 1 < len(celle) else ""
        coppie[testo] = valore
        i += 2

    def trova(frammento):
        for etichetta, valore in coppie.items():
            if frammento in etichetta.lower():
                return valore
        return None

    def numero(grezzo, intero=False):
        if grezzo is None:
            return None
        v, _ = pulisci_valore(grezzo)
        if v is None:
            return None
        return int(v) if intero else v

    g_laureati = trova("numero di laureati")
    # 'profilo' dice "hanno compilato il questionario", 'occupazione' dice
    # "Numero di intervistati". E' la stessa grandezza — la base del
    # questionario — chiamata in due modi: si cercano entrambe le diciture.
    g_compilatori = trova("compilato") or trova("intervistat")
    # In 'occupazione' ci sono due tassi di risposta (sul totale dei laureati e
    # sui contattabili): trova() prende il primo, cioe' quello sul totale.
    g_tasso = trova("tasso")

    risultato = {
        "numero_laureati": numero(g_laureati, intero=True),
        "numero_compilatori": numero(g_compilatori, intero=True),
        "tasso_compilazione": numero(g_tasso),
        "_raw": {
            "laureati": g_laureati,
            "compilatori": g_compilatori,
            "tasso": g_tasso,
        },
    }
    mancanti = [
        k for k in ("numero_laureati", "numero_compilatori") if risultato[k] is None
    ]
    if mancanti:
        risultato["_attenzione"] = f"etichette non trovate: {mancanti}"
    return risultato


def raccogli_scheda(html, params):
    """Da una scheda intera -> lista di righe tidy complete.
    Monta: identificativi (specchio della selezione) + numerosita' (da dati1)
    + dati (dati2..dati11), con valore pulito e simboli speciali conservati."""
    zuppa = BeautifulSoup(html, "html.parser")

    dati1 = zuppa.find("table", id="dati1")
    num = estrai_numerosita(dati1) if dati1 is not None else {}

    def norm(v):  # 'tutti' / assente = casella spenta -> stringa vuota
        return "" if v in ("tutti", None) else v

    indagine = params.get("CONFIG", "")  # profilo / occupazione
    identificativi = {
        "anno": params.get("anno", ""),  # 'tutti' = serie storica: lo lascio com'e'
        "indagine": indagine,
        "tipo_corso": norm(params.get("corstipo")),
        "ateneo": norm(params.get("ateneo")),
        "gruppo": norm(params.get("gruppo")),
        "classe": norm(params.get("classe")),
        "corso": norm(params.get("postcorso")),
    }

    # L'avviso di estrai_numerosita non va ingoiato: prima veniva calcolato e
    # buttato, quindi un'etichetta cambiata si traduceva in colonne NULL senza
    # che nessuno se ne accorgesse. Meglio rumoroso che silenzioso.
    if num.get("_attenzione"):
        etichetta = " ".join(
            f"{k}={v}" for k, v in identificativi.items() if v
        )
        print(f"    ATTENZIONE numerosita' [{etichetta}]: {num['_attenzione']}")

    righe = []
    indici_presenti = indici_blocco(zuppa)
    for tab in tabelle_dato(zuppa):
        definizione = definizione_di(tab, indagine, indici_presenti)
        if definizione == "sconosciuta":
            print(
                f"    ATTENZIONE: tabella {tab.get('id')} senza classe "
                f"'datiprofiloN' riconoscibile: definizione non determinata."
            )
        for r in estrai_righe(tab):
            valore, nota = pulisci_valore(r["valore"])
            righe.append(
                {
                    **identificativi,
                    "definizione": definizione,
                    "sezione": r["sezione"],
                    "categoria": r["categoria"]
                    or "",  # None (nessuna categoria) -> '' per SQL
                    "indicatore": r["indicatore"],
                    "valore": valore,
                    "nota": nota,
                    "valore_raw": r["valore"],
                    "numero_laureati": num.get("numero_laureati"),
                    "numero_compilatori": num.get("numero_compilatori"),
                }
            )
    return righe


if __name__ == "__main__":
    # UNA sola richiesta al sito (frequenza educata): scarico, poi lavoro sull'HTML.
    html = scarica_scheda(PARAMS)
    print(f"Pagina scaricata: {len(html)} caratteri\n")

    num = estrai_numerosita(
        BeautifulSoup(html, "html.parser").find("table", id="dati1")
    )
    print("Numerosita' (da dati1):")
    for k, v in num.items():
        print(f"  {k:<22} = {v!r}")

    righe = raccogli_scheda(html, PARAMS)
    print(f"\nRighe tidy complete: {len(righe)}")

    # Conteggio per sezione: ci dice se tutte le 10 sezioni hanno prodotto righe.
    from collections import Counter

    print("\nRighe per sezione:")
    for sez, n in Counter(r["sezione"] for r in righe).items():
        print(f"  {n:>4}  {sez}")

    # Campione: prime 8 righe.
    print("\nCampione (prime 8 righe):")
    for r in righe[:8]:
        print(
            f"  [{r['sezione'][:22]:<22}] [{str(r['categoria'])[:22]:<22}] "
            f"{r['indicatore'][:34]:<34} = {r['valore']!s:<7} ({r['valore_raw']})"
        )

    # Righe con simbolo speciale: devono comparire con la loro nota, non sparire.
    speciali = [r for r in righe if r["nota"] not in (None, "vuoto")]
    print(f"\nRighe con simbolo speciale: {len(speciali)}")
    for r in speciali[:5]:
        print(
            f"  {r['indicatore'][:34]:<34} raw={r['valore_raw']!r:<5} nota={r['nota']}"
        )

    # Controllo di salute: 'non_riconosciuto' DEVE essere zero. Se non lo e', si guarda.
    rossi = [r for r in righe if r["nota"] == "non_riconosciuto"]
    print(f"\nValori non riconosciuti (devono essere 0): {len(rossi)}")
    for r in rossi[:10]:
        print(f"  {r['sezione']} / {r['indicatore']} = {r['valore_raw']!r}")
