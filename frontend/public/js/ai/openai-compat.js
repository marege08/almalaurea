// openai-compat.js
//
// Adapter for the OpenAI-compatible /chat/completions function-calling API.
// It covers OpenAI, compatible cloud providers, and local runners such as
// Ollama, LM Studio, llama.cpp, and vLLM.
//
// The common adapter interface returns tool-call arguments without validation;
// validatore.js performs validation, while this module handles API transport.

import { TOOL_OPENAI, NOME_STRUMENTO } from './tool-schema.js';

/**
 * Sends a natural-language request through an OpenAI-compatible endpoint.
 *
 * @param {{baseUrl: string, model: string, apiKey?: string}} config - Provider configuration.
 * @param {string} systemPrompt - Instructions and the closed vocabulary.
 * @param {string} frase - User request in natural language.
 * @returns {Promise<object>} Unvalidated tool-call arguments.
 * @throws {Error} If the HTTP response is unsuccessful or no JSON tool result is found.
 */
export async function chiedi(config, systemPrompt, frase) {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const corpo = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: frase },
    ],
    tools: [TOOL_OPENAI],
    // Request the application tool where supported; local runners that ignore
    // tool_choice are handled by the content fallback below.
    tool_choice: { type: 'function', function: { name: NOME_STRUMENTO } },
    stream: false,
  };

  const risposta = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
  });
  if (!risposta.ok) {
    const testo = await risposta.text().catch(() => '');
    throw new Error(`AI (OpenAI-compat) HTTP ${risposta.status}: ${testo.slice(0, 300)}`);
  }

  const dati = await risposta.json();
  const messaggio = dati?.choices?.[0]?.message;

  // Normal response: tool_calls contains the arguments as a JSON string.
  const toolCall = messaggio?.tool_calls?.find(
    (t) => t?.function?.name === NOME_STRUMENTO
  );
  if (toolCall?.function?.arguments != null) {
    return estraiJson(toolCall.function.arguments);
  }

  // Fallback for local models that place JSON in content instead of tool_calls.
  if (typeof messaggio?.content === 'string' && messaggio.content.trim()) {
    return estraiJson(messaggio.content);
  }

  throw new Error('AI (OpenAI-compat): nessuna chiamata allo strumento nella risposta.');
}

/**
 * Extracts a JSON value from a response that may contain surrounding text.
 * The function does not correct data; it only makes parsing tolerant of
 * reasoning text and code fences.
 *
 * @param {string|object} testo - Raw response text or an already parsed value.
 * @returns {object} Parsed JSON value, or the original non-string value.
 * @throws {Error} If no valid JSON object can be parsed.
 */
function estraiJson(testo) {
  if (typeof testo !== 'string') return testo;
  try {
    return JSON.parse(testo);
  } catch {
    const inizio = testo.indexOf('{');
    const fine = testo.lastIndexOf('}');
    if (inizio !== -1 && fine > inizio) {
      return JSON.parse(testo.slice(inizio, fine + 1));
    }
    throw new Error('AI (OpenAI-compat): risposta non e\' JSON valido.');
  }
}
