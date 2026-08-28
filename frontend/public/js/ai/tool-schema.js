// tool-schema.js
//
// Lo strumento (tool/function) che l'AI e' obbligata a compilare. Lo schema
// E' la query: quali colonne (ateneo/gruppo) confrontare e quali domande
// mostrare. Punti di integrita' (fase2-progettazione.md, §3):
//   - i valori sono ENUM di codici/id reali -> dove il provider valida in
//     modo stretto, l'AI non puo' nemmeno nominare qualcosa di inesistente;
//   - NON esiste alcun campo "valore": l'AI non ha dove scrivere un numero.
//
// Esportato in due forme, cosi' lo stesso strumento parla sia con l'API
// Anthropic sia con qualsiasi endpoint OpenAI-compatibile (cloud o locale).

import { CODICI_TUTTI, ID_DOMANDE_VALIDI } from './vocabolario.js';

const ID_DOMANDE = [...ID_DOMANDE_VALIDI];
const NOME_TOOL = 'imposta_confronto';
const DESCRIZIONE_TOOL =
  'Imposta il confronto da mostrare in tabella: le colonne (atenei o gruppi ' +
  'disciplinari) e le domande da visualizzare. Non restituire mai valori o ' +
  'numeri: solo le SCELTE. I numeri li calcola il sito dal dataset ufficiale.';

// Lo schema dei parametri, condiviso (JSON Schema puro).
const PARAMETRI = {
  type: 'object',
  properties: {
    colonne: {
      type: 'array',
      description: 'Le schede da mettere a confronto, come colonne.',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['ateneo', 'gruppo'] },
          codice: {
            type: 'string',
            enum: CODICI_TUTTI,
            description: 'Codice reale dell\'ateneo o del gruppo scelto.',
          },
        },
        required: ['tipo', 'codice'],
        additionalProperties: false,
      },
    },
    domande: {
      type: 'array',
      description: 'Gli id delle domande da mostrare (da CONFIG_FILTRI).',
      items: { type: 'string', enum: ID_DOMANDE },
    },
    nota_per_utente: {
      type: 'string',
      description:
        'Frase breve che dice COSA hai selezionato e PERCHE\'. Mai valori o numeri.',
    },
  },
  required: ['colonne', 'domande'],
  additionalProperties: false,
};

// Forma Anthropic (Messages API): tools[].input_schema.
export const TOOL_ANTHROPIC = {
  name: NOME_TOOL,
  description: DESCRIZIONE_TOOL,
  input_schema: PARAMETRI,
};

// Forma OpenAI-compatibile (chat/completions e la maggior parte dei runner
// locali): tools[].function.parameters, con "strict" dove supportato.
export const TOOL_OPENAI = {
  type: 'function',
  function: {
    name: NOME_TOOL,
    description: DESCRIZIONE_TOOL,
    parameters: PARAMETRI,
    strict: true,
  },
};

export const NOME_STRUMENTO = NOME_TOOL;
