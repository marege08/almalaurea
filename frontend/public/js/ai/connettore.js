// connettore.js
//
// Punto d'ingresso unico dello strato AI. La UI chiamera' SOLO questo:
// gli passa la configurazione della connessione (scelta dall'utente) e la
// frase; lui costruisce il prompt col vocabolario, chiama l'adattatore giusto,
// e restituisce la query GIA' VALIDATA (passata dal muro di validatore.js).
//
// Il resto dell'app non sa ne' quale provider c'e' sotto, ne' che l'output
// dell'AI e' stato filtrato: riceve solo colonne+domande reali.

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

function costruisciSystemPrompt() {
  return `${ISTRUZIONI}\n\n=== VOCABOLARIO ===\n${costruisciVocabolarioPerPrompt()}`;
}

/**
 * @param {{forma:'anthropic'|'openai', baseUrl:string, model:string, apiKey?:string}} config
 * @param {string} frase - la richiesta in linguaggio naturale
 * @returns {Promise<{colonne:any[], domande:string[], nota:string, scartati:object}>}
 */
export async function chiediConfronto(config, frase) {
  const systemPrompt = costruisciSystemPrompt();
  const adattatore = config.forma === 'anthropic' ? chiediAnthropic : chiediOpenAI;
  const grezzo = await adattatore(config, systemPrompt, frase);
  return validaQuery(grezzo); // <- il muro: solo reale passa
}

export { costruisciSystemPrompt };
