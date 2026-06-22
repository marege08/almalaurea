# -*- coding: utf-8 -*-
"""Scarica una scheda da visualizza.php e la monta in righe tidy complete."""

import requests
from bs4 import BeautifulSoup

from pulizia import pulisci_valore

VISUALIZZA_URL = (
    "https://www2.almalaurea.it/cgi-php/universita/statistiche/visualizza.php"
)
HEADERS = {"User-Agent": "progetto-orientamento-laurea"}

# Una scheda ateneo che conosci: Bari (70002), profilo, anno singolo.
# Livello "ateneo": ateneo acceso, tutto il resto su 'tutti'.
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
    "LANG": "it",
    "CONFIG": "profilo",
}


def scarica_scheda(params):
    risposta = requests.get(VISUALIZZA_URL, params=params, headers=HEADERS, timeout=30)
    risposta.raise_for_status()
    return risposta.text


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
        if testo == "" or testo == sezione or testo == "Collettivoselezionato":
            i += 1
            continue

        valore = celle[i + 1] if i + 1 < len(celle) else ""

        # Se il "valore" e' l'intestazione di colonna, allora 'testo' e' un titolo
        # di tabella (non un indicatore): lo salto. Difende dal caso in cui il
        # titolo nella cella non combacia col 'summary' per via di apici diversi.
        if valore == "Collettivoselezionato":
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
        if testo == "" or testo == titolo or testo == "Collettivoselezionato":
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
    g_compilatori = trova("compilato")
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

    identificativi = {
        "anno": params.get("anno", ""),  # 'tutti' = serie storica: lo lascio com'e'
        "indagine": params.get("CONFIG", ""),  # profilo / occupazione
        "tipo_corso": norm(params.get("corstipo")),
        "ateneo": norm(params.get("ateneo")),
        "gruppo": norm(params.get("gruppo")),
        "classe": norm(params.get("classe")),
        "corso": norm(params.get("postcorso")),
    }

    righe = []
    for n in range(2, 12):  # dati2 ... dati11
        tab = zuppa.find("table", id=f"dati{n}")
        if tab is None:
            continue
        for r in estrai_righe(tab):
            valore, nota = pulisci_valore(r["valore"])
            righe.append(
                {
                    **identificativi,
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
