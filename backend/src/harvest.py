"""Define the selections and parameter combinations harvested from AlmaLaurea.

Network access, request headers, and HTML parsing are implemented in
``tools/scarica.py``. This module only constructs selections and flat query
parameters.
"""

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
]  # 78 universities.
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
]  # 15 disciplinary groups.

ANNO = "2025"

# The graduate profile survey and employment outcomes survey use the same 93
# aggregate selections and endpoint; only `CONFIG` changes. `profilo` covers
# degree paths, while `occupazione` covers outcomes after graduation.
INDAGINI = ("profilo", "occupazione")
CONFIG = "profilo"  # Default survey.

# Base parameters select ``tutti`` without disaggregation. Each generator
# starts here and enables one selection according to its requested level.
#
# pa, cs_univ, cs_facoa, and cs_corsb are required: without them,
# CONFIG=occupazione returns HTTP 400. The set matches the query string sent
# by the website itself (see the corresponding comment in tools/scarica.py).
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
    """Return the selections to download for one survey.

    Each element is a dictionary containing ``livello``, ``codice``, and
    ``params``. Course-level selections use a separate generator.

    Args:
        config: Survey identifier.
        anno: Survey year.

    Returns:
        A list of selection dictionaries.

    Raises:
        ValueError: If ``config`` is not a supported survey.
    """
    if config not in INDAGINI:
        raise ValueError(f"indagine sconosciuta: {config!r} (attese: {INDAGINI})")

    base = dict(PARAMS_BASE, CONFIG=config, anno=anno)
    combinazioni = []

    # University level enables ``ateneo`` and leaves all other selections at
    # ``tutti``.
    for cod in ATENEI:
        params = dict(base, ateneo=cod)
        combinazioni.append({"livello": "ateneo", "codice": cod, "params": params})

    # Group level enables ``gruppo`` while ``ateneo`` remains ``tutti``.
    for cod in GRUPPI:
        params = dict(base, gruppo=cod)
        combinazioni.append({"livello": "gruppo", "codice": cod, "params": params})

    return combinazioni


# Cross-selections combine a university and disciplinary group in one request.
# The 93 aggregate selections enable only one of the two: a university
# selection mixes all disciplines, while a group selection covers all of Italy.
# Neither can answer a question about one group at one university.
#
# visualizza.php accepts flat parameters, so enabling both selections requires
# no new syntax. raccogli_scheda() and CHIAVI_SCHEDA in salva.py already retain
# both values, allowing a cross-selection to coexist without collisions.
#
# This is separate from course-level harvesting, which covers about 4,000
# courses and approximately 483 MB. The cross-selection dataset remains small
# because it contains universities multiplied by groups and surveys.

# Fixed sample of universities for a targeted university-by-group comparison
# in computing and engineering. The Polytechnic University of Milan is not an
# AlmaLaurea member and therefore does not appear in ATENEI.
ATENEI_INCROCIO = [
    "70026",  # Sapienza University of Rome
    "70027",  # University of Rome Tor Vergata
    "70117",  # Roma Tre University
    "70032",  # Polytechnic University of Turin
    "70031",  # University of Turin
    "70003",  # University of Bologna
    "70019",  # University of Padua
    "70024",  # University of Pisa
    "70010",  # University of Florence
    "70011",  # University of Genoa
    "70022",  # University of Pavia
    "70021",  # University of Parma
    "70017",  # University of Modena and Reggio Emilia
    "70023",  # University of Perugia
    "70055",  # University of L'Aquila
    "70018",  # University of Naples Federico II
    "70028",  # University of Salerno
    "70048",  # Polytechnic University of Bari
    "70008",  # University of Catania
]  # 19 universities.

# Select group 10 (Computing and ICT) and group 12 (Industrial and Information
# Engineering).
GRUPPI_INCROCIO = ["10", "12"]


def genera_incroci(atenei=None, gruppi=None, config=CONFIG, anno=ANNO):
    """Return university-by-group selections for one survey.

    Both university and group are enabled in each request. The returned
    dictionaries have the same wrapper as ``genera_combinazioni()`` so callers
    can process both forms uniformly.

    Args:
        atenei: Optional university codes.
        gruppi: Optional disciplinary-group codes.
        config: Survey identifier.
        anno: Survey year.

    Returns:
        A list of university-by-group selection dictionaries.

    Raises:
        ValueError: If a survey, university, or group code is unsupported.
    """
    if config not in INDAGINI:
        raise ValueError(f"indagine sconosciuta: {config!r} (attese: {INDAGINI})")

    atenei = list(ATENEI_INCROCIO if atenei is None else atenei)
    gruppi = list(GRUPPI_INCROCIO if gruppi is None else gruppi)

    # Reject invalid codes before downloading: the endpoint can return a page
    # for an invented code containing another selection's figures.
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


# Course-level selections use ``postcorso`` and ``corstipo``. The parser stores
# these in ``corso`` and ``tipo_corso``, both of which are part of the primary
# key, so course rows coexist with aggregate rows without collisions.
#
# Course codes are read from solotendine.php through scarica.leggi_tendine();
# they are not invented or entered manually. That endpoint requires both
# ``pa`` and ``corstipo`` to expose the course options.

# ``L`` denotes a first-cycle degree. Together with ``pa=<university>``, it
# makes courses appear in the endpoint's option lists; it is distinct from
# ``livello='1'``.
CORSTIPO_TRIENNALE = "L"


def params_tendine(ateneo, gruppo, config=CONFIG, anno=ANNO, corstipo=CORSTIPO_TRIENNALE):
    """Build parameters for listing courses at one university and group.

    ``pa`` and ``ateneo`` both use the university code: the former is the
    endpoint access context and the latter is the selection filter.

    Args:
        ateneo: University code.
        gruppo: Disciplinary-group code.
        config: Survey identifier.
        anno: Survey year.
        corstipo: Course type code.

    Returns:
        A flat parameter dictionary for ``leggi_tendine()``.

    Raises:
        ValueError: If the university or group code is unsupported.
    """
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
    """Return course-level selections for one survey.

    ``corsi_per_ateneo`` maps university codes to ``(group, course code,
    name)`` tuples as returned by ``leggi_tendine()``. The result uses the
    same wrapper as the other generators so callers can process it uniformly.

    Args:
        corsi_per_ateneo: Course tuples grouped by university code.
        config: Survey identifier.
        anno: Survey year.
        corstipo: Course type code.

    Returns:
        A list of course-level selection dictionaries.

    Raises:
        ValueError: If a survey, university, or group code is unsupported.
    """
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
