// db-corsi.js
//
// Data layer for course-level data: one sql.js database per university,
// downloaded from corsi/<code>.sqlite only when something asks for it.
//
// This module deliberately touches no DOM. The interface will be redesigned,
// and keeping loading separate from rendering means the redesign can replace
// the table and selectors without rewriting how data reaches the browser.
//
// Why one file per university: all courses in a single database weigh 274 MB
// uncompressed, and the site loads databases INTO the browser. Split by
// university, the largest (Sapienza, 70026) is 13.9 MB on disk and 1.8 MB
// over the network, because GitHub Pages serves it gzip-compressed.

import { NOMI_ATENEO } from './nomi-ateneo.js';

const SQL_JS_BASE = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/';

// Each open database lives in the browser's memory. Beyond this many, the
// least recently used ones that no column needs are closed.
export const MAX_ATENEI_APERTI = 4;

// --- sql.js, initialized once ---

let promessaSql = null;

/**
 * Returns the sql.js module, initializing it on first use.
 *
 * Both the aggregate database and the per-university databases share this
 * instance, so the WebAssembly module is downloaded and compiled only once.
 * A failed initialization is forgotten so a later call can retry.
 *
 * @returns {Promise<object>} The sql.js module.
 */
export function inizializzaSql() {
  if (!promessaSql) {
    promessaSql = initSqlJs({ locateFile: (file) => `${SQL_JS_BASE}${file}` });
    promessaSql.catch(() => { promessaSql = null; });
  }
  return promessaSql;
}

// --- Per-university databases ---

// Only real university codes may become a download path, so neither a typo
// nor the AI layer can make the page fetch an arbitrary file.
const CODICI_VALIDI = new Set(Object.keys(NOMI_ATENEO));

// code -> Promise<Database>. Map iteration follows insertion order, and every
// access re-inserts the entry, so the first entries are the least recently used.
const cache = new Map();

// code -> Database, only for downloads that have finished and are still
// cached. The comparison table renders synchronously, so it needs to know
// without awaiting whether a university is ready.
const aperti = new Map();

/**
 * Downloads and opens one university's course database.
 *
 * @param {string} codice - University code.
 * @returns {Promise<object>} Open sql.js database.
 */
async function scaricaAteneo(codice) {
  const SQL = await inizializzaSql();
  const risposta = await fetch(`corsi/${codice}.sqlite`);
  if (!risposta.ok) {
    throw new Error(`Impossibile scaricare i corsi di ${NOMI_ATENEO[codice]} (HTTP ${risposta.status}).`);
  }
  const db = new SQL.Database(new Uint8Array(await risposta.arrayBuffer()));
  // A response that is not a course database (for example an HTML error page
  // served with status 200) would otherwise surface later as a confusing
  // query error far from its cause.
  try {
    db.exec('SELECT 1 FROM dati LIMIT 1;');
  } catch (errore) {
    db.close();
    throw new Error(`Il file dei corsi di ${NOMI_ATENEO[codice]} non è un database valido.`);
  }
  return db;
}

/**
 * Returns the course database of one university, downloading it on first use.
 *
 * Repeated or concurrent calls for the same code share one download. A failed
 * download is removed from the cache so the next call retries it.
 *
 * @param {string} codice - University code, e.g. '70026'.
 * @returns {Promise<object>} Open sql.js database containing only that university's courses.
 */
export function caricaAteneoCorsi(codice) {
  if (!CODICI_VALIDI.has(codice)) {
    return Promise.reject(new Error(`Codice ateneo sconosciuto: ${codice}`));
  }
  let promessa = cache.get(codice);
  if (promessa) {
    cache.delete(codice);
  } else {
    promessa = scaricaAteneo(codice);
    promessa.then(
      (db) => {
        // An entry evicted while downloading is closed by the eviction and
        // must not reappear as ready.
        if (cache.get(codice) === promessa) aperti.set(codice, db);
      },
      () => {
        if (cache.get(codice) === promessa) cache.delete(codice);
      }
    );
  }
  cache.set(codice, promessa);
  return promessa;
}

/**
 * Closes cached databases that no column needs, keeping at most
 * MAX_ATENEI_APERTI open.
 *
 * Closing never happens during a load, only here: the interface calls this
 * whenever it redraws, with the codes it is displaying, so a database still in
 * use is never closed, even when more than MAX_ATENEI_APERTI are displayed at
 * once. A download still in progress is not evicted either: dropping it would
 * waste the transfer and force a new one if the user returns to it.
 *
 * @param {Iterable<string>} codiciInUso - University codes currently displayed.
 */
export function liberaAteneiNonUsati(codiciInUso) {
  const inUso = new Set(codiciInUso);
  for (const [codice, promessa] of cache) {
    if (cache.size <= MAX_ATENEI_APERTI) break;
    if (inUso.has(codice) || !aperti.has(codice)) continue;
    cache.delete(codice);
    aperti.delete(codice);
    promessa.then((db) => db.close(), () => {});
  }
}

/**
 * Returns a university's course database if it has finished downloading.
 *
 * @param {string} codice - University code.
 * @returns {object|null} Open sql.js database, or null while not yet available.
 */
export function ateneoCaricato(codice) {
  return aperti.get(codice) ?? null;
}

/**
 * Reads the rows of one course sheet.
 *
 * Course rows carry both a university and a group code, so the aggregate
 * query (one of the two empty) never matches them: courses are selected by
 * their own code instead. The definition filter follows the same rule as the
 * aggregate query: '' and 'condivisa' rows are valid under every definition.
 *
 * @param {object} db - Course database of the course's university.
 * @param {string} corso - Course code.
 * @param {string} definizione - Selected definition of "employed".
 * @returns {object[]} Rows with the columns the comparison table reads.
 */
export function interrogaCorso(db, corso, definizione) {
  const stmt = db.prepare(
    `SELECT indagine, categoria, indicatore, valore, nota, valore_raw,
            numero_laureati, numero_compilatori
     FROM dati
     WHERE corso = :corso
       AND definizione IN ('', 'condivisa', :definizione)`
  );
  const righe = [];
  try {
    stmt.bind({ ':corso': corso, ':definizione': definizione });
    while (stmt.step()) righe.push(stmt.getAsObject());
  } finally {
    stmt.free();
  }
  return righe;
}

/** @returns {string[]} Codes of the cached universities, least recently used first. */
export function ateneiInMemoria() {
  return [...cache.keys()];
}
