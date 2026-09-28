// app.js
//
// Connects the prepared components:
//   sql.js + almalaurea.sqlite loading -> CONFIG_FILTRI (config-filtri.js)
//   -> selected-sheet queries -> processData (processData.js)
//   -> comparison table.
//
// No bundler is used: ES modules are imported directly from static files.

import { CONFIG_FILTRI } from './config-filtri.js';
import { processData } from './processData.js';
import { NOMI_ATENEO } from './nomi-ateneo.js';
import { NOMI_GRUPPO } from './nomi-gruppo.js';
import { chiediConfronto } from './ai/connettore.js';
import { NOMI_CORSO } from './nomi-corso.js';
import {
  inizializzaSql,
  caricaAteneoCorsi,
  ateneoCaricato,
  interrogaCorso,
  descriviCorso,
  liberaAteneiNonUsati,
} from './db-corsi.js';
import {
  INDICATORI_CRUSCOTTO,
  INDICATORI_SOLO_SCHEDA,
  etichettaUfficiale,
  scalaPer,
  posizioneSu,
  formattaConUnita,
  etichetteScala,
} from './indicatori-chiave.js';

const ORDINE_MACRO = Object.keys(CONFIG_FILTRI);

// --- Small-sample threshold ---
// Below this number of respondents a percentage is unstable: with thirty
// respondents, one case more or less moves the value by more than three
// points, and the difference between two columns becomes noise. Cells based on
// a sample smaller than the threshold are de-emphasized and explained in their
// tooltip instead of being displayed like every other cell.
//
// Aggregate university and group data never fall below the threshold: the
// smallest sample in the published database has 61 respondents. The mechanism
// is intended for course-level data, where respondents regularly number only a
// few dozen, and keeping it as a single constant makes it adjustable in one
// place.
const SOGLIA_CAMPIONE_PICCOLO = 40;

// --- In-memory UI state ---
let db = null;
let codiciAteneo = [];
let codiciGruppo = [];
// Entries have the shape { id, tipo: 'ateneo'|'gruppo'|'corso', codice }; a
// 'corso' column also stores its university in `ateneo`, since course codes
// are looked up inside that university's database.
let colonne = [];
let contatoreColonne = 0;

// --- Definition of "employed" (only the `occupazione` employment outcomes survey) ---
// AlmaLaurea sheets contain TWO complete versions of these data, one for each
// official definition, while their JavaScript displays only one. The default
// matches the site (ampia for years after 2020), avoiding apparent discrepancies
// between the official site and this application for the same question.
const DEFINIZIONE_PREDEFINITA = 'ampia';
let definizioneScelta = DEFINIZIONE_PREDEFINITA;
let definizioniDisponibili = [];

// These are AlmaLaurea's official definitions, copied from sheet tooltips.
const TESTO_DEFINIZIONE = {
  ampia:
    'Si considerano occupati tutti coloro che dichiarano di svolgere un\u2019attivit\u00e0, ' +
    'anche di formazione, purch\u00e9 retribuita.',
  restrittiva:
    'Sono considerati occupati i laureati che dichiarano di svolgere un\u2019attivit\u00e0 ' +
    'lavorativa retribuita, anche con assegno di ricerca, purch\u00e9 non si tratti di ' +
    'un\u2019attivit\u00e0 di formazione (tirocinio, praticantato, dottorato, specializzazione, ecc.).',
};

// An entry is queryable when it is definition-independent ('' is the graduate
// profile survey, where no duplicate exists; 'condivisa' is a block not duplicated on
// the page and valid for both definitions) or exists under the selected
// definition. The four questions available under only one definition are thus
// hidden instead of rendered as dashes.
function voceDisponibile(voce) {
  return voceNelConfronto(voce) && voce.definizioni.some(
    (d) => d === '' || d === 'condivisa' || d === definizioneScelta
  );
}

// Course-only questions (`soloCorso`, see config-filtri.js) ask first-level
// graduates what they did after the degree; universities and groups mix all
// degree types and have no answer. They join the comparison only when at least
// one course column is present, instead of adding rows every column leaves
// empty.
function voceNelConfronto(voce) {
  return !voce.soloCorso || colonne.some((c) => c.tipo === 'corso');
}

// Map entry IDs to { voce, macro } for quick CONFIG_FILTRI lookup from a
// selected checkbox ID.
const VOCE_PER_ID = new Map();
for (const macro of ORDINE_MACRO) {
  for (const voce of CONFIG_FILTRI[macro]) {
    VOCE_PER_ID.set(voce.id, { voce, macro });
  }
}

// --- DOM references ---
const elStatoCaricamento = document.getElementById('stato-caricamento');
const elAreaApp = document.getElementById('area-app');
const elAreaErrore = document.getElementById('area-errore');
const elColonneSchede = document.getElementById('colonne-schede');
const elBtnAggiungiColonna = document.getElementById('btn-aggiungi-colonna');
const elAccordionFiltri = document.getElementById('accordion-filtri');
const elRiquadroDefinizione = document.getElementById('riquadro-definizione');
const elSelDefinizione = document.getElementById('sel-definizione');
const elNotaDefinizione = document.getElementById('nota-definizione');
const elTabellaHead = document.getElementById('tabella-head');
const elTabellaBody = document.getElementById('tabella-body');
const elLegendaCampione = document.getElementById('legenda-campione');
const elNotaSintesi = document.getElementById('nota-sintesi');
const elGrigliaSintesi = document.getElementById('griglia-sintesi');

// One colour per comparison column, shared by the column selector, the table
// header and the summary cards, so a bar can be matched to its column at a
// glance. Neighbouring colours also differ in lightness, not only in hue, and
// every bar sits next to the column's name: colour is never the only cue.
const COLORI_COLONNA = ['#2a5d63', '#c47a2c', '#6f7f96', '#8a5a83', '#7d8a3a', '#a8483a'];

/**
 * Returns the colour of a comparison column.
 *
 * @param {number} indice - Position of the column, from 0.
 * @returns {string} CSS colour.
 */
function coloreColonna(indice) {
  return COLORI_COLONNA[indice % COLORI_COLONNA.length];
}

/**
 * Creates an element with attributes and children.
 *
 * Children that are strings become text nodes, never HTML: course names come
 * from an external source and must not be interpreted as markup.
 *
 * @param {string} tag - Element name.
 * @param {object} [attributi] - Attributes; `class` sets className, `style` accepts an object.
 * @param {...(Node|string|null|undefined|false)} figli - Children; empty values are skipped.
 * @returns {HTMLElement} New element.
 */
function el(tag, attributi = {}, ...figli) {
  const nodo = document.createElement(tag);
  for (const [nome, valore] of Object.entries(attributi)) {
    if (valore === null || valore === undefined || valore === false) continue;
    if (nome === 'class') nodo.className = valore;
    else if (nome === 'style') Object.assign(nodo.style, valore);
    else nodo.setAttribute(nome, valore === true ? '' : valore);
  }
  for (const figlio of figli) {
    if (figlio === null || figlio === undefined || figlio === false) continue;
    nodo.append(figlio);
  }
  return nodo;
}

/**
 * Displays an error message and optionally logs the underlying error.
 *
 * @param {string} messaggio - Message to display.
 * @param {Error|undefined} errore - Error to log, when available.
 */
function mostraErrore(messaggio, errore) {
  elStatoCaricamento.classList.add('nascosto');
  elAreaErrore.classList.remove('nascosto');
  elAreaErrore.textContent = messaggio;
  if (errore) console.error(errore);
}

// --- 1. Database loading (sql.js + almalaurea.sqlite) ---

/** @returns {Promise<object>} In-memory sql.js database. */
async function caricaDatabase() {
  // Shared with the per-university course databases (db-corsi.js), so sql.js
  // is initialized once for the whole page.
  const SQL = await inizializzaSql();
  const risposta = await fetch('almalaurea.sqlite');
  if (!risposta.ok) {
    throw new Error(`Impossibile scaricare almalaurea.sqlite (HTTP ${risposta.status}). È nella stessa cartella di questa pagina?`);
  }
  const buffer = await risposta.arrayBuffer();
  return new SQL.Database(new Uint8Array(buffer));
}

/** @param {object} database - sql.js database to inspect. */
function leggiCodici(database) {
  const ateneo = database.exec("SELECT DISTINCT ateneo FROM dati WHERE ateneo != '' ORDER BY ateneo;");
  const gruppo = database.exec("SELECT DISTINCT gruppo FROM dati WHERE gruppo != '' ORDER BY gruppo;");
  codiciAteneo = ateneo.length ? ateneo[0].values.map((riga) => riga[0]) : [];
  codiciGruppo = gruppo.length ? gruppo[0].values.map((riga) => riga[0]) : [];
  // Group codes are text ('1'..'15'), so numeric rather than lexicographic
  // ordering is required; otherwise '10' would precede '2'.
  codiciGruppo.sort((a, b) => Number(a) - Number(b));

  // Read definitions from the dataset rather than a hard-coded list. If a data
  // update removes one, the selector stops offering a choice with no rows.
  const definizioni = database.exec(
    "SELECT DISTINCT definizione FROM dati " +
    "WHERE definizione NOT IN ('', 'condivisa', 'sconosciuta') ORDER BY definizione;"
  );
  definizioniDisponibili = definizioni.length
    ? definizioni[0].values.map((riga) => riga[0])
    : [];
  if (!definizioniDisponibili.includes(definizioneScelta)) {
    definizioneScelta = definizioniDisponibili[0] ?? DEFINIZIONE_PREDEFINITA;
  }
}

// --- 2. Selector for sheets to compare ---

/**
 * Returns codes for the selected entity type.
 *
 * @param {string} tipo - Entity type.
 * @returns {string[]} Codes for the selected entity type.
 */
function codiciPerTipo(tipo) {
  return tipo === 'ateneo' ? codiciAteneo : codiciGruppo;
}

/**
 * Returns the display label for an entity code.
 *
 * @param {string} tipo - Entity type.
 * @param {string} codice - Entity code.
 * @returns {string} Display label.
 */
function etichettaCodice(tipo, codice) {
  if (tipo === 'ateneo') return NOMI_ATENEO[codice] ?? `Ateneo ${codice}`;
  return NOMI_GRUPPO[codice] ?? `Gruppo ${codice}`;
}

/**
 * Returns the display label for a comparison column.
 *
 * @param {{tipo:string,codice:string,ateneo?:string}} colonna - Sheet selection.
 * @returns {string} Display label.
 */
function etichettaColonna(colonna) {
  if (colonna.tipo === 'corso') {
    return NOMI_CORSO[colonna.ateneo]?.[colonna.codice] ?? `Corso ${colonna.codice}`;
  }
  return etichettaCodice(colonna.tipo, colonna.codice);
}

/**
 * Returns codes sorted by display label.
 *
 * @param {string} tipo - Entity type.
 * @returns {string[]} Codes sorted by display label.
 */
function codiciOrdinatiPerVisualizzazione(tipo) {
  const codici = [...codiciPerTipo(tipo)];
  // Both universities and groups are easier to scan alphabetically by name;
  // their codes have no meaningful display order.
  codici.sort((a, b) => etichettaCodice(tipo, a).localeCompare(etichettaCodice(tipo, b), 'it'));
  return codici;
}

/**
 * Downloads the university of a course column, then redraws the table.
 *
 * The table renders synchronously, so a course column first appears with a
 * loading note and is drawn again here once its data is available. A failed
 * download is shown in the column header instead of as empty cells.
 *
 * @param {object} stato - Course column state.
 */
async function preparaColonnaCorso(stato) {
  const ateneo = stato.ateneo;
  if (ateneoCaricato(ateneo)) return;
  // The error is cleared by every new user selection (mostra), never here: a
  // late successful download of a university the user has already left must
  // not erase the error of the university now selected.
  try {
    await caricaAteneoCorsi(ateneo);
  } catch (errore) {
    if (stato.ateneo === ateneo) stato.errore = errore.message;
  }
  // The user may have removed the column or picked another university while
  // the download was running; only a still-current selection is redrawn.
  if (colonne.includes(stato) && stato.ateneo === ateneo) renderTabella();
}

/**
 * Creates a comparison column.
 *
 * NOTE: the course selector (type "Corso", then university, then course) is a
 * minimal interface meant only to exercise course-level data until the
 * interface is redesigned.
 *
 * A course column created here (from the course sheet) needs its university
 * too, since course codes are looked up inside that university's database;
 * the course download starts at once and the table redraws when it ends.
 *
 * @param {string} tipoIniziale - Initial entity type ('ateneo', 'gruppo' or 'corso').
 * @param {string} codiceIniziale - Initial entity code.
 * @param {string} [ateneoIniziale] - University of a course column.
 */
function creaColonna(tipoIniziale, codiceIniziale, ateneoIniziale) {
  const id = `colonna-${contatoreColonne++}`;
  const stato = {
    id,
    tipo: tipoIniziale,
    codice: codiceIniziale,
    ateneo: tipoIniziale === 'corso' ? ateneoIniziale : null,
  };
  colonne.push(stato);

  const contenitore = document.createElement('div');
  contenitore.className = 'colonna-scheda';
  contenitore.dataset.id = id;

  // Coloured by renderTabella(), which knows the column's current position.
  const pallino = document.createElement('span');
  pallino.className = 'pallino-colonna';
  pallino.setAttribute('aria-hidden', 'true');

  const selectTipo = document.createElement('select');
  selectTipo.className = 'sel-tipo';
  selectTipo.innerHTML =
    '<option value="ateneo">Ateneo</option><option value="gruppo">Gruppo</option>' +
    '<option value="corso">Corso</option>';
  selectTipo.value = tipoIniziale;

  // University or group; for a course column, the course's university.
  const selectCodice = document.createElement('select');
  selectCodice.className = 'sel-codice';
  const selectCorso = document.createElement('select');
  selectCorso.className = 'sel-corso';

  function aggiornaOpzioniCorso() {
    const corsi = Object.entries(NOMI_CORSO[stato.ateneo] ?? {});
    // Options are built as DOM nodes: course names come from an external
    // source and are never interpreted as HTML.
    selectCorso.replaceChildren(...corsi.map(([c, nome]) => new Option(nome, c)));
    if (!corsi.some(([c]) => c === stato.codice)) stato.codice = corsi[0]?.[0] ?? '';
    selectCorso.value = stato.codice;
  }

  function aggiornaOpzioniCodice() {
    const perCorso = selectTipo.value === 'corso';
    const tipoLista = perCorso ? 'ateneo' : selectTipo.value;
    const codici = codiciOrdinatiPerVisualizzazione(tipoLista);
    selectCodice.innerHTML = codici
      .map((c) => `<option value="${c}">${etichettaCodice(tipoLista, c)}</option>`)
      .join('');
    const voluto = perCorso ? stato.ateneo : stato.codice;
    const scelto = codici.includes(voluto) ? voluto : codici[0] ?? '';
    selectCodice.value = scelto;
    if (perCorso) {
      stato.ateneo = scelto;
      aggiornaOpzioniCorso();
    } else {
      stato.codice = scelto;
      stato.ateneo = null;
    }
    selectCorso.hidden = !perCorso;
  }

  function mostra() {
    stato.errore = undefined;
    renderTabella();
    if (stato.tipo === 'corso') preparaColonnaCorso(stato);
  }

  selectTipo.addEventListener('change', () => {
    // Switching from a university to "Corso" keeps that university.
    if (selectTipo.value === 'corso' && stato.tipo === 'ateneo') stato.ateneo = stato.codice;
    stato.tipo = selectTipo.value;
    aggiornaOpzioniCodice();
    mostra();
  });
  selectCodice.addEventListener('change', () => {
    if (stato.tipo === 'corso') {
      stato.ateneo = selectCodice.value;
      aggiornaOpzioniCorso();
    } else {
      stato.codice = selectCodice.value;
    }
    mostra();
  });
  selectCorso.addEventListener('change', () => {
    stato.codice = selectCorso.value;
    mostra();
  });

  aggiornaOpzioniCodice();
  // For a course column aggiornaOpzioniCodice() has already placed both the
  // university and the course; its code list is the universities' one.
  if (tipoIniziale !== 'corso') {
    selectCodice.value = codiceIniziale;
    stato.codice = codiceIniziale;
  }

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

  contenitore.append(pallino, selectTipo, selectCodice, selectCorso, btnRimuovi);
  elColonneSchede.appendChild(contenitore);
  if (stato.tipo === 'corso') preparaColonnaCorso(stato);
}

elBtnAggiungiColonna.addEventListener('click', () => {
  // Prefer a university that has not already been selected, when available.
  const usati = new Set(colonne.filter((c) => c.tipo === 'ateneo').map((c) => c.codice));
  const prossimo = codiciAteneo.find((c) => !usati.has(c)) ?? codiciAteneo[0];
  creaColonna('ateneo', prossimo);
  renderTabella();
});

// --- 3. Question-filter accordion generated from CONFIG_FILTRI ---

// Filter counters, also used by the AI layer (applicaQuery).
const conteggiPerMacro = new Map();
// voce.id -> its checkbox label, so entries unavailable under the selected
// definition can be hidden.
const ELEMENTO_VOCE = new Map();

/** @param {string} macro */
function aggiornaConteggio(macro) {
  const dati = conteggiPerMacro.get(macro);
  if (!dati) return;
  // The denominator includes only questions available under the selected
  // definition; "3 of 22" would be misleading if two are hidden.
  const disponibili = dati.voci.filter(voceDisponibile);
  const tot = disponibili.filter((v) => document.getElementById(`chk-${v.id}`)?.checked).length;
  dati.spanConteggio.textContent = `${tot} di ${disponibili.length} selezionate`;
}

// Build each checkbox once and toggle visibility so changing the definition
// does not clear the user's selections elsewhere on the page.
/** Updates question visibility for the selected occupation definition. */
function aggiornaVisibilitaVoci() {
  for (const [id, elemento] of ELEMENTO_VOCE) {
    const trovata = VOCE_PER_ID.get(id);
    if (trovata) elemento.hidden = !voceDisponibile(trovata.voce);
  }
  for (const dati of conteggiPerMacro.values()) {
    // A macro-category with no questions under the definition should not remain
    // open and empty.
    dati.details.hidden = !dati.voci.some(voceDisponibile);
  }
  aggiornaTuttiIConteggi();
}
/** Refreshes all macro-category question counters. */
function aggiornaTuttiIConteggi() {
  for (const macro of conteggiPerMacro.keys()) aggiornaConteggio(macro);
}

/** Renders the question-filter accordion. */
function renderFiltri() {
  elAccordionFiltri.innerHTML = '';
  conteggiPerMacro.clear();
  ELEMENTO_VOCE.clear();

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

    conteggiPerMacro.set(macro, { spanConteggio, voci, details });

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
      ELEMENTO_VOCE.set(voce.id, label);
    }

    details.appendChild(lista);
    elAccordionFiltri.appendChild(details);
    aggiornaConteggio(macro);
  }
}

// --- `occupazione` employment outcomes survey definition selector ---

// Derive the macro-category containing the `occupazione` employment outcomes survey from the data,
// so a future generator rename does not make this text inaccurate.
const MACRO_OCCUPAZIONE = ORDINE_MACRO.find((m) =>
  CONFIG_FILTRI[m].some((v) => v.indagine === 'occupazione')
);

/** Updates the explanation and available-question count for the definition. */
function aggiornaNotaDefinizione() {
  if (!elNotaDefinizione || !MACRO_OCCUPAZIONE) return;
  // The denominator leaves out course-only questions while no course column
  // exists: they do not depend on the definition, and counting them would
  // report as hidden by the definition questions it does not hide.
  const voci = CONFIG_FILTRI[MACRO_OCCUPAZIONE].filter(voceNelConfronto);
  const disponibili = voci.filter(voceDisponibile).length;
  const spiegazione = TESTO_DEFINIZIONE[definizioneScelta] ?? '';
  elNotaDefinizione.textContent =
    `${spiegazione} Con questa scelta sono consultabili ${disponibili} delle ` +
    `${voci.length} domande di «${MACRO_OCCUPAZIONE}»; le altre categorie non cambiano.`;
}

/** Renders the employment outcomes survey definition selector when multiple definitions exist. */
function renderSelettoreDefinizione() {
  // With fewer than two definitions, the selector has no purpose and remains
  // hidden; this occurs when the dataset contains only the graduate profile survey.
  if (!elRiquadroDefinizione || definizioniDisponibili.length < 2) return;

  elSelDefinizione.innerHTML = definizioniDisponibili
    .map((d) => `<option value="${d}">${d}</option>`)
    .join('');
  elSelDefinizione.value = definizioneScelta;
  elRiquadroDefinizione.classList.remove('nascosto');

  elSelDefinizione.addEventListener('change', () => {
    definizioneScelta = elSelDefinizione.value;
    aggiornaNotaDefinizione();
    aggiornaVisibilitaVoci();
    renderTabella();
    // The course sheet reads the same definition; its own selector only
    // forwards here, so both views always agree.
    renderScheda();
  });

  aggiornaNotaDefinizione();
}

/** @returns {{macro:string, voci:object[]}[]} Selected questions by category. */
function vociSelezionate() {
  // Preserve CONFIG_FILTRI order rather than relying on arbitrary iteration order.
  const risultato = [];
  for (const macro of ORDINE_MACRO) {
    const voci = CONFIG_FILTRI[macro].filter(
      (v) => voceDisponibile(v) && document.getElementById(`chk-${v.id}`)?.checked
    );
    if (voci.length > 0) risultato.push({ macro, voci });
  }
  return risultato;
}

// --- 4. Querying a sheet (university or group) ---

const SEPARATORE_CHIAVE = '\u0001';

// Include the survey in the key: the graduate profile survey and employment
// outcomes survey contain similar
// (category, indicator) pairs, and this extra string prevents silent collisions.
/**
 * Builds a stable key for a data row.
 *
 * @param {string} indagine - Survey identifier.
 * @param {string} categoria - Category label.
 * @param {string} indicatore - Indicator label.
 * @returns {string} Stable row key.
 */
function chiave(indagine, categoria, indicatore) {
  return `${indagine}${SEPARATORE_CHIAVE}${categoria}${SEPARATORE_CHIAVE}${indicatore}`;
}

/**
 * Converts the rows of one sheet into cell values and sample sizes.
 *
 * Aggregate and course sheets share this conversion, so keys, sample sizes
 * and the small-sample marker behave identically at both levels.
 *
 * @param {object[]} righe - Rows read from a sheet.
 * @returns {{mappa:Map,numerosita:Map}} Sheet data and sample sizes.
 */
function costruisciScheda(righe) {
  const mappa = new Map();
  // Keep sample sizes per survey because reading them from an arbitrary row
  // of an unordered query would make them depend on insertion order.
  const numerosita = new Map();

  for (const riga of righe) {
    mappa.set(chiave(riga.indagine, riga.categoria, riga.indicatore), {
      valore: riga.valore,
      nota: riga.nota,
      valore_raw: riga.valore_raw,
    });
    if (!numerosita.has(riga.indagine)) {
      numerosita.set(riga.indagine, {
        laureati: riga.numero_laureati,
        compilatori: riga.numero_compilatori,
      });
    }
  }
  return { mappa, numerosita };
}

/**
 * Queries the data for one sheet.
 *
 * A course column whose university is still downloading returns no data and
 * `inCaricamento: true`; the column is drawn again when the download ends.
 *
 * @param {{tipo:string,codice:string,ateneo?:string}} colonna - Sheet selection.
 * @returns {{mappa:Map,numerosita:Map,inCaricamento?:boolean}} Sheet data and sample sizes.
 */
function interrogaScheda(colonna) {
  if (colonna.tipo === 'corso') {
    const dbAteneo = ateneoCaricato(colonna.ateneo);
    if (!dbAteneo) return { ...costruisciScheda([]), inCaricamento: true };
    return costruisciScheda(interrogaCorso(dbAteneo, colonna.codice, definizioneScelta));
  }

  const colonnaFiltro = colonna.tipo === 'ateneo' ? 'ateneo' : 'gruppo';
  const altraColonna = colonna.tipo === 'ateneo' ? 'gruppo' : 'ateneo';

  // The definition filter is not merely presentational. Without it, both
  // 'occupazione' versions return the same (category, indicator) pair for
  // 69 collisions, and the later row silently overwrites the first even when
  // employment rates differ by six points. '' and 'condivisa' always pass:
  // they are definition-independent rows (the graduate profile survey and blocks not
  // duplicated on the AlmaLaurea page, respectively).
  const stmt = db.prepare(
    `SELECT indagine, categoria, indicatore, valore, nota, valore_raw,
            numero_laureati, numero_compilatori
     FROM dati
     WHERE ${colonnaFiltro} = :codice AND ${altraColonna} = ''
       AND definizione IN ('', 'condivisa', :definizione)`
  );
  stmt.bind({ ':codice': colonna.codice, ':definizione': definizioneScelta });
  const righe = [];
  while (stmt.step()) righe.push(stmt.getAsObject());
  stmt.free();

  return costruisciScheda(righe);
}

// --- 5. Rendering the comparison table ---

/**
 * Formats a count with Italian digit grouping.
 *
 * @param {number|null|undefined} n - Count to format.
 * @returns {string} Formatted count, or an em dash when the count is missing.
 */
const formattaNumero = (n) => (n != null ? n.toLocaleString('it-IT') : '—');

// AlmaLaurea's own terms for respondents in each survey: graduate profile
// survey respondents complete a questionnaire, while employment outcomes
// survey respondents are interviewed by telephone. The labels quote
// AlmaLaurea's wording.
const NOME_RISPONDENTI = {
  profilo: 'compilatori del questionario',
  occupazione: 'intervistati',
};

/**
 * Returns the sample on which one table cell is based.
 *
 * The sample is the respondent count of the survey that the row belongs to,
 * not of the column as a whole, because the two surveys cover different
 * populations. Respondents are the true denominator of a percentage; when
 * that count is missing, the graduate count is used as the best available
 * upper bound and the tooltip names it as such.
 *
 * @param {Map} numerosita - Sample sizes by survey.
 * @param {string} indagine - Survey of the row.
 * @returns {{indagine: string, numero: number, nome: string, laureati: (number|null)}|null}
 *   Sample description, or null when no count is available.
 */
function campioneDellaRiga(numerosita, indagine) {
  const n = numerosita.get(indagine);
  if (!n) return null;
  if (n.compilatori != null) {
    return {
      indagine,
      numero: n.compilatori,
      nome: NOME_RISPONDENTI[indagine] ?? 'rispondenti',
      laureati: n.laureati,
    };
  }
  if (n.laureati != null) {
    return { indagine, numero: n.laureati, nome: 'laureati', laureati: null };
  }
  return null;
}

/**
 * Returns whether a sample is below the small-sample threshold.
 *
 * @param {object|null} campione - Sample returned by campioneDellaRiga().
 * @returns {boolean} True when the sample is known and below SOGLIA_CAMPIONE_PICCOLO.
 */
function campionePiccolo(campione) {
  return campione != null && campione.numero < SOGLIA_CAMPIONE_PICCOLO;
}

/**
 * Builds the tooltip line that states the sample behind a value.
 *
 * Below the threshold the text also explains why the sample size matters.
 *
 * @param {object} campione - Sample returned by campioneDellaRiga().
 * @returns {string} Tooltip text.
 */
function testoCampione(campione) {
  const base = `${formattaNumero(campione.numero)} ${campione.nome}`;
  const suLaureati =
    campione.laureati != null ? ` su ${formattaNumero(campione.laureati)} laureati` : '';
  if (campionePiccolo(campione)) {
    return (
      `Campione piccolo: ${base}${suLaureati} (indagine ${campione.indagine}), ` +
      `sotto la soglia di ${SOGLIA_CAMPIONE_PICCOLO}. Su cos\u00ec pochi rispondenti ` +
      'una percentuale \u00e8 instabile: leggi il valore con prudenza e non fidarti ' +
      'delle differenze piccole fra colonne.'
    );
  }
  return `Campione: ${base}${suLaureati} (indagine ${campione.indagine}).`;
}

// Show one sample-size row for each survey present in the table. One number is
// insufficient because the surveys cover different populations; assigning the
// employment sample size to the profile (or vice versa) would mislabel the data.
/**
 * Formats a comparison-column header.
 *
 * @param {object} colonna - Sheet selection.
 * @param {Map} numerosita - Sample sizes by survey.
 * @param {string[]} indaginiMostrate - Surveys displayed in the table.
 * @param {boolean} inCaricamento - Whether a course column is still downloading.
 * @param {string} colore - Colour of the column.
 * @returns {HTMLElement} Column header.
 */
function formattaIntestazioneColonna(colonna, numerosita, indaginiMostrate, inCaricamento, colore) {
  const contenitore = document.createElement('div');
  const riga1 = document.createElement('div');
  riga1.append(
    el('span', { class: 'pallino-colonna', style: { background: colore }, 'aria-hidden': 'true' }),
    etichettaColonna(colonna)
  );
  contenitore.appendChild(riga1);

  // A course name alone does not say where the course is taught.
  const sottotitolo =
    colonna.tipo === 'corso'
      ? colonna.errore ?? (inCaricamento
        ? `${etichettaCodice('ateneo', colonna.ateneo)} · caricamento dei corsi…`
        : etichettaCodice('ateneo', colonna.ateneo))
      : null;
  if (sottotitolo) {
    const riga = document.createElement('small');
    riga.className = 'sottotitolo-colonna';
    riga.textContent = sottotitolo;
    contenitore.appendChild(riga);
  }

  for (const indagine of indaginiMostrate) {
    const n = numerosita.get(indagine);
    if (!n || n.laureati == null) continue;
    const riga = document.createElement('small');
    riga.style.color = 'var(--testo-tenue)';
    riga.style.fontWeight = '400';
    riga.style.display = 'block';
    riga.textContent =
      indagine === 'occupazione'
        ? `${formattaNumero(n.laureati)} laureati · ${formattaNumero(n.compilatori)} intervistati`
        : `${formattaNumero(n.laureati)} laureati`;
    contenitore.appendChild(riga);
  }

  if (colonna.tipo === 'corso' && !inCaricamento && !colonna.errore) {
    contenitore.appendChild(
      el('a', { class: 'link-scheda', href: indirizzoScheda(colonna.ateneo, colonna.codice) },
        'Apri la scheda del corso')
    );
  }
  return contenitore;
}

/**
 * Creates a text table cell.
 *
 * @param {string} testo - Cell text.
 * @param {string|undefined} classe - Optional CSS class.
 * @returns {HTMLElement} Table cell.
 */
function creaCellaTesto(testo, classe) {
  const td = document.createElement('td');
  if (classe) td.className = classe;
  td.textContent = testo;
  return td;
}

/**
 * Creates a table cell for a data value.
 *
 * The sample size appears in the cell tooltip as well as in the column header,
 * so a reader can see the sample behind a value without tracing its survey.
 * Writing it as visible text would double the numbers in the table, so the
 * visual marker is reserved for cells below the threshold.
 *
 * @param {object|undefined} infoValore - Value information.
 * @param {object|null} campione - Sample returned by campioneDellaRiga().
 * @returns {HTMLElement} Value cell.
 */
function creaCellaValore(infoValore, campione) {
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
  if (campionePiccolo(campione)) td.classList.add('cella-campione-piccolo');

  const righe = [];
  if (campione) righe.push(testoCampione(campione));
  righe.push(`Valore originale AlmaLaurea: ${infoValore.valore_raw}`);
  td.title = righe.join('\n');
  return td;
}

/**
 * Creates the cell of a course-only question in a university or group column.
 *
 * A dash would read as missing data; the question simply does not exist for
 * a mixed-degree aggregate, and the tooltip says why.
 *
 * @returns {HTMLElement} Explanatory cell.
 */
function creaCellaSoloCorso() {
  const td = creaCellaTesto('solo per i corsi', 'cella-solo-corso');
  td.title =
    'Domanda posta solo ai laureati di primo livello: AlmaLaurea la pubblica per ' +
    'il singolo corso, non per atenei e gruppi, che mettono insieme tutti i tipi di laurea.';
  return td;
}

/**
 * Shows or hides the small-sample legend below the table.
 *
 * The legend appears only when at least one cell carries the marker, so the
 * table gains no explanatory line for a case that does not occur. The text
 * reads the threshold from the constant so that it cannot drift out of sync.
 *
 * @param {number} quante - Number of cells below the threshold.
 */
function aggiornaLegendaCampione(quante) {
  if (!elLegendaCampione) return;
  elLegendaCampione.classList.toggle('nascosto', quante === 0);
  if (quante === 0) return;
  elLegendaCampione.textContent =
    `\u2731 Valore basato su meno di ${SOGLIA_CAMPIONE_PICCOLO} rispondenti: ` +
    'campione piccolo, differenze piccole fra colonne non sono significative. ' +
    'Passa il mouse su una cella per la numerosit\u00e0 esatta.';
}

/** Renders the comparison table from the current selections and database. */
function renderTabella() {
  elTabellaHead.innerHTML = '';
  elTabellaBody.innerHTML = '';
  // Recount on every render: the columns and questions, and therefore the
  // cells below the threshold, can change.
  let sottoSoglia = 0;
  aggiornaLegendaCampione(0);

  // Course-only questions follow the columns: adding or removing a course
  // column shows or hides them in the filters too, with their counters.
  aggiornaVisibilitaVoci();
  aggiornaNotaDefinizione();

  // Release course databases no column shows any more. Universities in use
  // are never closed, so this is safe before the queries below. The course
  // sheet's university counts as in use too, or a redraw here could close the
  // database the sheet is reading.
  liberaAteneiNonUsati([
    ...colonne.filter((c) => c.tipo === 'corso').map((c) => c.ateneo),
    ...(statoScheda ? [statoScheda.ateneo] : []),
  ]);

  // The selector boxes follow the column order, which removals change.
  colonne.forEach((c, i) => {
    const pallino = elColonneSchede.querySelector(`[data-id="${c.id}"] .pallino-colonna`);
    if (pallino) pallino.style.background = coloreColonna(i);
  });

  if (colonne.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = 'Aggiungi almeno una colonna per vedere il confronto.';
    tr.appendChild(td);
    elTabellaBody.appendChild(tr);
    renderSintesi([]);
    return;
  }

  // Query each column once rather than issuing one query per question. The
  // summary cards read the same data, so they can never disagree with the table.
  const datiPerColonna = colonne.map((colonna, i) => ({
    colonna,
    colore: coloreColonna(i),
    ...interrogaScheda(colonna),
  }));
  renderSintesi(datiPerColonna);

  // Determine selected questions before rendering the header to identify which
  // surveys will appear and which sample sizes belong below each column name.
  const gruppi = vociSelezionate();
  const indaginiMostrate = [];
  for (const { voci } of gruppi) {
    for (const voce of voci) {
      if (!indaginiMostrate.includes(voce.indagine)) indaginiMostrate.push(voce.indagine);
    }
  }

  // --- Header ---
  const trHead = document.createElement('tr');
  const thDomanda = document.createElement('th');
  thDomanda.className = 'colonna-domanda';
  thDomanda.textContent = 'Domanda';
  trHead.appendChild(thDomanda);
  for (const { colonna, colore, numerosita, inCaricamento } of datiPerColonna) {
    const th = document.createElement('th');
    th.appendChild(
      formattaIntestazioneColonna(colonna, numerosita, indaginiMostrate, inCaricamento, colore)
    );
    trHead.appendChild(th);
  }
  elTabellaHead.appendChild(trHead);

  // --- Body grouped by macro-category ---

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
        // Standalone indicator: one row with its direct value.
        const tr = document.createElement('tr');
        tr.className = 'riga-domanda-intestazione';
        tr.appendChild(creaCellaTesto(voce.label, 'colonna-domanda'));
        const k = chiave(voce.indagine, voce.categoria, voce.indicatori[0]);
        for (const { colonna, mappa, numerosita } of datiPerColonna) {
          if (voce.soloCorso && colonna.tipo !== 'corso') {
            tr.appendChild(creaCellaSoloCorso());
            continue;
          }
          const campione = campioneDellaRiga(numerosita, voce.indagine);
          const cella = creaCellaValore(mappa.get(k), campione);
          if (cella.classList.contains('cella-campione-piccolo')) sottoSoglia++;
          tr.appendChild(cella);
        }
        elTabellaBody.appendChild(tr);
      } else {
        // Multi-option question: a title row without values followed by one
        // sub-row per indicator, using the same sheet columns.
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
          const k = chiave(voce.indagine, voce.categoria, indicatore);
          for (const { colonna, mappa, numerosita } of datiPerColonna) {
            if (voce.soloCorso && colonna.tipo !== 'corso') {
              tr.appendChild(creaCellaSoloCorso());
              continue;
            }
            const campione = campioneDellaRiga(numerosita, voce.indagine);
            const cella = creaCellaValore(mappa.get(k), campione);
            if (cella.classList.contains('cella-campione-piccolo')) sottoSoglia++;
            tr.appendChild(cella);
          }
          elTabellaBody.appendChild(tr);
        }
      }
    }
  }

  aggiornaLegendaCampione(sottoSoglia);
}

// --- 5b. Summary cards ("In sintesi") ---
// Six key questions (js/indicatori-chiave.js) for the columns of the
// comparison, drawn from the same per-column data as the table.

/**
 * Returns the text of one key value.
 *
 * @param {object|undefined} info - Value information from a sheet map.
 * @param {string} unita - Unit of the indicator.
 * @returns {string} Formatted value, the source's note, or a dash when the row is missing.
 */
function testoValoreChiave(info, unita) {
  if (!info) return '—';
  if (info.valore === null || info.valore === undefined) return processData(info);
  return formattaConUnita(info.valore, unita);
}

/**
 * Returns the sample line under a card: one count per column, in column order.
 *
 * @param {(object|null)[]} campioni - Sample of each column, from campioneDellaRiga().
 * @returns {string} Sample line.
 */
function testoCampioniSintesi(campioni) {
  const noti = campioni.filter(Boolean);
  if (noti.length === 0) return '';
  const nomi = new Set(noti.map((c) => c.nome));
  const numeri = campioni.map((c) => {
    if (!c) return '—';
    return nomi.size === 1 ? formattaNumero(c.numero) : `${formattaNumero(c.numero)} ${c.nome}`;
  });
  let testo = `Campione: ${numeri.join(' · ')}${nomi.size === 1 ? ` ${noti[0].nome}` : ''}.`;
  if (noti.some(campionePiccolo)) {
    testo += ` ✱ Sotto i ${SOGLIA_CAMPIONE_PICCOLO} rispondenti: leggi con prudenza.`;
  }
  return testo;
}

/**
 * Creates the card of one key indicator.
 *
 * @param {object} ind - Indicator from indicatori-chiave.js.
 * @param {object[]} datiPerColonna - Data of each comparison column.
 * @returns {HTMLElement} Card.
 */
function creaCartaIndicatore(ind, datiPerColonna) {
  const k = chiave(ind.indagine, ind.categoria, ind.indicatore);
  const valori = datiPerColonna
    .map((d) => d.mappa.get(k)?.valore)
    .filter((v) => v !== null && v !== undefined);
  const scala = scalaPer(ind.unita, valori);
  const campioni = [];

  const righe = datiPerColonna.map(({ colonna, colore, mappa, numerosita, inCaricamento }) => {
    const info = mappa.get(k);
    const campione = campioneDellaRiga(numerosita, ind.indagine);
    campioni.push(campione);
    const haValore = !inCaricamento && info?.valore !== null && info?.valore !== undefined;

    let testo;
    if (colonna.tipo === 'corso' && colonna.errore) testo = 'non disponibile';
    else if (inCaricamento) testo = 'caricamento…';
    else testo = testoValoreChiave(info, ind.unita);

    const nome = el('span', { class: 'kpi-nome' },
      el('span', { class: 'pallino-colonna', style: { background: colore }, 'aria-hidden': 'true' }),
      etichettaColonna(colonna),
      colonna.tipo === 'corso'
        ? el('small', {}, ` · ${etichettaCodice('ateneo', colonna.ateneo)}`)
        : null
    );
    const valore = el('span', {
      class: haValore ? 'kpi-valore' : 'kpi-valore kpi-nota',
      title: campione ? testoCampione(campione) : null,
    }, testo);
    const barra = el('div', { class: 'kpi-barra', 'aria-hidden': 'true' },
      haValore
        ? el('span', { style: { width: `${posizioneSu(info.valore, scala)}%`, background: colore } })
        : null
    );
    return el('li', { class: campionePiccolo(campione) ? 'kpi-riga kpi-campione-piccolo' : 'kpi-riga' },
      el('div', { class: 'kpi-riga-testa' }, nome, valore),
      barra
    );
  });

  return el('article', { class: 'kpi', 'data-indicatore': ind.id },
    el('p', { class: 'kpi-momento' }, ind.momento),
    el('h3', { class: 'kpi-titolo' }, ind.titolo),
    el('p', { class: 'kpi-domanda' }, etichettaUfficiale(ind)),
    el('ul', { class: 'kpi-righe' }, ...righe),
    el('p', { class: 'kpi-campione' }, testoCampioniSintesi(campioni))
  );
}

/** Writes which definition of "employed" the employment cards use. */
function aggiornaNotaSintesi() {
  elNotaSintesi.replaceChildren();
  if (definizioniDisponibili.length < 2) return;
  const cambia = el('button', { type: 'button', class: 'link-pulsante' }, 'si cambia qui');
  cambia.addEventListener('click', () => {
    elRiquadroDefinizione.scrollIntoView({ behavior: 'smooth', block: 'center' });
    elSelDefinizione.focus({ preventScroll: true });
  });
  elNotaSintesi.append(
    `Le domande sul lavoro usano la definizione ${definizioneScelta} di «occupato»: `,
    cambia,
    '.'
  );
}

/**
 * Renders the summary cards for the current columns.
 *
 * @param {object[]} datiPerColonna - Data of each comparison column, as renderTabella() reads it.
 */
function renderSintesi(datiPerColonna) {
  aggiornaNotaSintesi();
  if (datiPerColonna.length === 0) {
    elGrigliaSintesi.replaceChildren(
      el('p', { class: 'sintesi-vuota' }, 'Aggiungi almeno una colonna per vedere la sintesi.')
    );
    return;
  }
  elGrigliaSintesi.replaceChildren(
    ...INDICATORI_CRUSCOTTO.map((ind) => creaCartaIndicatore(ind, datiPerColonna))
  );
}

// --- 5c. Course sheet ("Scheda del corso") ---
// One course next to its university and its discipline group, on the key
// indicators. The three sheets are the official ones: nothing is averaged or
// recomputed to build the comparison.

// The sheet on screen, or null while no course is chosen:
// { ateneo, corso, gruppo, tipoCorso, errore, inCaricamento }.
let statoScheda = null;
let vistaCorrente = 'confronto';

const elVistaConfronto = document.getElementById('vista-confronto');
const elVistaScheda = document.getElementById('vista-scheda');
const elTabConfronto = document.getElementById('tab-confronto');
const elTabScheda = document.getElementById('tab-scheda');
const elSchedaCorso = document.getElementById('scheda-corso');
const elTitoloCercaCorso = document.getElementById('titolo-cerca-corso');
const elCercaTesto = document.getElementById('cerca-corso-testo');
const elCercaAteneo = document.getElementById('cerca-corso-ateneo');
const elCercaConteggio = document.getElementById('cerca-corso-conteggio');
const elCercaRisultati = document.getElementById('cerca-corso-risultati');

// Course databases hold first-level degrees only (tipo_corso 'L'); an
// unknown type simply gets no label rather than a guessed one.
const NOME_TIPO_CORSO = { L: 'Laurea di primo livello' };

/**
 * Returns the address of a course sheet.
 *
 * @param {string} ateneo - University code.
 * @param {string} corso - Course code.
 * @returns {string} Hash address.
 */
function indirizzoScheda(ateneo, corso) {
  return `#scheda/${ateneo}/${corso}`;
}

/**
 * Tells whether a course exists, reading only own keys: codes come from the
 * address bar, and a key like "__proto__" must not pass for a university.
 *
 * @param {string} ateneo - University code.
 * @param {string} corso - Course code.
 * @returns {boolean} Whether the course is in nomi-corso.js.
 */
function corsoEsiste(ateneo, corso) {
  return Object.hasOwn(NOMI_CORSO, ateneo) && Object.hasOwn(NOMI_CORSO[ateneo], corso);
}

/**
 * Opens the sheet of one course, downloading its university if needed.
 *
 * @param {string} ateneo - University code.
 * @param {string} corso - Course code.
 */
async function apriScheda(ateneo, corso) {
  const stato = { ateneo, corso, gruppo: null, tipoCorso: null, errore: null, inCaricamento: true };
  statoScheda = stato;
  renderScheda();
  try {
    const dbAteneo = await caricaAteneoCorsi(ateneo);
    const descrizione = descriviCorso(dbAteneo, corso);
    if (!descrizione) throw new Error('Il database dei corsi non contiene dati per questo corso.');
    stato.gruppo = descrizione.gruppo;
    stato.tipoCorso = descrizione.tipoCorso;
  } catch (errore) {
    stato.errore = errore.message;
  }
  stato.inCaricamento = false;
  // The user may have opened another course while this one was downloading.
  if (statoScheda === stato) renderScheda();
}

/**
 * Creates the shape of a marker: circle for the course, diamond for the
 * university, square for the group. Shapes, not only colours, tell the three
 * apart.
 *
 * @param {string} forma - 'cerchio', 'rombo' or 'quadrato'.
 * @returns {HTMLElement} Marker shape for the legend.
 */
function creaSegnoLegenda(forma) {
  return el('span', { class: `segno-legenda segno-${forma}`, 'aria-hidden': 'true' });
}

/**
 * Creates one row of the course sheet: an indicator for the three sheets.
 *
 * @param {object} ind - Indicator from indicatori-chiave.js.
 * @param {object[]} entita - The course, university and group, with their data.
 * @returns {{riga: HTMLElement, piccolo: boolean}} Row, and whether the course value rests on a small sample.
 */
function creaRigaParagone(ind, entita) {
  const k = chiave(ind.indagine, ind.categoria, ind.indicatore);
  const letture = entita.map((e) => {
    const info = e.dati?.mappa.get(k);
    const campione = e.dati ? campioneDellaRiga(e.dati.numerosita, ind.indagine) : null;
    return {
      e,
      info,
      campione,
      piccolo: campionePiccolo(campione),
      haValore: info?.valore !== null && info?.valore !== undefined,
    };
  });
  const scala = scalaPer(ind.unita, letture.filter((l) => l.haValore).map((l) => l.info.valore));
  const [estremoMin, estremoMax] = etichetteScala(scala, ind.unita);

  // Drawn back to front, so the course marker always sits on top.
  const segni = [...letture].reverse().filter((l) => l.haValore).map((l) =>
    el('span', {
      class: `segno segno-${l.e.forma}${l.piccolo ? ' segno-incerto' : ''}`,
      style: { left: `${posizioneSu(l.info.valore, scala)}%` },
      title: `${l.e.nome}: ${formattaConUnita(l.info.valore, ind.unita)}`,
    })
  );

  const valori = letture.map((l) =>
    el('span', {
      class: `paragone-valore${l.haValore ? '' : ' paragone-nota'}` +
        `${l.piccolo ? ' valore-campione-piccolo' : ''}`,
      'data-entita': l.e.chiave,
      title: l.campione ? testoCampione(l.campione) : null,
    },
      el('span', { class: 'paragone-valore-nome' }, l.e.breve),
      el('span', { class: 'paragone-numero' }, testoValoreChiave(l.info, ind.unita))
    )
  );

  const riga = el('div', { class: 'paragone-riga', 'data-indicatore': ind.id },
    el('div', { class: 'paragone-etichetta' },
      el('span', { class: 'paragone-titolo' }, ind.titolo),
      el('span', { class: 'paragone-domanda' }, etichettaUfficiale(ind))
    ),
    el('div', { class: 'paragone-traccia', 'aria-hidden': 'true' },
      el('div', { class: 'traccia' }, ...segni),
      el('div', { class: 'traccia-estremi' }, el('span', {}, estremoMin), el('span', {}, estremoMax))
    ),
    el('div', { class: 'paragone-valori' }, ...valori)
  );
  return { riga, piccolo: letture[0].piccolo };
}

/**
 * Creates the box that states the samples behind the course values.
 *
 * @param {Map} numerosita - Sample sizes of the course, by survey.
 * @returns {HTMLElement} Sample box.
 */
function creaRiquadroCampione(numerosita) {
  const profilo = numerosita.get('profilo');
  const occupazione = numerosita.get('occupazione');
  const voce = (etichetta, n) =>
    el('div', { class: 'campione-voce' },
      el('dt', {}, etichetta),
      el('dd', { class: n != null && n < SOGLIA_CAMPIONE_PICCOLO ? 'valore-campione-piccolo' : null },
        formattaNumero(n))
    );

  const riquadro = el('section', { class: 'pannello riquadro-campione' },
    el('h3', {}, 'Su quanti dati si basa il corso'),
    el('dl', {},
      voce('Laureati', profilo?.laureati),
      voce('Hanno compilato il questionario', profilo?.compilatori),
      voce('Intervistati sul lavoro', occupazione?.compilatori)
    ),
    el('p', { class: 'nota-riquadro' },
      `Sotto i ${SOGLIA_CAMPIONE_PICCOLO} rispondenti un valore del corso è segnato con ✱: ` +
      'su così pochi casi una percentuale è instabile.')
  );

  if (definizioniDisponibili.length >= 2) {
    const sel = el('select', { id: 'sel-definizione-scheda' },
      ...definizioniDisponibili.map((d) => new Option(d, d)));
    sel.value = definizioneScelta;
    // Forwarded to the comparison's selector, whose handler redraws both views.
    sel.addEventListener('change', () => {
      elSelDefinizione.value = sel.value;
      elSelDefinizione.dispatchEvent(new Event('change'));
    });
    riquadro.append(
      el('label', { class: 'riga-definizione-scheda' }, 'Definizione di «occupato»', sel),
      el('p', { class: 'nota-riquadro' }, TESTO_DEFINIZIONE[definizioneScelta] ?? '')
    );
  }
  return riquadro;
}

/** Replaces the comparison with the course, its university and its group. */
function confrontaSchedaSuTutto() {
  const { ateneo, corso, gruppo } = statoScheda;
  elColonneSchede.replaceChildren();
  colonne = [];
  creaColonna('corso', corso, ateneo);
  creaColonna('ateneo', ateneo);
  if (codiciGruppo.includes(gruppo)) creaColonna('gruppo', gruppo);
  renderTabella();
  location.hash = '#confronto';
}

/** Adds the course to the columns already in the comparison. */
function aggiungiSchedaAlConfronto() {
  creaColonna('corso', statoScheda.corso, statoScheda.ateneo);
  renderTabella();
  location.hash = '#confronto';
}

/**
 * Copies the sheet's address, which is enough to reopen it.
 *
 * @param {HTMLButtonElement} pulsante - Button whose label reports the outcome.
 */
async function copiaLinkScheda(pulsante) {
  try {
    await navigator.clipboard.writeText(location.href);
    pulsante.textContent = 'Link copiato';
  } catch {
    pulsante.textContent = 'Copia dalla barra degli indirizzi';
  }
}

/** Renders the course sheet from statoScheda and the selected definition. */
function renderScheda() {
  elTabScheda.setAttribute(
    'href', statoScheda ? indirizzoScheda(statoScheda.ateneo, statoScheda.corso) : '#scheda'
  );
  if (!statoScheda) {
    elSchedaCorso.classList.add('nascosto');
    elSchedaCorso.replaceChildren();
    elTitoloCercaCorso.textContent = 'Cerca un corso';
    return;
  }
  elTitoloCercaCorso.textContent = 'Cerca un altro corso';
  elSchedaCorso.classList.remove('nascosto');

  // The sheet is rebuilt on every change; keep focus on the control in use.
  const fuoco = elSchedaCorso.contains(document.activeElement) ? document.activeElement.id : '';

  const { ateneo, corso, gruppo, tipoCorso } = statoScheda;
  const nomeAteneo = etichettaCodice('ateneo', ateneo);
  const nomeGruppo = gruppo ? etichettaCodice('gruppo', gruppo) : null;

  const identita = el('div', { class: 'scheda-identita' },
    el('p', { class: 'scheda-briciole' }, nomeGruppo ? `${nomeAteneo} › ${nomeGruppo}` : nomeAteneo),
    el('h2', { class: 'scheda-titolo' }, NOMI_CORSO[ateneo][corso]),
    el('ul', { class: 'scheda-etichette' },
      el('li', {}, `Ateneo: ${nomeAteneo}`),
      NOME_TIPO_CORSO[tipoCorso] ? el('li', {}, NOME_TIPO_CORSO[tipoCorso]) : null,
      nomeGruppo ? el('li', {}, `Area: ${nomeGruppo}`) : null
    )
  );

  if (statoScheda.inCaricamento) {
    elSchedaCorso.replaceChildren(
      el('div', { class: 'scheda-testa' }, identita),
      el('p', { class: 'banda-stato' }, `Carico i corsi di ${nomeAteneo}…`)
    );
    return;
  }
  if (statoScheda.errore) {
    elSchedaCorso.replaceChildren(
      el('div', { class: 'scheda-testa' }, identita),
      el('p', { class: 'banda-errore' }, statoScheda.errore)
    );
    return;
  }
  const dbAteneo = ateneoCaricato(ateneo);
  if (!dbAteneo) {
    // Closed to make room for other universities: download it again.
    apriScheda(ateneo, corso);
    return;
  }

  const datiCorso = costruisciScheda(interrogaCorso(dbAteneo, corso, definizioneScelta));
  const entita = [
    { chiave: 'corso', nome: 'Il corso', breve: 'Corso', forma: 'cerchio', dati: datiCorso },
    {
      chiave: 'ateneo', nome: `Ateneo: ${nomeAteneo}`, breve: nomeAteneo, forma: 'rombo',
      dati: interrogaScheda({ tipo: 'ateneo', codice: ateneo }),
    },
    {
      chiave: 'area', nome: nomeGruppo ? `Area ${nomeGruppo}, tutta Italia` : 'Area', breve: 'Area',
      forma: 'quadrato',
      dati: codiciGruppo.includes(gruppo) ? interrogaScheda({ tipo: 'gruppo', codice: gruppo }) : null,
    },
  ];

  const btnTutto = el('button', { type: 'button', class: 'pulsante-primario' },
    'Confronta su tutte le domande');
  btnTutto.addEventListener('click', confrontaSchedaSuTutto);
  const btnAggiungi = el('button', { type: 'button', class: 'pulsante-secondario' },
    'Aggiungi al confronto');
  btnAggiungi.addEventListener('click', aggiungiSchedaAlConfronto);
  const btnLink = el('button', { type: 'button', class: 'pulsante-secondario' }, 'Copia il link');
  btnLink.addEventListener('click', () => copiaLinkScheda(btnLink));

  let piccoli = 0;
  const righe = [...INDICATORI_CRUSCOTTO, ...INDICATORI_SOLO_SCHEDA].map((ind) => {
    const { riga, piccolo } = creaRigaParagone(ind, entita);
    if (piccolo) piccoli++;
    return riga;
  });

  const paragone = el('section', { class: 'pannello scheda-paragone' },
    el('div', { class: 'paragone-testa' },
      el('h3', {}, 'Il corso accanto ai suoi termini di paragone'),
      el('ul', { class: 'paragone-legenda' },
        ...entita.map((e) => el('li', {}, creaSegnoLegenda(e.forma), e.nome)))
    ),
    el('div', { class: 'paragone-riga paragone-intestazione', 'aria-hidden': 'true' },
      el('span', {}), el('span', {}),
      el('div', { class: 'paragone-valori' }, ...entita.map((e) => el('span', {}, e.breve)))
    ),
    ...righe,
    piccoli > 0
      ? el('p', { class: 'legenda-campione' },
        `✱ Valore del corso basato su meno di ${SOGLIA_CAMPIONE_PICCOLO} rispondenti: ` +
        'le differenze piccole con ateneo e area non sono significative.')
      : null
  );

  const prudenza = el('section', { class: 'avviso-prudenza' },
    el('h3', {}, 'Leggere il paragone con prudenza'),
    el('p', {},
      'Ateneo e area mettono insieme tutti i tipi di laurea, triennali, magistrali e a ciclo ' +
      'unico, mentre il corso è una laurea di primo livello. Il paragone orienta, non misura ' +
      'una differenza esatta.')
  );

  elSchedaCorso.replaceChildren(
    el('div', { class: 'scheda-testa' },
      identita,
      el('div', { class: 'scheda-azioni' }, btnTutto, btnAggiungi, btnLink)
    ),
    el('div', { class: 'scheda-corpo' },
      paragone,
      el('aside', { class: 'scheda-lato' }, creaRiquadroCampione(datiCorso.numerosita), prudenza)
    ),
    el('p', { class: 'nota-piccola scheda-fonte' },
      'Fonte: AlmaLaurea, schede statistiche del corso, dell’ateneo e del gruppo ' +
      'disciplinare. Nessun valore è ricalcolato.')
  );

  if (fuoco) document.getElementById(fuoco)?.focus();
}

// --- Course search ---

/**
 * Lower-cases a string and strips its accents, so "universita" finds
 * "università".
 *
 * @param {string} testo - Text to normalize.
 * @returns {string} Normalized text.
 */
const normalizza = (testo) => testo.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Built on first search from nomi-corso.js alone: searching downloads nothing.
let indiceCorsi = null;
const LIMITE_RISULTATI = 60;

/** @returns {object[]} Every course, with the text a search matches against. */
function indiceDeiCorsi() {
  if (!indiceCorsi) {
    indiceCorsi = [];
    for (const ateneo of codiciOrdinatiPerVisualizzazione('ateneo')) {
      const nomeAteneo = etichettaCodice('ateneo', ateneo);
      const corsi = Object.entries(NOMI_CORSO[ateneo] ?? {})
        .sort(([, a], [, b]) => a.localeCompare(b, 'it'));
      for (const [codice, nome] of corsi) {
        indiceCorsi.push({ ateneo, codice, nome, nomeAteneo, testo: normalizza(`${nome} ${nomeAteneo}`) });
      }
    }
  }
  return indiceCorsi;
}

/** Updates the course list from the search box and the university filter. */
function aggiornaRicercaCorsi() {
  const parole = normalizza(elCercaTesto.value).split(/\s+/).filter(Boolean);
  const ateneo = elCercaAteneo.value;
  if (!ateneo && parole.join('').length < 2) {
    elCercaConteggio.textContent =
      'Scrivi almeno due lettere del nome del corso, oppure scegli un ateneo per vedere tutti i suoi corsi.';
    elCercaRisultati.replaceChildren();
    return;
  }

  const trovati = indiceDeiCorsi().filter((c) =>
    (!ateneo || c.ateneo === ateneo) && parole.every((p) => c.testo.includes(p)));
  // A single university never has so many courses that the list needs a cap.
  const mostrati = ateneo ? trovati : trovati.slice(0, LIMITE_RISULTATI);

  if (trovati.length === 0) {
    elCercaConteggio.textContent = 'Nessun corso trovato. Prova con meno parole o con un altro ateneo.';
  } else if (mostrati.length < trovati.length) {
    elCercaConteggio.textContent =
      `${formattaNumero(trovati.length)} corsi trovati: ecco i primi ${mostrati.length}. ` +
      'Aggiungi una parola o scegli un ateneo per restringere.';
  } else {
    elCercaConteggio.textContent =
      `${trovati.length} ${trovati.length === 1 ? 'corso trovato' : 'corsi trovati'}.`;
  }

  elCercaRisultati.replaceChildren(...mostrati.map((c) =>
    el('li', {},
      el('a', {
        href: indirizzoScheda(c.ateneo, c.codice),
        'aria-current': statoScheda?.ateneo === c.ateneo && statoScheda?.corso === c.codice ? 'page' : null,
      },
        el('span', { class: 'risultato-nome' }, c.nome),
        el('span', { class: 'risultato-ateneo' }, c.nomeAteneo)
      )
    )
  ));
}

/** Fills the university filter and wires the search box. */
function preparaRicercaCorsi() {
  for (const codice of codiciOrdinatiPerVisualizzazione('ateneo')) {
    elCercaAteneo.append(new Option(etichettaCodice('ateneo', codice), codice));
  }
  elCercaTesto.addEventListener('input', aggiornaRicercaCorsi);
  elCercaAteneo.addEventListener('change', aggiornaRicercaCorsi);
  aggiornaRicercaCorsi();
}

// --- Views and addresses ---

/**
 * Shows one of the two views.
 *
 * @param {string} vista - 'confronto' or 'scheda'.
 */
function mostraVista(vista) {
  const scheda = vista === 'scheda';
  elVistaConfronto.classList.toggle('nascosto', scheda);
  elVistaScheda.classList.toggle('nascosto', !scheda);
  if (scheda) {
    elTabScheda.setAttribute('aria-current', 'page');
    elTabConfronto.removeAttribute('aria-current');
  } else {
    elTabConfronto.setAttribute('aria-current', 'page');
    elTabScheda.removeAttribute('aria-current');
  }
  if (vista !== vistaCorrente) window.scrollTo(0, 0);
  vistaCorrente = vista;
}

/**
 * Applies the address: #confronto (or nothing), #scheda, or
 * #scheda/<university>/<course>.
 */
function applicaRotta() {
  let indirizzo = '';
  try {
    indirizzo = decodeURIComponent(location.hash.slice(1));
  } catch {
    // A malformed escape in a hand-edited address: fall back to the comparison.
  }
  const [vista, ateneo, corso] = indirizzo.split('/');
  if (vista !== 'scheda') {
    mostraVista('confronto');
    return;
  }
  mostraVista('scheda');
  if (ateneo && corso && corsoEsiste(ateneo, corso)) {
    if (statoScheda?.ateneo !== ateneo || statoScheda?.corso !== corso) {
      window.scrollTo(0, 0);
      apriScheda(ateneo, corso);
    }
  } else if (ateneo || corso) {
    statoScheda = null;
    renderScheda();
    aggiornaRicercaCorsi();
    elCercaConteggio.textContent =
      'Il corso indicato nell’indirizzo non esiste fra quelli pubblicati: cercalo qui sotto.';
    return;
  } else {
    renderScheda();
  }
  aggiornaRicercaCorsi();
}

// --- 6. Startup ---

/** Loads the dataset and initializes the comparison UI. */
async function avvia() {
  try {
    db = await caricaDatabase();
    leggiCodici(db);

    if (codiciAteneo.length === 0 && codiciGruppo.length === 0) {
      throw new Error('Il database è stato caricato ma non contiene codici ateneo/gruppo. Controlla il file.');
    }

    // Start with two columns so the user immediately sees a populated comparison.
    creaColonna('ateneo', codiciAteneo[0]);
    creaColonna('ateneo', codiciAteneo[1] ?? codiciAteneo[0]);

    renderFiltri();
    renderSelettoreDefinizione();
    aggiornaVisibilitaVoci();
    renderTabella();

    elStatoCaricamento.classList.add('nascosto');
    elAreaApp.classList.remove('nascosto');

    // The address may already ask for a course sheet, as a shared link does.
    preparaRicercaCorsi();
    applicaRotta();
    window.addEventListener('hashchange', applicaRotta);
  } catch (errore) {
    mostraErrore(
      'Non sono riuscito a caricare i dati. Controlla che almalaurea.sqlite sia nella stessa cartella di questa pagina e che tu la stia aprendo da un server locale (non con doppio click).',
      errore
    );
  }
}


// --- 7. AI layer: natural-language request -> validated query ---
// The UI uses only chiediConfronto(), which returns a query already filtered by
// the validator; this layer therefore receives only real columns and questions.

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

// An address on the user's machine usually means a network error indicates a
// missing permission rather than an unavailable server.
const RE_INDIRIZZO_LOCALE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

// When fetch fails because of CORS, the browser returns the same generic
// TypeError as for a disconnected network rather than identifying CORS.
// The message cannot distinguish the cases, but a local address makes missing
// permission the most likely cause and is more useful than "Failed to fetch".
/**
 * Determines whether an error resembles a network failure.
 *
 * @param {unknown} errore - Error to inspect.
 * @returns {boolean} Whether the error resembles a network failure.
 */
function eErroreDiRete(errore) {
  return (
    errore instanceof TypeError ||
    /failed to fetch|networkerror|load failed/i.test(errore?.message ?? '')
  );
}

/**
 * Diagnoses a connection error for display to the user.
 *
 * @param {unknown} errore - Error to inspect.
 * @param {string} baseUrl - Configured service URL.
 * @returns {object|null} User-facing diagnosis.
 */
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

/** @returns {object} Current AI connection configuration. */
function leggiConfigAi() {
  return {
    forma: elAiForma.value,
    baseUrl: elAiBaseUrl.value.trim(),
    model: elAiModel.value.trim(),
    apiKey: elAiKey.value.trim() || undefined,
  };
}

function salvaConfigAi() {
  // localStorage may be unavailable in private windows or due to permissions;
  // the configuration remains valid for this page without surfacing an error.
  try {
    localStorage.setItem(CHIAVE_CONFIG_AI, JSON.stringify(leggiConfigAi()));
  } catch { /* Storage is optional; keep the in-memory configuration. */ }
}

/** Restores the saved AI connection configuration when storage is available. */
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

/**
 * Displays an AI request status.
 *
 * @param {string} testo - Status text.
 * @param {string} tipo - Status category.
 */
function mostraStatoAi(testo, tipo) {
  elAiStato.textContent = testo;
  elAiStato.className = 'ai-stato' + (tipo ? ` ai-stato-${tipo}` : '');
}

// Apply a VALIDATED query to the comparison UI state, then redraw. If one part is
// empty because the AI produced nothing valid for it, preserve that UI section.
/** @param {{colonne:object[],domande:string[]}} query - Validated UI selections. */
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

/** Sends the current natural-language request to the configured AI provider. */
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

// Attach events only when the AI markup exists; without the panel, the comparison
// UI continues to work unchanged.
if (elAiInvia) {
  // CORS instructions must contain this page's EXACT address. It differs
  // locally (http://localhost:8000) and online (https://...github.io), and a
  // wrong origin authorizes nothing, so write it at runtime rather than in HTML.
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
    try { localStorage.removeItem(CHIAVE_CONFIG_AI); } catch { /* Storage is optional. */ }
    elAiKey.value = '';
    mostraStatoAi('Configurazione AI dimenticata da questo browser.', 'ok');
  });
  caricaConfigAi();
}

avvia();
