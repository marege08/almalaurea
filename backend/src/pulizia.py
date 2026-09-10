# -*- coding: utf-8 -*-
"""Interpret an AlmaLaurea value cell.

This module contains pure logic without network or HTML dependencies, making
the parsing rules straightforward to test in isolation. The rules follow
AlmaLaurea's methodological notes, section 4.3, for symbols and Italian
numeric formatting.
"""

# Conventional symbols are not generic missing values; each has a distinct meaning.
SIMBOLI = {
    "*": "oscurato_meno_di_5",  # Groups below five units have suppressed statistics.
    "-": "zero_casi",  # The phenomenon was recorded, but there were zero cases.
    "/": "non_disponibile",  # The data is unavailable or not comparable in a time series.
}


def pulisci_valore(grezzo):
    """Interpret a value cell and return its parsed value and annotation.

    The value is a float for numeric input and otherwise ``None``. The
    annotation records a symbol or parsing anomaly and is otherwise ``None``.
    Callers retain the original string for traceability.

    Args:
        grezzo: Raw cell text, or a falsey value for an empty cell.

    Returns:
        A ``(value, annotation)`` tuple.
    """
    testo = (grezzo or "").strip()

    if testo in SIMBOLI:
        return None, SIMBOLI[testo]
    if testo == "":
        return None, "vuoto"

    # Italian format uses '.' for thousands and ',' for decimal separation.
    # Remove thousands separators first, then convert the decimal separator.
    # Thus '7.401' becomes 7401 and '35,2' becomes 35.2.
    normalizzato = testo.replace(".", "").replace(",", ".")
    try:
        return float(normalizzato), None
    except ValueError:
        # Preserve unexpected input as an explicit annotation instead of
        # silently discarding it. A value such as '35,2%' would reach this
        # branch until percent-sign handling is deliberately added.
        return None, "non_riconosciuto"
