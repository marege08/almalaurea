// vocabolario.js
//
// The vocabulary is the closed list of real entities the AI may name:
// universities, discipline groups, and every CONFIG_FILTRI question.
// It serves two purposes:
//   1) build the system-prompt text so the AI can map names such as
//      "informatica" to the correct group code;
//   2) provide valid sets to the client-side validator, which discards
//      anything that is not real.
//
// It generates no new data and reuses the three existing application modules.
// Changes to the dataset are reflected automatically through those modules.

import { CONFIG_FILTRI } from '../config-filtri.js';
import { NOMI_ATENEO } from '../nomi-ateneo.js';
import { NOMI_GRUPPO } from '../nomi-gruppo.js';

/**
 * Returns all question entries flattened with their macro-category.
 *
 * @returns {{id: string, label: string, macro: string}[]} Question entries.
 */
export function tutteLeDomande() {
  const out = [];
  for (const macro of Object.keys(CONFIG_FILTRI)) {
    for (const v of CONFIG_FILTRI[macro]) {
      // Course-only questions stay out: the AI cannot create course columns
      // yet, so it could only select questions every column leaves empty.
      if (v.soloCorso) continue;
      out.push({ id: v.id, label: v.label, macro });
    }
  }
  return out;
}

// Valid sets used as the source of truth for AI-output validation.
export const CODICI_ATENEO_VALIDI = new Set(Object.keys(NOMI_ATENEO));
export const CODICI_GRUPPO_VALIDI = new Set(Object.keys(NOMI_GRUPPO));
export const ID_DOMANDE_VALIDI = new Set(tutteLeDomande().map((d) => d.id));

// Combined university and group codes for the tool schema's "codice" enum;
// tipo is represented by a separate field.
export const CODICI_TUTTI = [...CODICI_ATENEO_VALIDI, ...CODICI_GRUPPO_VALIDI];

/**
 * Builds the vocabulary text inserted into the system prompt.
 * The stable block is suitable for prompt caching when a provider supports it.
 *
 * @returns {string} Vocabulary containing entity codes, names, and questions.
 */
export function costruisciVocabolarioPerPrompt() {
  const atenei = Object.entries(NOMI_ATENEO)
    .map(([c, n]) => `${c} = ${n}`)
    .join('\n');
  const gruppi = Object.entries(NOMI_GRUPPO)
    .map(([c, n]) => `${c} = ${n}`)
    .join('\n');
  const domande = tutteLeDomande()
    .map((d) => `${d.id} = ${d.label}  [${d.macro}]`)
    .join('\n');

  return [
    'ATENEI (codice = nome):',
    atenei,
    '',
    'GRUPPI DISCIPLINARI (codice = nome):',
    gruppi,
    '',
    'DOMANDE selezionabili (id = etichetta [macro-categoria]):',
    domande,
  ].join('\n');
}
