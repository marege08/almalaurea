# -*- coding: utf-8 -*-
"""Interpretazione di una cella-valore di AlmaLaurea.
Logica pura (nessuna rete, nessun HTML): facile da testare in isolamento.
Regole: note metodologiche §4.3 (simboli) + formato numerico italiano."""

# I simboli convenzionali NON sono "mancante" generico: ognuno ha un significato.
SIMBOLI = {
    "*": "oscurato_meno_di_5",  # collettivo < 5 unita': statistica oscurata = avviso campione piccolo
    "-": "zero_casi",  # fenomeno rilevato ma zero casi
    "/": "non_disponibile",  # dato non disponibile / non confrontabile (serie storiche)
}


def pulisci_valore(grezzo):
    """Interpreta una cella-valore. Ritorna (valore, nota):
       - valore: float se e' un numero, altrimenti None
       - nota:   significato del simbolo/anomalia, altrimenti None
    Chi chiama conserva comunque la stringa grezza (tracciabilita')."""
    testo = (grezzo or "").strip()

    if testo in SIMBOLI:
        return None, SIMBOLI[testo]
    if testo == "":
        return None, "vuoto"

    # Formato italiano: '.' = separatore migliaia, ',' = separatore decimali.
    # Prima tolgo i punti delle migliaia, poi virgola -> punto.
    # (Cosi' '7.401' -> 7401 e '35,2' -> 35.2, entrambi corretti.)
    normalizzato = testo.replace(".", "").replace(",", ".")
    try:
        return float(normalizzato), None
    except ValueError:
        # qualcosa di inatteso: non lo perdo in silenzio, lo segnalo.
        # (Se un giorno comparisse '35,2%', finirebbe qui: aggiungeremmo uno strip('%').)
        return None, "non_riconosciuto"
