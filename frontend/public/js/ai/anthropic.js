// anthropic.js
//
// Adapter for Anthropic's Messages API. Browser calls require the
// anthropic-dangerous-direct-browser-access header.
//
// It has the same interface as the other adapter and returns tool_use
// arguments without validation; validatore.js performs that validation.

import { TOOL_ANTHROPIC, NOME_STRUMENTO } from './tool-schema.js';

/**
 * Sends a natural-language request through Anthropic's Messages API.
 *
 * @param {{baseUrl?: string, model: string, apiKey?: string}} config - API configuration.
 * @param {string} systemPrompt - Instructions and the closed vocabulary.
 * @param {string} frase - User request in natural language.
 * @returns {Promise<object>} Unvalidated arguments returned by the selected tool.
 * @throws {Error} If the HTTP response is unsuccessful or contains no matching tool call.
 */
export async function chiedi(config, systemPrompt, frase) {
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  const url = `${base}/v1/messages`;

  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    // Anthropic requires this header for direct browser requests.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (config.apiKey) headers['x-api-key'] = config.apiKey;

  const corpo = {
    model: config.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: frase }],
    tools: [TOOL_ANTHROPIC],
    tool_choice: { type: 'tool', name: NOME_STRUMENTO },
  };

  const risposta = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
  });
  if (!risposta.ok) {
    const testo = await risposta.text().catch(() => '');
    throw new Error(`AI (Anthropic) HTTP ${risposta.status}: ${testo.slice(0, 300)}`);
  }

  const dati = await risposta.json();
  const blocco = Array.isArray(dati?.content)
    ? dati.content.find((b) => b?.type === 'tool_use' && b?.name === NOME_STRUMENTO)
    : null;
  if (blocco?.input != null) return blocco.input;

  throw new Error('AI (Anthropic): nessun tool_use nella risposta.');
}
