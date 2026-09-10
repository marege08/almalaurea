// connettore.js
//
// Single entry point for the AI layer. The UI supplies the user-selected
// connection configuration and request; this module builds the vocabulary
// prompt, selects the adapter, and returns a query validated by validatore.js.
//
// The rest of the application does not depend on the provider or filtering
// details; it receives only real columns and questions.

import { costruisciVocabolarioPerPrompt } from './vocabolario.js';
import { validaQuery } from './validatore.js';
import { chiedi as chiediOpenAI } from './openai-compat.js';
import { chiedi as chiediAnthropic } from './anthropic.js';

const ISTRUZIONI = [
  'Sei l\'assistente di un sito che confronta dati ufficiali AlmaLaurea sui laureati.',
  'Il tuo UNICO compito e\' tradurre la richiesta dell\'utente in una chiamata allo',
  'strumento imposta_confronto: scegli le COLONNE (atenei o gruppi disciplinari) e le',
  'DOMANDE da mostrare, prendendole SOLO dal vocabolario qui sotto.',
  '',
  'Regole ferree:',
  '- Non scrivere MAI numeri, percentuali, valori o classifiche: i numeri li calcola',
  '  il sito dal dataset. Tu scegli solo COSA mostrare.',
  '- Usa esclusivamente i codici e gli id presenti nel vocabolario. Se qualcosa non c\'e\',',
  '  ignoralo, non inventarlo.',
  '- Se l\'utente chiede un confronto (es. "informatica vs economia"), metti piu\' colonne.',
  '- In nota_per_utente scrivi una frase breve su COSA hai selezionato e PERCHE\', mai valori.',
  '- Rispondi SEMPRE e SOLO chiamando lo strumento imposta_confronto.',
].join('\n');

/**
 * Builds the provider-independent system prompt with the closed vocabulary.
 *
 * @returns {string} Instructions and vocabulary for the AI provider.
 */
function costruisciSystemPrompt() {
  return `${ISTRUZIONI}\n\n=== VOCABOLARIO ===\n${costruisciVocabolarioPerPrompt()}`;
}

/**
 * Sends a request through the configured provider and validates its selections.
 *
 * @param {{forma:'anthropic'|'openai', baseUrl:string, model:string, apiKey?:string}} config - Provider configuration.
 * @param {string} frase - Request in natural language.
 * @returns {Promise<{colonne:any[], domande:string[], nota:string, scartati:object}>} Validated query.
 * @throws {Error} If the provider request fails or returns an unusable response.
 */
export async function chiediConfronto(config, frase) {
  const systemPrompt = costruisciSystemPrompt();
  const adattatore = config.forma === 'anthropic' ? chiediAnthropic : chiediOpenAI;
  const grezzo = await adattatore(config, systemPrompt, frase);
  return validaQuery(grezzo); // Validation boundary: only real selections pass.
}

export { costruisciSystemPrompt };
