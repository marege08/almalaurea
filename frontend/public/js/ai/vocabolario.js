// vocabolario.js
//
// Il "vocabolario" e' l'elenco chiuso di cose reali che l'AI puo' nominare:
// gli atenei, i gruppi disciplinari e le 79 domande di CONFIG_FILTRI.
// Serve a due scopi:
//   1) costruire il testo da mettere nel system prompt (cosi' l'AI sa che
//      "informatica" -> codice gruppo giusto);
//   2) fornire gli INSIEMI VALIDI al validatore (validatore.js), il muro
//      lato client che scarta tutto cio' che non e' reale.
//
// Non genera dati nuovi: riusa i tre moduli gia' presenti in Fase 1.
// Se il dataset cambia, cambiano quei moduli e questo si aggiorna da solo.

import { CONFIG_FILTRI } from '../config-filtri.js';
import { NOMI_ATENEO } from '../nomi-ateneo.js';
import { NOMI_GRUPPO } from '../nomi-gruppo.js';

// Tutte le voci-domanda appiattite, con la loro macro-categoria.
export function tutteLeDomande() {
  const out = [];
  for (const macro of Object.keys(CONFIG_FILTRI)) {
    for (const v of CONFIG_FILTRI[macro]) {
      out.push({ id: v.id, label: v.label, macro });
    }
  }
  return out;
}

// Insiemi validi: la verita' contro cui il validatore confronta l'output AI.
export const CODICI_ATENEO_VALIDI = new Set(Object.keys(NOMI_ATENEO));
export const CODICI_GRUPPO_VALIDI = new Set(Object.keys(NOMI_GRUPPO));
export const ID_DOMANDE_VALIDI = new Set(tutteLeDomande().map((d) => d.id));

// Tutti i codici (ateneo + gruppo) in un unico insieme: utile per l'enum
// "codice" dello schema del tool, dove il tipo e' un campo a parte.
export const CODICI_TUTTI = [...CODICI_ATENEO_VALIDI, ...CODICI_GRUPPO_VALIDI];

// Testo del vocabolario per il system prompt. Blocco stabile: buon
// candidato al prompt caching dove il provider lo offre.
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
