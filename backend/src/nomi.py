"""
nomi.py — tabella di corrispondenza codice -> nome per ateneo e gruppo
disciplinare, dalle tendine AlmaLaurea.

Perché serve: il dataset (`almalaurea.sqlite`, tabella `dati`) usa solo
codici (es. ateneo='70003'). I codici restano la fonte univoca; questa
tabella serve solo alla UI per mostrare i nomi.

Input: un HTML che contiene <select name="ateneo"> e <select name="gruppo">
(es. l'output salvato di una pagina con le tendine, vedi leggi_tendine()).
La voce 'tutti' viene scartata: serve all'interfaccia, non è un
ateneo/gruppo reale (stessa trappola già documentata per harvest.py).

Uso:
    python nomi.py <file_html> <db_sqlite>

Esempio:
    python nomi.py ateneo-numero.txt almalaurea.sqlite
"""
from bs4 import BeautifulSoup
import sqlite3
import sys


def estrai_nomi(html: str, select_name: str) -> list[tuple[str, str]]:
    """Estrae le coppie (codice, nome) da un <select name=select_name>,
    escludendo la voce 'tutti'."""
    soup = BeautifulSoup(html, "html.parser")
    select = soup.find("select", {"name": select_name})
    if select is None:
        raise ValueError(f"Tendina '{select_name}' non trovata nell'HTML")

    coppie = []
    for opt in select.find_all("option"):
        codice = opt.get("value", "").strip()
        nome = opt.get_text(strip=True)
        if codice == "tutti":
            continue
        coppie.append((codice, nome))
    return coppie


def crea_tabelle(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS nomi_ateneo (
            codice TEXT PRIMARY KEY,
            nome TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS nomi_gruppo (
            codice TEXT PRIMARY KEY,
            nome TEXT NOT NULL
        )
    """)


def salva_nomi(
    conn: sqlite3.Connection,
    nomi_ateneo: list[tuple[str, str]],
    nomi_gruppo: list[tuple[str, str]],
) -> None:
    crea_tabelle(conn)
    conn.executemany(
        "INSERT OR REPLACE INTO nomi_ateneo (codice, nome) VALUES (?, ?)",
        nomi_ateneo,
    )
    conn.executemany(
        "INSERT OR REPLACE INTO nomi_gruppo (codice, nome) VALUES (?, ?)",
        nomi_gruppo,
    )
    conn.commit()


def main():
    if len(sys.argv) != 3:
        print("Uso: python nomi.py <file_html> <db_sqlite>")
        sys.exit(1)

    path_html, path_db = sys.argv[1], sys.argv[2]

    with open(path_html, encoding="utf-8") as f:
        html = f.read()

    nomi_ateneo = estrai_nomi(html, "ateneo")
    nomi_gruppo = estrai_nomi(html, "gruppo")

    print(f"Atenei estratti: {len(nomi_ateneo)} (atteso: 78)")
    print(f"Gruppi estratti: {len(nomi_gruppo)} (atteso: 15)")

    conn = sqlite3.connect(path_db)
    salva_nomi(conn, nomi_ateneo, nomi_gruppo)
    conn.close()

    print(f"Salvato in {path_db}: tabelle nomi_ateneo, nomi_gruppo")


if __name__ == "__main__":
    main()
