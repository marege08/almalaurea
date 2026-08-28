## CONTESTO DEL PROGETTO
Sto costruendo una web app gratuita per l'orientamento alla scelta del corso di laurea in Italia. L'app permette di confrontare e visualizzare i dati di AlmaLaurea (profilo dei laureati e condizione occupazionale) a tre livelli: singolo corso, ateneo e classe/gruppo disciplinare. Il progetto è non commerciale, pensato per essere condiviso liberamente con il pubblico. Sviluppo da solo e sto imparando strada facendo, quindi spiega le scelte tecniche invece di darle per scontate e segnala quando sto per complicarmi la vita inutilmente.

## VINCOLI NON NEGOZIABILI
Costo zero garantito strutturalmente, non sperato: nessun mio server che paga risorse a runtime. Se una proposta introduce un costo che scala col traffico, va segnalata come tale.
Affidabilità del dato prima di tutto: è uno strumento che orienta scelte di vita. I numeri mostrati all'utente devono sempre provenire dal dataset ufficiale, mai essere generati o stimati da un modello.
Citazione visibile di AlmaLaurea come fonte (è la condizione della licenza, vedi sotto).

## FONTE DATI E ASPETTI LEGALI
I dati sono le schede statistiche pubbliche di AlmaLaurea. La licenza autorizza la riproduzione a fini non commerciali con citazione della fonte: il progetto vi rientra, l'unico obbligo è attribuire la fonte. I dati sono aggregati e anonimi, quindi niente GDPR sul dataset. Le schede espongono già un export CSV e gli URL sono parametrizzati (anno, tipo corso, ateneo, classe), quindi l'estrazione è un harvester sui CSV, non parsing HTML fragile. Mantieni le richieste a frequenza educata e uno User-Agent onesto. I dati si aggiornano ~annualmente: nessun real-time, l'estrazione è batch.

## ARCHITETTURA DECISA
Spina dorsale statica + AI come strato sopra il dato:

## FASI
Estrazione batch annuale → dataset pulito.
Layer dati statico (SQLite o JSON), servito come file, senza backend acceso.
UI a filtri, tabelle di confronto e grafici come MVP completo e autosufficiente.
AI in modalità BYOK (l'utente incolla la propria API key, che resta nel suo browser e paga le sue query): è l'unico design in cui “gratis” è strutturale. L'AI fa solo text-to-query (linguaggio naturale → query/filtro sul dataset fidato → numeri presi dal dataset). Degrado elegante: senza chiave, la UI a filtri funziona al 100%.

## MODELLO DATI
Tabella tidy/long: una riga per (anno, tipo_corso, ateneo, classe, corso, indicatore, valore, numerosità). Non ricalcolare gli aggregati per ateneo/classe sommando i corsi: usa le schede aggregate ufficiali di AlmaLaurea, così i numeri coincidono sempre con la fonte. Conserva sempre la numerosità campionaria per poter avvertire sui campioni piccoli.
STACK TECNICO (orientativo, dato il mio livello)
Estrazione in Python (requests + pandas). Frontend Vite + React (o Svelte) con Chart.js o Recharts. Dati nel browser come JSON all'inizio, oppure sql.js / sqlite-wasm per query SQL lato client. Hosting su GitHub Pages o Cloudflare Pages. Estrazione automatizzabile con GitHub Actions.

## PIANO A FASI

Fase 0: harvester + dataset pulito.
Fase 1: UI di confronto statica (MVP pubblicabile, AI o no).
Fase 2: strato AI BYOK text-to-query, opzionale e non bloccante.

Ogni fase deve produrre qualcosa di già utile e pubblicabile.
