// tool-schema.js
//
// The tool/function the AI must fill in. Its schema is the query: which
// university or discipline-group columns to compare and which questions to
// display. Integrity constraints:
//   - values are ENUMs of real codes/IDs, so strict providers prevent the AI
//     from naming nonexistent entities;
//   - there is no "valore" field, so the AI has nowhere to write a number.
//
// The same tool is exported in the formats required by Anthropic and by
// OpenAI-compatible endpoints, whether cloud-hosted or local.

import { CODICI_TUTTI, ID_DOMANDE_VALIDI } from './vocabolario.js';

const ID_DOMANDE = [...ID_DOMANDE_VALIDI];
const NOME_TOOL = 'imposta_confronto';
const DESCRIZIONE_TOOL =
  'Imposta il confronto da mostrare in tabella: le colonne (atenei o gruppi ' +
  'disciplinari) e le domande da visualizzare. Non restituire mai valori o ' +
  'numeri: solo le SCELTE. I numeri li calcola il sito dal dataset ufficiale.';

// Shared parameter schema expressed as plain JSON Schema.
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

// Anthropic Messages API format: tools[].input_schema.
export const TOOL_ANTHROPIC = {
  name: NOME_TOOL,
  description: DESCRIZIONE_TOOL,
  input_schema: PARAMETRI,
};

// OpenAI-compatible format for chat/completions and most local runners:
// tools[].function.parameters, with "strict" where supported.
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
