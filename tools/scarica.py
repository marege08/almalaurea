# -*- coding: utf-8 -*-
"""Download an AlmaLaurea sheet from visualizza.php and build tidy rows."""

import re

import requests
from bs4 import BeautifulSoup

from pulizia import pulisci_valore

VISUALIZZA_URL = (
    "https://www2.almalaurea.it/cgi-php/universita/statistiche/visualizza.php"
)
HEADERS = {"User-Agent": "progetto-orientamento-laurea"}

# The other endpoint: visualizza.php returns figures, while solotendine.php
# lists valid options. It is the only reliable way to discover which courses
# exist at a university instead of guessing course codes.
SOLOTENDINE_URL = (
    "https://www2.almalaurea.it/cgi-php/universita/statistiche/solotendine.php"
)

# A known university sheet: Bari (70002), graduate profile survey, single year.
# At university level, ``ateneo`` is enabled and all other selections are
# ``tutti``.
#
# The four parameters pa, cs_univ, cs_facoa, and cs_corsb appear unnecessary
# because the graduate profile survey also responds without them. They are required for
# `CONFIG=occupazione`, where omitting them returns HTTP 400. This set is copied
# from the query string that the AlmaLaurea website itself sends; it is the
# observed endpoint contract.
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

# Data tables have an id of ``datiN`` and a class of ``datiprofiloM``.
#
# In employment outcomes survey sheets, the same sections appear twice, once for each official
# definition of "employed", with identical section, category, and indicator.
# The class number distinguishes them: the second block has the first index
# plus 100. The page JavaScript (swapBlocchi) hides .datiprofilo4..11 and
# shows .datiprofilo104..114 for the broad definition. These are two distinct
# official figures, not merely a display detail.
RE_ID_TABELLA = re.compile(r"^dati(\d+)$")
RE_CLASSE_BLOCCO = re.compile(r"^datiprofilo(\d+)$")
SOGLIA_BLOCCO_AMPIA = 100


def scarica_scheda(params):
    """Download one sheet and return its HTML response body.

    Args:
        params: Flat query parameters accepted by visualizza.php.

    Returns:
        The response body as HTML text.

    Raises:
        requests.RequestException: If the request fails or returns an error.
    """
    risposta = requests.get(VISUALIZZA_URL, params=params, headers=HEADERS, timeout=30)
    risposta.raise_for_status()
    return risposta.text



def leggi_tendine(params):
    """Return valid dropdown options for one selection from solotendine.php.

    The result maps each dropdown name to ``(value, label)`` pairs and omits
    ``tutti``, which is an interface placeholder rather than a real choice.
    The ``classe`` and ``postcorso`` lists remain empty unless ``pa`` contains
    the university code and ``corstipo`` is enabled with ``L``. ``livello=1``
    alone is insufficient because it filters data rather than identifying the
    course type. ``pa`` is the access-point value carried by the website form
    field ``<input type="hidden" name="pa">``; without it, the site does not
    know which university's courses to list. The ``pa`` and ``corstipo``
    requirements are observed from the endpoint's form behaviour.

    Args:
        params: Flat query parameters accepted by solotendine.php.

    Returns:
        A mapping from dropdown names to ``(value, label)`` pairs.

    Raises:
        requests.RequestException: If the request fails or returns an error.
    """
    risposta = requests.get(
        SOLOTENDINE_URL, params=params, headers=HEADERS, timeout=30
    )
    risposta.raise_for_status()
    zuppa = BeautifulSoup(risposta.text, "html.parser")

    tendine = {}
    for select in zuppa.find_all("select"):
        nome = select.get("name") or select.get("id")
        if not nome:
            continue
        tendine[nome] = [
            (opzione.get("value"), opzione.get_text(strip=True))
            for opzione in select.find_all("option")
            if opzione.get("value") not in (None, "", "tutti")
        ]
    return tendine


def e_intestazione_colonna(testo):
    """Return whether a cell is the selected-collective column header.

    The header may include an attached note marker such as ``(1)``. It is a
    structural marker, so a cell containing it is not data.

    Args:
        testo: Normalized cell text.

    Returns:
        ``True`` when the text is the selected-collective header.
    """
    return testo.startswith("Collettivoselezionato")


def tabelle_dato(zuppa):
    """Return all data tables in document order, excluding ``dati1``.

    ``dati1`` contains counts rather than indicators. The tables are discovered
    from the document: graduate profile survey sheets contain 11 and
    employment outcomes survey sheets 16.
    A fixed ``range(2, 12)`` would silently omit tables beyond the eleventh;
    on an employment outcomes survey sheet, it would omit 67 of 177 rows.

    Args:
        zuppa: Parsed sheet document.

    Returns:
        Data tables in document order.
    """
    trovate = []
    for tabella in zuppa.find_all("table", id=True):
        m = RE_ID_TABELLA.match(tabella["id"])
        if m and int(m.group(1)) >= 2:
            trovate.append((int(m.group(1)), tabella))
    trovate.sort(key=lambda coppia: coppia[0])
    return [tabella for _, tabella in trovate]


def indice_blocco(tabella):
    """Return this table's ``datiprofiloN`` class number, or ``None``.

    The class distinguishes blocks; ids such as ``dati2`` and ``dati3`` are
    only progressive counters and do not identify the block's meaning.

    Args:
        tabella: Parsed data table.

    Returns:
        The block index, or ``None`` when no matching class is present.
    """
    for classe in tabella.get("class", []):
        m = RE_CLASSE_BLOCCO.match(classe)
        if m:
            return int(m.group(1))
    return None


def indici_blocco(zuppa):
    """Return all ``datiprofiloN`` indices present in the sheet.

    The set identifies whether a block has a paired counterpart and therefore
    distinguishes definition-specific blocks from shared blocks.

    Args:
        zuppa: Parsed sheet document.

    Returns:
        The set of present block indices.
    """
    return {
        i
        for tabella in zuppa.find_all("table", id=True)
        if (i := indice_blocco(tabella)) is not None
    }


def definizione_di(tabella, indagine, indici_presenti):
    """Return which employment definition describes a table.

    Return ``''`` for graduate profile survey sheets, where the duplicate does not exist, and
    ``sconosciuta`` when the expected class is absent. The latter value keeps
    unexpected structure visible rather than silently overwriting a valid row.

    The number alone is insufficient. The page places the second version at
    the first index plus 100; its swapBlocchi() hides .datiprofilo4..11 and
    shows .datiprofilo104..114. Because the hide loop starts at 4 and the show
    loop starts at 3, .datiprofilo3 remains visible in both modes and has no
    .datiprofilo103 counterpart. Thus an index below 100 means only that the
    block is not the broad copy: it means restrictive for paired blocks, but
    not for an unpaired block. The unpaired "2b. Formazione post-laurea"
    contains 837 rows valid for both definitions, so classifying it as
    restrictive would hide valid data when filtering for the broad definition.
    The counterpart is therefore checked explicitly.

    Args:
        tabella: Parsed data table.
        indagine: Survey identifier.
        indici_presenti: Block indices present in the sheet.

    Returns:
        The employment-definition label for the table.
    """
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
    """Extract tidy rows from a data table.

    Cells are scanned linearly without assuming a fixed stride because the
    introductory content may have an irregular length. Each row contains
    ``sezione``, ``categoria``, ``indicatore``, and the still-raw ``valore``.

    Args:
        tabella: Parsed data table.

    Returns:
        A list of extracted row dictionaries.
    """
    sezione = tabella.get("summary", "").strip()
    celle = [c.get_text(strip=True) for c in tabella.find_all(["th", "td"])]

    righe = []
    categoria = None
    i = 0
    while i < len(celle):
        testo = celle[i]

        # Structural cells contain no value: blank, section title, or header.
        if testo == "" or testo == sezione or e_intestazione_colonna(testo):
            i += 1
            continue

        valore = celle[i + 1] if i + 1 < len(celle) else ""

        # If the candidate value is a column header, the current text is a
        # table title rather than an indicator. This also handles titles whose
        # punctuation differs from the table summary.
        if e_intestazione_colonna(valore):
            i += 1
            continue

        if valore == "":
            # A label without a value introduces a persistent category context.
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
    """Extract counts and response rate from ``dati1``.

    Returns the administrative graduate count, questionnaire respondent count,
    and source-provided response rate without recalculating it. Labels are
    matched by content so small wording changes do not break extraction; a
    missing label is reported in the result.

    Args:
        dati1: Parsed counts table.

    Returns:
        A dictionary containing counts, response rate, and raw source values.
    """
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
    # The graduate profile survey uses "hanno compilato il questionario",
    # while the employment outcomes survey uses "Numero di intervistati";
    # the code matches "compilato" or "intervistat".
    g_compilatori = trova("compilato") or trova("intervistat")
    # Occupation sheets contain rates over all graduates and over contactable
    # graduates; trova() takes the first, which is the rate over all graduates.
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
    """Convert a complete sheet into a list of tidy rows.

    Rows contain selection identifiers, counts from ``dati1``, and indicators
    from the remaining data tables. Values are parsed while special symbols
    remain represented by their annotations and raw text.

    Args:
        html: Complete sheet HTML.
        params: Query parameters used to request the sheet.

    Returns:
        A list of tidy row dictionaries.
    """
    zuppa = BeautifulSoup(html, "html.parser")

    dati1 = zuppa.find("table", id="dati1")
    num = estrai_numerosita(dati1) if dati1 is not None else {}

    def norm(v):  # ``tutti`` and absent selections represent an empty field.
        return "" if v in ("tutti", None) else v

    indagine = params.get("CONFIG", "")  # ``profilo`` or ``occupazione``.
    identificativi = {
        "anno": params.get("anno", ""),  # ``tutti`` denotes a time series.
        "indagine": indagine,
        "tipo_corso": norm(params.get("corstipo")),
        "ateneo": norm(params.get("ateneo")),
        "gruppo": norm(params.get("gruppo")),
        "classe": norm(params.get("classe")),
        "corso": norm(params.get("postcorso")),
    }

    # Surface missing count labels instead of allowing changed source wording
    # to produce NULL columns without an explicit warning.
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
                    or "",  # SQL stores the absence of a category as ``''``.
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
    # Make one request, then process the returned HTML locally.
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

    # Count rows by section to check that every section produced output.
    from collections import Counter

    print("\nRighe per sezione:")
    for sez, n in Counter(r["sezione"] for r in righe).items():
        print(f"  {n:>4}  {sez}")

    # Display a sample of the first eight rows.
    print("\nCampione (prime 8 righe):")
    for r in righe[:8]:
        print(
            f"  [{r['sezione'][:22]:<22}] [{str(r['categoria'])[:22]:<22}] "
            f"{r['indicatore'][:34]:<34} = {r['valore']!s:<7} ({r['valore_raw']})"
        )

    # Special-symbol rows retain their annotations instead of disappearing.
    speciali = [r for r in righe if r["nota"] not in (None, "vuoto")]
    print(f"\nRighe con simbolo speciale: {len(speciali)}")
    for r in speciali[:5]:
        print(
            f"  {r['indicatore'][:34]:<34} raw={r['valore_raw']!r:<5} nota={r['nota']}"
        )

    # Unrecognized values should be zero; print them for inspection otherwise.
    rossi = [r for r in righe if r["nota"] == "non_riconosciuto"]
    print(f"\nValori non riconosciuti (devono essere 0): {len(rossi)}")
    for r in rossi[:10]:
        print(f"  {r['sezione']} / {r['indicatore']} = {r['valore_raw']!r}")
