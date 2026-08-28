# AlmaLaurea Explorer

Web app gratuita per l'orientamento alla scelta del corso di laurea in Italia. Confronta e visualizza i dati ufficiali di [AlmaLaurea](https://www.almalaurea.it/) (profilo dei laureati e condizione occupazionale) a tre livelli: **singolo corso**, **ateneo** e **classe/gruppo disciplinare**.

## Cosa fa

- Mostra statistiche reali sui percorsi dei laureati: occupazione, coerenza con il corso, tempo di ricerca, stipendio, ecc.
- Confronta dati tra corsi, atenei e classi di laurea
- Supporta query in linguaggio naturale tramite AI opzionale (BYOK — l'utente fornisce la propria API key)

## Filosofia

- **Costo zero strutturale**: nessun server a pagamento, nessun costo che scala con il traffico
- **Affidabilità del dato**: i numeri esposti provengono sempre dal dataset ufficiale, mai generati o stimati
- **Degradazione elegante**: senza chiave API, la UI a filtri funziona al 100%
- **Fonte citata**: i dati sono di AlmaLaurea, pubblicati con licenza CC BY-NC — il progetto vi si conforma

## Architettura

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Harvester       │────▶│  Dataset SQLite   │────▶│  Frontend      │
│  (Python)        │     │  (statico)        │     │  (Vite + React)│
└─────────────────┘     └──────────────────┘     └────────┬───────┘
                                                          │
                                                  ┌───────┴──────┐
                                                  │  AI BYOK     │
                                                  │  (opzionale) │
                                                  └──────────────┘
```

- **Estrazione batch annuale** → dataset pulito in SQLite
- **Layer dati statico** servito come file, senza backend acceso
- **UI** con filtri, tabelle di confronto e grafici
- **AI** in modalità BYOK: text-to-query sul dataset fidato, chiave API nel browser dell'utente

## Stack

| Strato | Tecnologia |
|--------|-----------|
| Estrazione | Python (`requests`, `beautifulsoup4`, `pandas`) |
| Database | SQLite |
| Frontend | Vite + React, Chart.js / Recharts |
| Query client-side | sql.js / sqlite-wasm |
| Hosting | GitHub Pages / Cloudflare Pages |
| Automazione | GitHub Actions |

## Struttura del progetto

```
AlmaLaurea/
├── backend/
│   ├── src/
│   │   ├── harvest.py      # estrazione dati dai CSV AlmaLaurea
│   │   └── pulizia.py      # pulizia e normalizzazione del dataset
│   └── tests/
├── frontend/
│   └── public/
├── tools/
│   ├── esegui_harvest.py   # launcher per l'estrazione
│   ├── salva.py            # utility di salvataggio
│   ├── scarica.py          # download dati grezzi
│   └── serve.sh            # script per servire in locale
├── venv/                   # virtual environment Python
└── requirements.txt
```

## Uso

### Estrazione dati

```bash
source venv/bin/activate
cd tools
python esegui_harvest.py
```


### Sviluppo locale

```bash
cd tools
bash serve.sh
```

## Piano di sviluppo

| Fase | Descrizione | Stato |
|------|-------------|-------|
| 0 | Harvester + dataset pulito | Completato |
| 1 | UI statica di confronto (MVP pubblicabile) | Completato |
| 2 | Strato AI BYOK text-to-query (opzionale) | In corso |

## Dati

I dati provengono dalle schede statistiche pubbliche di [AlmaLaurea](https://www.almalaurea.it/), pubblicata da Indire. La licenza CC BY-NC autorizza la riproduzione a fini non commerciali con citazione della fonte.

Le schede espongono già un export CSV con URL parametrizzati (anno, tipo corso, ateneo, classe). L'estrazione è un harvester sui CSV, non parsing HTML fragile.

### Modello dati

Tabella tidy/long: una riga per `(anno, tipo_corso, ateneo, classe, corso, indicatore, valore, numerosità)`.

Le aggregazioni per ateneo/classe usano le schede aggregate ufficiali — non somme di corsi — per garantire che i numeri coincidano sempre con la fonte. La numerosità campionaria è sempre conservata per avvertire sui campioni piccoli.

## Note legali

I dati sono aggregati e anonimi — nessun obbligo GDPR sul dataset. Il progetto è non commerciale e si conforma alla licenza CC BY-NC della fonte.

## Licenza

Il codice di questo progetto è rilasciato sotto licenza MIT. I dati sono proprietà di AlmaLaurea/Indire e soggetti a licenza CC BY-NC.
