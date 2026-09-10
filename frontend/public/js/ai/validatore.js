// validatore.js
//
// Validation boundary for AI output.
//
// All AI output passes through this module before reaching the UI, regardless
// of provider or model. Every code must exist and every question must be a real
// CONFIG_FILTRI ID. Nonexistent values are discarded rather than displayed.
// This guarantee does not depend on model behaviour.
//
// The worst possible outcome is an incorrect selection that can be corrected
// manually, never an incorrect table number: numbers come only from sql.js,
// and the tool schema has no value field.

import {
  CODICI_ATENEO_VALIDI,
  CODICI_GRUPPO_VALIDI,
  ID_DOMANDE_VALIDI,
} from './vocabolario.js';

/**
 * Filters untrusted tool output against the real application vocabulary.
 *
 * @param {any} grezzo - Untrusted object returned by the AI tool call.
 * @returns {{colonne: {tipo:string,codice:string}[], domande: string[],
 *            nota: string, scartati: {colonne:any[], domande:any[]}}} Valid selections and discarded values.
 */
export function validaQuery(grezzo) {
  const scartati = { colonne: [], domande: [] };

  // Keep only coherent, existing (tipo, codice) pairs.
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

  // Keep only real IDs, without duplicates, in received order.
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

  // Keep the note as text; never interpret it as data.
  const nota =
    typeof grezzo?.nota_per_utente === 'string' ? grezzo.nota_per_utente : '';

  return { colonne, domande, nota, scartati };
}
