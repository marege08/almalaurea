// app.js
//
// Collega i pezzi già pronti:
//   caricamento sql.js + almalaurea.sqlite  ->  CONFIG_FILTRI (config-filtri.js)
//   ->  query per scheda selezionata  ->  processData (processData.js)
//   ->  tabella di confronto.
//
// Nessun bundler: import ES module diretti, file serviti staticamente.

import { CONFIG_FILTRI } from './config-filtri.js';
import { processData } from './processData.js';
import { NOMI_ATENEO } from './nomi-ateneo.js';
import { NOMI_GRUPPO } from './nomi-gruppo.js';
import { chiediConfronto } from './ai/connettore.js';

const ORDINE_MACRO = Object.keys(CONFIG_FILTRI);

// --- Stato in memoria (non in localStorage: vedi restrizioni artifact) ---
let db = null;
let codiciAteneo = [];
let codiciGruppo = [];
let colonne = []; // [{ id, tipo: 'ateneo'|'gruppo', codice }]
let contatoreColonne = 0;

// Mappa id voce -> { voce, macro } per ritrovare rapidamente la voce di
// CONFIG_FILTRI a partire dall'id del checkbox selezionato.
const VOCE_PER_ID = new Map();
for (const macro of ORDINE_MACRO) {
  for (const voce of CONFIG_FILTRI[macro]) {
    VOCE_PER_ID.set(voce.id, { voce, macro });
  }
}

// --- Riferimenti DOM ---
const elStatoCaricamento = document.getElementById('stato-caricamento');
const elAreaApp = document.getElementById('area-app');
const elAreaErrore = document.getElementById('area-errore');
const elColonneSchede = document.getElementById('colonne-schede');
const elBtnAggiungiColonna = document.getElementById('btn-aggiungi-colonna');
const elAccordionFiltri = document.getElementById('accordion-filtri');
const elTabellaHead = document.getElementById('tabella-head');
const elTabellaBody = document.getElementById('tabella-body');

function mostraErrore(messaggio, errore) {
  elStatoCaricamento.classList.add('nascosto');
  elAreaErrore.classList.remove('nascosto');
  elAreaErrore.textContent = messaggio;
  if (errore) console.error(errore);
}

// --- 1. Caricamento del database (sql.js + almalaurea.sqlite) ---

async function caricaDatabase() {
  const SQL = await initSqlJs({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/${file}`,
  });
  const risposta = await fetch('almalaurea.sqlite');
  if (!risposta.ok) {
    throw new Error(`Impossibile scaricare almalaurea.sqlite (HTTP ${risposta.status}). È nella stessa cartella di questa pagina?`);
  }
  const buffer = await risposta.arrayBuffer();
  return new SQL.Database(new Uint8Array(buffer));
}

function leggiCodici(database) {
  const ateneo = database.exec("SELECT DISTINCT ateneo FROM dati WHERE ateneo != '' ORDER BY ateneo;");
  const gruppo = database.exec("SELECT DISTINCT gruppo FROM dati WHERE gruppo != '' ORDER BY gruppo;");
  codiciAteneo = ateneo.length ? ateneo[0].values.map((riga) => riga[0]) : [];
  codiciGruppo = gruppo.length ? gruppo[0].values.map((riga) => riga[0]) : [];
  // Il codice gruppo è testo ('1'..'15'): ordine numerico, non alfabetico
  // (altrimenti '10' finirebbe prima di '2').
  codiciGruppo.sort((a, b) => Number(a) - Number(b));
}

// --- 2. Selettore delle schede da confrontare ---

function codiciPerTipo(tipo) {
  return tipo === 'ateneo' ? codiciAteneo : codiciGruppo;
}

function etichettaCodice(tipo, codice) {
  if (tipo === 'ateneo') return NOMI_ATENEO[codice] ?? `Ateneo ${codice}`;
  return NOMI_GRUPPO[codice] ?? `Gruppo ${codice}`;
}

function codiciOrdinatiPerVisualizzazione(tipo) {
  const codici = [...codiciPerTipo(tipo)];
  // Sia per atenei sia per gruppi ha senso scorrere i nomi in ordine
  // alfabetico, non i codici (che non hanno un ordine significativo).
  codici.sort((a, b) => etichettaCodice(tipo, a).localeCompare(etichettaCodice(tipo, b), 'it'));
  return codici;
}

function creaColonna(tipoIniziale, codiceIniziale) {
  const id = `colonna-${contatoreColonne++}`;
  const stato = { id, tipo: tipoIniziale, codice: codiceIniziale };
  colonne.push(stato);

  const contenitore = document.createElement('div');
  contenitore.className = 'colonna-scheda';
  contenitore.dataset.id = id;

  const selectTipo = document.createElement('select');
  selectTipo.innerHTML = `<option value="ateneo">Ateneo</option><option value="gruppo">Gruppo</option>`;
  selectTipo.value = tipoIniziale;

  const selectCodice = document.createElement('select');

  function aggiornaOpzioniCodice() {
    const codici = codiciOrdinatiPerVisualizzazione(selectTipo.value);
    selectCodice.innerHTML = codici
      .map((c) => `<option value="${c}">${etichettaCodice(selectTipo.value, c)}</option>`)
      .join('');
    if (codici.includes(stato.codice)) {
      selectCodice.value = stato.codice;
    } else {
      stato.codice = codici[0] ?? '';
      selectCodice.value = stato.codice;
    }
  }

  selectTipo.addEventListener('change', () => {
    stato.tipo = selectTipo.value;
    aggiornaOpzioniCodice();
    renderTabella();
  });
  selectCodice.addEventListener('change', () => {
    stato.codice = selectCodice.value;
    renderTabella();
  });

  aggiornaOpzioniCodice();
  selectCodice.value = codiceIniziale;
  stato.codice = codiceIniziale;

  const btnRimuovi = document.createElement('button');
  btnRimuovi.type = 'button';
  btnRimuovi.className = 'rimuovi-colonna';
  btnRimuovi.title = 'Rimuovi questa colonna';
  btnRimuovi.textContent = '×';
  btnRimuovi.addEventListener('click', () => {
    colonne = colonne.filter((c) => c.id !== id);
    contenitore.remove();
    renderTabella();
  });

  contenitore.append(selectTipo, selectCodice, btnRimuovi);
  elColonneSchede.appendChild(contenitore);
}

elBtnAggiungiColonna.addEventListener('click', () => {
  // Propone di default un ateneo non ancora scelto, se disponibile.
  const usati = new Set(colonne.filter((c) => c.tipo === 'ateneo').map((c) => c.codice));
  const prossimo = codiciAteneo.find((c) => !usati.has(c)) ?? codiciAteneo[0];
  creaColonna('ateneo', prossimo);
  renderTabella();
});

// --- 3. Accordion dei filtri (domande), generato da CONFIG_FILTRI ---

// Contatori dei filtri, richiamabili anche dallo strato AI (applicaQuery).
const conteggiPerMacro = new Map();
function aggiornaConteggio(macro) {
  const dati = conteggiPerMacro.get(macro);
  if (!dati) return;
  const tot = dati.voci.filter((v) => document.getElementById(`chk-${v.id}`)?.checked).length;
  dati.spanConteggio.textContent = `${tot} di ${dati.voci.length} selezionate`;
}
function aggiornaTuttiIConteggi() {
  for (const macro of conteggiPerMacro.keys()) aggiornaConteggio(macro);
}

function renderFiltri() {
  elAccordionFiltri.innerHTML = '';
  conteggiPerMacro.clear();

  for (const macro of ORDINE_MACRO) {
    const voci = CONFIG_FILTRI[macro];

    const details = document.createElement('details');
    details.open = true;

    const summary = document.createElement('summary');
    const spanTitolo = document.createElement('span');
    spanTitolo.textContent = macro;
    const spanConteggio = document.createElement('span');
    spanConteggio.className = 'conteggio';
    summary.append(spanTitolo, spanConteggio);
    details.appendChild(summary);

    const lista = document.createElement('div');
    lista.className = 'lista-checkbox';

    conteggiPerMacro.set(macro, { spanConteggio, voci });

    for (const voce of voci) {
      const label = document.createElement('label');
      label.className = 'voce-checkbox';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `chk-${voce.id}`;
      input.checked = true;
      input.addEventListener('change', () => {
        aggiornaConteggio(macro);
        renderTabella();
      });

      const testo = document.createElement('span');
      testo.textContent = voce.label;

      label.append(input, testo);
      lista.appendChild(label);
    }

    details.appendChild(lista);
    elAccordionFiltri.appendChild(details);
    aggiornaConteggio(macro);
  }
}

function vociSelezionate() {
  // Restituisce le voci selezionate, raggruppate per macro-categoria,
  // nello stesso ordine di CONFIG_FILTRI (mai un ordine "a caso").
  const risultato = [];
  for (const macro of ORDINE_MACRO) {
    const voci = CONFIG_FILTRI[macro].filter(
      (v) => document.getElementById(`chk-${v.id}`)?.checked
    );
    if (voci.length > 0) risultato.push({ macro, voci });
  }
  return risultato;
}

// --- 4. Interrogazione di una scheda (ateneo o gruppo) ---

const SEPARATORE_CHIAVE = '\u0001';

function chiave(categoria, indicatore) {
  return `${categoria}${SEPARATORE_CHIAVE}${indicatore}`;
}

function interrogaScheda(colonna) {
  const colonnaFiltro = colonna.tipo === 'ateneo' ? 'ateneo' : 'gruppo';
  const altraColonna = colonna.tipo === 'ateneo' ? 'gruppo' : 'ateneo';

  const stmt = db.prepare(
    `SELECT categoria, indicatore, valore, nota, valore_raw, numero_laureati, numero_compilatori
     FROM dati
     WHERE ${colonnaFiltro} = :codice AND ${altraColonna} = ''`
  );
  stmt.bind({ ':codice': colonna.codice });

  const mappa = new Map();
  let numeroLaureati = null;
  let numeroCompilatori = null;

  while (stmt.step()) {
    const riga = stmt.getAsObject();
    mappa.set(chiave(riga.categoria, riga.indicatore), {
      valore: riga.valore,
      nota: riga.nota,
      valore_raw: riga.valore_raw,
    });
    if (numeroLaureati === null) {
      numeroLaureati = riga.numero_laureati;
      numeroCompilatori = riga.numero_compilatori;
    }
  }
  stmt.free();

  return { mappa, numeroLaureati, numeroCompilatori };
}

// --- 5. Rendering della tabella di confronto ---

function formattaIntestazioneColonna(colonna, numeroLaureati) {
  const etichettaPrincipale = etichettaCodice(colonna.tipo, colonna.codice);
  const contenitore = document.createElement('div');
  const riga1 = document.createElement('div');
  riga1.textContent = etichettaPrincipale;
  const riga2 = document.createElement('small');
  riga2.style.color = 'var(--testo-tenue)';
  riga2.style.fontWeight = '400';
  riga2.textContent =
    numeroLaureati != null ? `${numeroLaureati.toLocaleString('it-IT')} laureati` : '';
  contenitore.append(riga1, riga2);
  return contenitore;
}

function creaCellaTesto(testo, classe) {
  const td = document.createElement('td');
  if (classe) td.className = classe;
  td.textContent = testo;
  return td;
}

function creaCellaValore(infoValore) {
  const td = document.createElement('td');
  if (!infoValore) {
    td.textContent = '—';
    td.title = 'Nessun dato per questa combinazione';
    return td;
  }
  const testo = processData(infoValore);
  td.textContent = testo;
  td.className = infoValore.valore !== null && infoValore.valore !== undefined
    ? 'cella-valore'
    : 'cella-nota';
  td.title = `Valore originale AlmaLaurea: ${infoValore.valore_raw}`;
  return td;
}

function renderTabella() {
  elTabellaHead.innerHTML = '';
  elTabellaBody.innerHTML = '';

  if (colonne.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = 'Aggiungi almeno una colonna per vedere il confronto.';
    tr.appendChild(td);
    elTabellaBody.appendChild(tr);
    return;
  }

  // Interroga ogni colonna una sola volta (non una query per ogni domanda).
  const datiPerColonna = colonne.map((colonna) => ({
    colonna,
    ...interrogaScheda(colonna),
  }));

  // --- Intestazione ---
  const trHead = document.createElement('tr');
  const thDomanda = document.createElement('th');
  thDomanda.className = 'colonna-domanda';
  thDomanda.textContent = 'Domanda';
  trHead.appendChild(thDomanda);
  for (const { colonna, numeroLaureati } of datiPerColonna) {
    const th = document.createElement('th');
    th.appendChild(formattaIntestazioneColonna(colonna, numeroLaureati));
    trHead.appendChild(th);
  }
  elTabellaHead.appendChild(trHead);

  // --- Corpo, raggruppato per macro-categoria ---
  const gruppi = vociSelezionate();

  if (gruppi.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = 'Nessuna domanda selezionata: spunta almeno una voce nei filtri qui sopra.';
    tr.appendChild(td);
    elTabellaBody.appendChild(tr);
    return;
  }

  for (const { macro, voci } of gruppi) {
    const trMacro = document.createElement('tr');
    trMacro.className = 'riga-macro-categoria';
    const tdMacro = document.createElement('td');
    tdMacro.colSpan = 1 + datiPerColonna.length;
    tdMacro.textContent = macro;
    trMacro.appendChild(tdMacro);
    elTabellaBody.appendChild(trMacro);

    for (const voce of voci) {
      if (voce.indicatori.length === 1) {
        // Indicatore standalone: una riga, valore diretto.
        const tr = document.createElement('tr');
        tr.className = 'riga-domanda-intestazione';
        tr.appendChild(creaCellaTesto(voce.label, 'colonna-domanda'));
        const k = chiave(voce.categoria, voce.indicatori[0]);
        for (const { mappa } of datiPerColonna) {
          tr.appendChild(creaCellaValore(mappa.get(k)));
        }
        elTabellaBody.appendChild(tr);
      } else {
        // Domanda con più opzioni di risposta: riga-titolo (senza valori)
        // + una sotto-riga per ogni indicatore, stesse colonne-schede.
        const trTitolo = document.createElement('tr');
        trTitolo.className = 'riga-domanda-intestazione';
        trTitolo.appendChild(creaCellaTesto(voce.label, 'colonna-domanda'));
        for (let i = 0; i < datiPerColonna.length; i++) {
          trTitolo.appendChild(creaCellaTesto(''));
        }
        elTabellaBody.appendChild(trTitolo);

        for (const indicatore of voce.indicatori) {
          const tr = document.createElement('tr');
          tr.className = 'riga-indicatore';
          tr.appendChild(creaCellaTesto(indicatore, 'colonna-domanda'));
          const k = chiave(voce.categoria, indicatore);
          for (const { mappa } of datiPerColonna) {
            tr.appendChild(creaCellaValore(mappa.get(k)));
          }
          elTabellaBody.appendChild(tr);
        }
      }
    }
  }
}

// --- 6. Avvio ---

async function avvia() {
  try {
    db = await caricaDatabase();
    leggiCodici(db);

    if (codiciAteneo.length === 0 && codiciGruppo.length === 0) {
      throw new Error('Il database è stato caricato ma non contiene codici ateneo/gruppo. Controlla il file.');
    }

    // Due colonne di partenza, per vedere subito un confronto popolato.
    creaColonna('ateneo', codiciAteneo[0]);
    creaColonna('ateneo', codiciAteneo[1] ?? codiciAteneo[0]);

    renderFiltri();
    renderTabella();

    elStatoCaricamento.classList.add('nascosto');
    elAreaApp.classList.remove('nascosto');
  } catch (errore) {
    mostraErrore(
      'Non sono riuscito a caricare i dati. Controlla che almalaurea.sqlite sia nella stessa cartella di questa pagina e che tu la stia aprendo da un server locale (non con doppio click).',
      errore
    );
  }
}


// --- 7. Strato AI (Fase 2): frase in linguaggio naturale -> query validata ---
// La UI parla SOLO con chiediConfronto(): riceve una query gia' passata dal
// validatore (il muro), quindi qui arrivano solo colonne/domande reali.

const CHIAVE_CONFIG_AI = 'almalaurea-ai-config';

const PRESET_AI = {
  ollama:    { forma: 'openai',    baseUrl: 'http://localhost:11434/v1', model: '' },
  lmstudio:  { forma: 'openai',    baseUrl: 'http://localhost:1234/v1',  model: '' },
  openai:    { forma: 'openai',    baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { forma: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-4-5' },
};

const elAiFrase = document.getElementById('ai-frase');
const elAiInvia = document.getElementById('ai-invia');
const elAiStato = document.getElementById('ai-stato');
const elAiPreset = document.getElementById('ai-preset');
const elAiForma = document.getElementById('ai-forma');
const elAiBaseUrl = document.getElementById('ai-baseurl');
const elAiModel = document.getElementById('ai-model');
const elAiKey = document.getElementById('ai-key');
const elAiDimentica = document.getElementById('ai-dimentica');
const elAiAiuto = document.getElementById('ai-aiuto');

// Un indirizzo che punta alla macchina dell'utente: e' il caso in cui un
// errore di rete significa quasi sempre "permesso mancante", non "server giu'".
const RE_INDIRIZZO_LOCALE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

// Quando fetch fallisce per CORS il browser NON dice che e' stato il CORS: per
// non rivelare informazioni sul server restituisce lo stesso TypeError generico
// che darebbe una rete staccata. Distinguere i due casi dal messaggio e'
// impossibile, ma il contesto basta: se l'indirizzo e' locale, la causa quasi
// certa e' il permesso mancante. Meglio dirlo che lasciare "Failed to fetch".
function eErroreDiRete(errore) {
  return (
    errore instanceof TypeError ||
    /failed to fetch|networkerror|load failed/i.test(errore?.message ?? '')
  );
}

function diagnosticaConnessione(errore, baseUrl) {
  if (!eErroreDiRete(errore)) return null;
  if (RE_INDIRIZZO_LOCALE.test(baseUrl)) {
    return {
      messaggio:
        'Non riesco a raggiungere il modello sul tuo computer. Di solito manca il permesso: ' +
        'il programma che lo esegue deve autorizzare questa pagina. Ho aperto le istruzioni qui sopra.',
      apriAiuto: true,
    };
  }
  if (location.protocol === 'https:' && baseUrl.startsWith('http://')) {
    return {
      messaggio:
        'Il browser blocca le chiamate in http da una pagina https, tranne verso localhost. ' +
        'Usa un indirizzo https, oppure un modello locale.',
      apriAiuto: false,
    };
  }
  return {
    messaggio:
      "Non riesco a raggiungere l'indirizzo configurato. Controlla l'URL di base e la connessione.",
    apriAiuto: false,
  };
}

function leggiConfigAi() {
  return {
    forma: elAiForma.value,
    baseUrl: elAiBaseUrl.value.trim(),
    model: elAiModel.value.trim(),
    apiKey: elAiKey.value.trim() || undefined,
  };
}

function salvaConfigAi() {
  // localStorage puo' non essere disponibile (finestra privata, permessi):
  // in quel caso la config resta valida solo per questa pagina, senza errori.
  try {
    localStorage.setItem(CHIAVE_CONFIG_AI, JSON.stringify(leggiConfigAi()));
  } catch { /* ignora */ }
}

function caricaConfigAi() {
  let cfg = null;
  try {
    const grezzo = localStorage.getItem(CHIAVE_CONFIG_AI);
    if (grezzo) cfg = JSON.parse(grezzo);
  } catch { cfg = null; }
  if (!cfg) return;
  if (cfg.forma) elAiForma.value = cfg.forma;
  if (cfg.baseUrl) elAiBaseUrl.value = cfg.baseUrl;
  if (cfg.model) elAiModel.value = cfg.model;
  if (cfg.apiKey) elAiKey.value = cfg.apiKey;
}

function mostraStatoAi(testo, tipo) {
  elAiStato.textContent = testo;
  elAiStato.className = 'ai-stato' + (tipo ? ` ai-stato-${tipo}` : '');
}

// Applica una query VALIDATA allo stato della UI di Fase 1, poi ridisegna.
// Difensivo: se un pezzo e' vuoto (l'AI non ha prodotto nulla di valido li),
// NON azzera quella parte della vista dell'utente.
function applicaQuery({ colonne: colonneQuery, domande }) {
  if (colonneQuery.length > 0) {
    elColonneSchede.innerHTML = '';
    colonne = [];
    for (const c of colonneQuery) creaColonna(c.tipo, c.codice);
  }
  if (domande.length > 0) {
    const insieme = new Set(domande);
    for (const macro of ORDINE_MACRO) {
      for (const voce of CONFIG_FILTRI[macro]) {
        const chk = document.getElementById(`chk-${voce.id}`);
        if (chk) chk.checked = insieme.has(voce.id);
      }
    }
    aggiornaTuttiIConteggi();
  }
  renderTabella();
}

async function inviaFraseAi() {
  const frase = elAiFrase.value.trim();
  if (!frase) { mostraStatoAi('Scrivi cosa vuoi confrontare.', 'errore'); return; }
  const config = leggiConfigAi();
  if (!config.baseUrl || !config.model) {
    mostraStatoAi("Collega prima un'AI: servono URL di base e nome del modello.", 'errore');
    return;
  }
  salvaConfigAi();
  elAiInvia.disabled = true;
  mostraStatoAi('Sto interpretando la richiesta…', 'attesa');
  try {
    const query = await chiediConfronto(config, frase);
    if (query.colonne.length === 0 && query.domande.length === 0) {
      mostraStatoAi('Non sono riuscito a ricavare un confronto valido. Prova a essere piu\' specifico, o usa i filtri a mano.', 'errore');
      return;
    }
    applicaQuery(query);
    const scartati = query.scartati.colonne.length + query.scartati.domande.length;
    let msg = query.nota || 'Confronto impostato.';
    if (scartati > 0) msg += ` (${scartati} scelte non valide sono state ignorate.)`;
    mostraStatoAi(msg, 'ok');
  } catch (errore) {
    const diagnosi = diagnosticaConnessione(errore, config.baseUrl);
    if (diagnosi) {
      if (diagnosi.apriAiuto && elAiAiuto) elAiAiuto.open = true;
      mostraStatoAi(diagnosi.messaggio, 'errore');
    } else {
      mostraStatoAi(`Errore nel contattare l'AI: ${errore.message}`, 'errore');
    }
    console.error(errore);
  } finally {
    elAiInvia.disabled = false;
  }
}

// Aggancio degli eventi solo se il markup AI e' presente (degrado elegante:
// senza il pannello, la UI di Fase 1 funziona identica).
if (elAiInvia) {
  // Le istruzioni CORS devono riportare l'indirizzo ESATTO di questa pagina:
  // e' diverso in locale (http://localhost:8000) e online (https://...github.io),
  // e un'origine sbagliata nella configurazione non autorizza nulla. Quindi si
  // scrive a runtime, non a mano nell'HTML.
  for (const el of document.querySelectorAll('.ai-origine')) {
    el.textContent = location.origin;
  }

  elAiPreset.addEventListener('change', () => {
    const preset = PRESET_AI[elAiPreset.value];
    if (!preset) return;
    elAiForma.value = preset.forma;
    elAiBaseUrl.value = preset.baseUrl;
    if (preset.model) elAiModel.value = preset.model;
    salvaConfigAi();
  });
  elAiInvia.addEventListener('click', inviaFraseAi);
  elAiFrase.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) inviaFraseAi();
  });
  for (const el of [elAiForma, elAiBaseUrl, elAiModel, elAiKey]) {
    el.addEventListener('change', salvaConfigAi);
  }
  elAiDimentica.addEventListener('click', () => {
    try { localStorage.removeItem(CHIAVE_CONFIG_AI); } catch { /* ignora */ }
    elAiKey.value = '';
    mostraStatoAi('Configurazione AI dimenticata da questo browser.', 'ok');
  });
  caricaConfigAi();
}

avvia();
