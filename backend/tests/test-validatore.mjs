// Test del validatore (Livello 2). Eseguibile con: node backend/tests/test-validatore.mjs
// Verifica che l'unica cosa che passa siano codici/domande REALI, e che
// spazzatura, tipi errati e duplicati vengano scartati.

import {
  CODICI_ATENEO_VALIDI,
  CODICI_GRUPPO_VALIDI,
  ID_DOMANDE_VALIDI,
  costruisciVocabolarioPerPrompt,
} from '../../frontend/public/js/ai/vocabolario.js';
import { validaQuery } from '../../frontend/public/js/ai/validatore.js';
import { TOOL_ANTHROPIC, TOOL_OPENAI } from '../../frontend/public/js/ai/tool-schema.js';

let falliti = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) falliti++;
}

// Prendo valori reali dal vocabolario stesso.
const atenoReale = [...CODICI_ATENEO_VALIDI][0];
const gruppoReale = [...CODICI_GRUPPO_VALIDI][0];
const [dom1, dom2] = [...ID_DOMANDE_VALIDI];

console.log('Valori reali usati:', { atenoReale, gruppoReale, dom1, dom2 });

// --- Caso 1: input pulito -> tutto tenuto ---
let r = validaQuery({
  colonne: [
    { tipo: 'ateneo', codice: atenoReale },
    { tipo: 'gruppo', codice: gruppoReale },
  ],
  domande: [dom1, dom2],
  nota_per_utente: 'Ho scelto un ateneo e un gruppo.',
});
ok(r.colonne.length === 2, 'input pulito: 2 colonne tenute');
ok(r.domande.length === 2, 'input pulito: 2 domande tenute');
ok(r.scartati.colonne.length === 0 && r.scartati.domande.length === 0, 'input pulito: niente scartato');
ok(r.nota === 'Ho scelto un ateneo e un gruppo.', 'input pulito: nota passata');

// --- Caso 2: spazzatura -> scartata ---
r = validaQuery({
  colonne: [
    { tipo: 'ateneo', codice: '99999' },        // codice inesistente
    { tipo: 'gruppo', codice: atenoReale },      // codice di ateneo spacciato per gruppo
    { tipo: 'pinco', codice: gruppoReale },      // tipo inventato
    { tipo: 'ateneo', codice: atenoReale },      // questo e' l'unico buono
  ],
  domande: [dom1, 'domanda_inventata_dallAI', 42],
});
ok(r.colonne.length === 1 && r.colonne[0].codice === atenoReale, 'spazzatura: tenuta solo la colonna reale');
ok(r.scartati.colonne.length === 3, 'spazzatura: 3 colonne scartate');
ok(r.domande.length === 1 && r.domande[0] === dom1, 'spazzatura: tenuta solo la domanda reale');
ok(r.scartati.domande.length === 2, 'spazzatura: 2 domande scartate');

// --- Caso 3: duplicati -> deduplicati ---
r = validaQuery({
  colonne: [
    { tipo: 'ateneo', codice: atenoReale },
    { tipo: 'ateneo', codice: atenoReale },
  ],
  domande: [dom1, dom1, dom1],
});
ok(r.colonne.length === 1, 'duplicati: colonna deduplicata');
ok(r.domande.length === 1, 'duplicati: domanda deduplicata');

// --- Caso 4: input malformato / vuoto -> non esplode ---
r = validaQuery(null);
ok(r.colonne.length === 0 && r.domande.length === 0, 'null: ritorna vuoto senza errori');
r = validaQuery({ colonne: 'non un array', domande: undefined });
ok(r.colonne.length === 0 && r.domande.length === 0, 'campi malformati: ritorna vuoto');

// --- Sanita' schema/vocabolario ---
ok(TOOL_ANTHROPIC.name === 'imposta_confronto' && !!TOOL_ANTHROPIC.input_schema, 'schema Anthropic presente');
ok(TOOL_OPENAI.function.name === 'imposta_confronto' && TOOL_OPENAI.function.strict === true, 'schema OpenAI presente e strict');
ok(!JSON.stringify(TOOL_ANTHROPIC).includes('valore') && !JSON.stringify(TOOL_OPENAI).includes('valore'), 'schema: nessun campo "valore"');
ok(costruisciVocabolarioPerPrompt().includes('DOMANDE selezionabili'), 'vocabolario prompt costruito');

console.log(falliti === 0 ? '\nTUTTI I TEST PASSATI' : `\n${falliti} TEST FALLITI`);
process.exit(falliti === 0 ? 0 : 1);
