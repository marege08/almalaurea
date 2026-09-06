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


# --------------------------------------------------------------------------
# INCROCIO ateneo x gruppo
#
# Le 93 schede di genera_combinazioni() accendono UNA casella per volta:
# o l'ateneo (e allora il gruppo e' 'tutti', tutte le discipline mescolate)
# o il gruppo (e allora l'ateneo e' 'tutti', tutta Italia). Nessuna delle due
# risponde a "come va Informatica a Pisa": la prima annega informatica dentro
# medicina e lettere, la seconda non distingue gli atenei.
#
# visualizza.php prende parametri piatti, quindi accendere ateneo E gruppo
# insieme e' legale: nessuna sintassi nuova, si passano tutti e due.
# raccogli_scheda() copia gia' entrambi nelle righe, e CHIAVI_SCHEDA in
# salva.py li contiene entrambi: per il database una scheda incrociata e'
# una scheda a se', non collide con niente di esistente.
#
# NON e' la Fase 4 (livello-corso, 4.000 corsi, ~483 MB). Qui il conto e'
# atenei x gruppi x indagini, e resta piccolo di proposito.

# Rosa scelta il 30 ago 2026 con Mare: parte da Roma (dove vive: pendolare =
# zero affitto), piu' gli atenei del resto d'Italia dove informatica e
# ingegneria sono serie e il costo della vita e' sostenibile. Milano e Trento
# sono fuori per il costo degli affitti; il Politecnico di Milano non e'
# consorziato AlmaLaurea e infatti non compare in ATENEI.
ATENEI_INCROCIO = [
    "70026",  # Roma Sapienza
    "70027",  # Roma Tor Vergata
    "70117",  # Roma Tre
    "70032",  # Torino Politecnico
    "70031",  # Torino
    "70003",  # Bologna
    "70019",  # Padova
    "70024",  # Pisa
    "70010",  # Firenze
    "70011",  # Genova
    "70022",  # Pavia
    "70021",  # Parma
    "70017",  # Modena e Reggio Emilia
    "70023",  # Perugia
    "70055",  # L'Aquila
    "70018",  # Napoli Federico II
    "70028",  # Salerno
    "70048",  # Bari Politecnico
    "70008",  # Catania
]  # 19 atenei

# 10 = Informatica e Tecnologie ICT, 12 = Ingegneria industriale e
# dell'informazione. Sono i due gruppi fra cui si decide, e la robotica sta
# a cavallo dei due (meccatronica e automazione stanno nel 12).
GRUPPI_INCROCIO = ["10", "12"]


def genera_incroci(atenei=None, gruppi=None, config=CONFIG, anno=ANNO):
    """Le schede ateneo x gruppo per UNA indagine: accende ateneo E gruppo
    nella stessa richiesta. Stesso involucro di genera_combinazioni()
    ({'livello', 'codice', 'params'}), cosi' esegui() non distingue i due casi."""
    if config not in INDAGINI:
        raise ValueError(f"indagine sconosciuta: {config!r} (attese: {INDAGINI})")

    atenei = list(ATENEI_INCROCIO if atenei is None else atenei)
    gruppi = list(GRUPPI_INCROCIO if gruppi is None else gruppi)

    # Sbaglia rumorosamente invece di scaricare 76 schede sbagliate: un codice
    # inventato torna comunque una pagina, solo con i numeri di qualcun altro.
    if ignoti := [a for a in atenei if a not in ATENEI]:
        raise ValueError(f"codici ateneo non nella lista ufficiale: {ignoti}")
    if ignoti := [g for g in gruppi if g not in GRUPPI]:
        raise ValueError(f"codici gruppo non nella lista ufficiale: {ignoti}")

    base = dict(PARAMS_BASE, CONFIG=config, anno=anno)
    return [
        {
            "livello": "ateneo+gruppo",
            "codice": f"{ateneo}/{gruppo}",
            "params": dict(base, ateneo=ateneo, gruppo=gruppo),
        }
        for ateneo in atenei
        for gruppo in gruppi
    ]


# --------------------------------------------------------------------------
# LIVELLO CORSO (Fase 4)
#
# Il livello che il commento di genera_combinazioni() prometteva da sempre
# ("QUESTO e' l'unico punto che cambia quando aggiungeremo i corsi").
#
# Perche' non ha rotto niente: il parser di scarica.py copia gia' 'postcorso'
# nella colonna `corso` e 'corstipo' in `tipo_corso`, ed entrambe stanno nella
# chiave primaria. Una scheda-corso ha tipo_corso='L' e corso valorizzato,
# dove gli aggregati hanno ''. Non collidono: convivono nella stessa tabella.
#
# I codici corso NON si inventano e non si scrivono a mano: sono stringhe di
# 16 cifre che si leggono da solotendine.php con scarica.leggi_tendine().
# Vedi li' le due condizioni che sbloccano le tendine (pa e corstipo).

# 'L' = laurea di primo livello. E' il valore che, insieme a pa=<ateneo>,
# fa comparire i corsi nelle tendine. Non confonderlo con livello='1'.
CORSTIPO_TRIENNALE = "L"


def params_tendine(ateneo, gruppo, config=CONFIG, anno=ANNO, corstipo=CORSTIPO_TRIENNALE):
    """I parametri da passare a scarica.leggi_tendine() per farsi elencare i
    corsi di UN ateneo dentro UN gruppo disciplinare. 'pa' e 'ateneo' vanno
    entrambi valorizzati con lo stesso codice: il primo e' il punto di
    accesso, il secondo il filtro."""
    if ateneo not in ATENEI:
        raise ValueError(f"codice ateneo non nella lista ufficiale: {ateneo!r}")
    if gruppo not in GRUPPI:
        raise ValueError(f"codice gruppo non nella lista ufficiale: {gruppo!r}")
    return dict(
        PARAMS_BASE,
        CONFIG=config,
        anno=anno,
        pa=ateneo,
        ateneo=ateneo,
        gruppo=gruppo,
        corstipo=corstipo,
    )


def genera_corsi(corsi_per_ateneo, config=CONFIG, anno=ANNO, corstipo=CORSTIPO_TRIENNALE):
    """Le schede a livello di CORSO per UNA indagine.

    corsi_per_ateneo: {codice_ateneo: [(gruppo, codice_corso, nome), ...]},
    cosi' come lo restituisce la scoperta fatta con leggi_tendine().
    Stesso involucro delle altre generatrici, cosi' esegui() non distingue."""
    if config not in INDAGINI:
        raise ValueError(f"indagine sconosciuta: {config!r} (attese: {INDAGINI})")

    base = dict(PARAMS_BASE, CONFIG=config, anno=anno)
    combinazioni = []
    for ateneo, corsi in corsi_per_ateneo.items():
        if ateneo not in ATENEI:
            raise ValueError(f"codice ateneo non nella lista ufficiale: {ateneo!r}")
        for gruppo, codice, nome in corsi:
            if gruppo not in GRUPPI:
                raise ValueError(f"codice gruppo non nella lista ufficiale: {gruppo!r}")
            params = dict(
                base,
                pa=ateneo,
                ateneo=ateneo,
                gruppo=gruppo,
                corstipo=corstipo,
                postcorso=codice,
            )
            combinazioni.append(
                {
                    "livello": "corso",
                    "codice": f"{ateneo}/{codice}",
                    "nome": nome,
                    "params": params,
                }
            )
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
