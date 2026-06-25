import requests
from bs4 import BeautifulSoup

# L'endpoint che hai scoperto. I parametri li teniamo separati dall'URL:
# è più leggibile e requests li codifica correttamente per noi.
URL = "https://www2.almalaurea.it/cgi-php/universita/statistiche/solotendine.php"


# Uno User-Agent onesto: ti identifichi invece di fingerti un browser.
# È la "frequenza educata" che ti eri imposto, applicata all'identità.
HEADERS = {"User-Agent": "progetto-orientamento-laurea"}


ATENEI = [
    "70002",
    "70048",
    "70038",
    "70051",
    "70003",
    "70130",
    "70046",
    "70004",
    "70005",
    "70006",
    "70049",
    "70007",
    "70008",
    "70125",
    "70053",
    "70149",
    "70146",
    "70009",
    "70010",
    "70129",
    "70011",
    "70153",
    "70135",
    "70055",
    "70050",
    "70137",
    "70013",
    "70001",
    "70014",
    "70015",
    "70132",
    "71003",
    "70058",
    "70119",
    "70017",
    "70039",
    "70059",
    "70018",
    "70042",
    "70041",
    "70019",
    "70020",
    "70021",
    "70022",
    "70023",
    "70099",
    "70136",
    "70024",
    "70047",
    "70110",
    "70147",
    "70121",
    "71001",
    "70060",
    "70026",
    "70027",
    "70117",
    "70303",
    "70220",
    "70012",
    "70028",
    "70124",
    "70029",
    "70145",
    "70030",
    "70097",
    "70118",
    "70031",
    "70032",
    "70062",
    "70033",
    "70035",
    "70034",
    "70063",
    "70141",
    "70036",
    "70037",
    "70040",
]  # 78 atenei
GRUPPI = [
    "13",
    "11",
    "2",
    "7",
    "1",
    "8",
    "10",
    "12",
    "3",
    "4",
    "14",
    "5",
    "6",
    "9",
    "15",
]  # 15 gruppi

ANNO = "2025"
CONFIG = "profilo"

# Parametri "di base": tutto su 'tutti', nessuna disaggregazione.
# Da qui partiamo e accendiamo UNA casella per volta a seconda del livello.
PARAMS_BASE = {
    "anno": ANNO,
    "corstipo": "tutti",
    "ateneo": "tutti",
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
    "CONFIG": CONFIG,
}


def genera_combinazioni():
    """Restituisce la lista delle schede da scaricare.
    Ogni elemento è un dict: {'livello':..., 'codice':..., 'params':...}.
    QUESTO è l'unico punto che cambia quando aggiungeremo i corsi."""

    combinazioni = []

    # Livello ATENEO: accendo 'ateneo', lascio il resto su 'tutti'
    for cod in ATENEI:
        params = dict(PARAMS_BASE, ateneo=cod)
        combinazioni.append({"livello": "ateneo", "codice": cod, "params": params})

    # Livello GRUPPO: accendo 'gruppo', ateneo resta 'tutti'
    for cod in GRUPPI:
        params = dict(PARAMS_BASE, gruppo=cod)
        combinazioni.append({"livello": "gruppo", "codice": cod, "params": params})

    return combinazioni


if __name__ == "__main__":
    combo = genera_combinazioni()
    print(f"Totale schede da scaricare: {len(combo)}")
    for c in combo[:3]:
        print(
            f"  livello={c['livello']:<7} codice={c['codice']:<8} "
            f"ateneo={c['params']['ateneo']:<6} gruppo={c['params']['gruppo']}"
        )
    print("  ...")
    for c in combo[-2:]:
        print(
            f"  livello={c['livello']:<7} codice={c['codice']:<8} "
            f"ateneo={c['params']['ateneo']:<6} gruppo={c['params']['gruppo']}"
        )
