// validatore.js
//
// IL MURO (fase2-progettazione.md, §3, Livello 2).
//
// Qualunque cosa torni dall'AI — provider serio o modellino locale traballante
// — passa di qui PRIMA di toccare la UI. Ogni codice deve esistere davvero,
// ogni domanda dev'essere un id reale di CONFIG_FILTRI. Cio' che non e' reale
// viene SCARTATO, non mostrato. Questa e' la garanzia che non dipende dal
// modello: non ci fidiamo dell'AI, ci fidiamo di questa funzione.
//
// Il caso peggiore possibile e' "l'AI ha selezionato male, correggi a mano",
// MAI "un numero sbagliato in tabella" (i numeri non passano nemmeno di qui:
// arrivano solo da sql.js, e nello schema del tool non c'e' campo valore).

import {
  CODICI_ATENEO_VALIDI,
  CODICI_GRUPPO_VALIDI,
  ID_DOMANDE_VALIDI,
} from './vocabolario.js';

/**
 * @param {any} grezzo - l'oggetto arrivato dal tool-call dell'AI (non fidato)
 * @returns {{colonne: {tipo:string,codice:string}[], domande: string[],
 *            nota: string, scartati: {colonne:any[], domande:any[]}}}
 */
export function validaQuery(grezzo) {
  const scartati = { colonne: [], domande: [] };

  // --- Colonne: tieni solo (tipo, codice) coerenti e realmente esistenti ---
  const colonne = [];
  const vistoColonna = new Set();
  const colonneGrezze = Array.isArray(grezzo?.colonne) ? grezzo.colonne : [];
  for (const c of colonneGrezze) {
    const tipo = c?.tipo;
    const codice = c?.codice != null ? String(c.codice) : '';
    const insieme =
      tipo === 'ateneo'
        ? CODICI_ATENEO_VALIDI
        : tipo === 'gruppo'
        ? CODICI_GRUPPO_VALIDI
        : null;

    const chiave = `${tipo}:${codice}`;
    if (insieme && insieme.has(codice) && !vistoColonna.has(chiave)) {
      colonne.push({ tipo, codice });
      vistoColonna.add(chiave);
    } else {
      scartati.colonne.push(c);
    }
  }

  // --- Domande: tieni solo id reali, senza duplicati, nell'ordine ricevuto ---
  const domande = [];
  const vistoId = new Set();
  const domandeGrezze = Array.isArray(grezzo?.domande) ? grezzo.domande : [];
  for (const id of domandeGrezze) {
    if (ID_DOMANDE_VALIDI.has(id) && !vistoId.has(id)) {
      domande.push(id);
      vistoId.add(id);
    } else {
      scartati.domande.push(id);
    }
  }

  // --- Nota: solo testo, mai interpretata come dato ---
  const nota =
    typeof grezzo?.nota_per_utente === 'string' ? grezzo.nota_per_utente : '';

  return { colonne, domande, nota, scartati };
}
