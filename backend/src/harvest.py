# Questo modulo decide COSA scaricare. Il download vero (URL, User-Agent,
# parsing) vive in tools/scarica.py: qui dentro non parte nessuna richiesta.
#
# Nota storica: c'erano una costante URL che puntava a solotendine.php e uno
# HEADERS accanto, e non li usava nessuno — il download e' sempre passato da
# VISUALIZZA_URL in scarica.py. Sono due endpoint diversi (solotendine.php dice
# quali opzioni sono valide, visualizza.php da' i numeri), e trovarli qui
# faceva credere che l'harvester interrogasse il primo. Rimossi.

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

# Le due indagini AlmaLaurea. Stesse 93 schede aggregate, stesso endpoint:
# cambia solo il valore di CONFIG.
#   profilo     -> "Percorsi di laurea": com'e' andata l'universita'.
#   occupazione -> "Esiti occupazionali della laurea": cosa succede dopo.
INDAGINI = ("profilo", "occupazione")
CONFIG = "profilo"  # default storico

# Parametri "di base": tutto su 'tutti', nessuna disaggregazione.
# Da qui partiamo e accendiamo UNA casella per volta a seconda del livello.
#
# pa / cs_univ / cs_facoa / cs_corsb non sono decorazione: senza di loro
# CONFIG=occupazione risponde HTTP 400. Set canonico, copiato dalla query
# string che manda il sito stesso (vedi il commento in tools/scarica.py).
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
    "pa": "tutti",
    "cs_univ": "tutti",
    "cs_facoa": "tutti",
    "cs_corsb": "tutti",
    "LANG": "it",
    "CONFIG": CONFIG,
}


def genera_combinazioni(config=CONFIG, anno=ANNO):
    """Restituisce la lista delle schede da scaricare per UNA indagine.
    Ogni elemento è un dict: {'livello':..., 'codice':..., 'params':...}.
    QUESTO è l'unico punto che cambia quando aggiungeremo i corsi."""
    if config not in INDAGINI:
        raise ValueError(f"indagine sconosciuta: {config!r} (attese: {INDAGINI})")

    base = dict(PARAMS_BASE, CONFIG=config, anno=anno)
    combinazioni = []

    # Livello ATENEO: accendo 'ateneo', lascio il resto su 'tutti'
    for cod in ATENEI:
        params = dict(base, ateneo=cod)
        combinazioni.append({"livello": "ateneo", "codice": cod, "params": params})

    # Livello GRUPPO: accendo 'gruppo', ateneo resta 'tutti'
    for cod in GRUPPI:
        params = dict(base, gruppo=cod)
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
