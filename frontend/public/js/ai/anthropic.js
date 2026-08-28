// anthropic.js
//
// Adattatore per la "forma Anthropic" (Messages API). Chiamabile dal browser
// grazie all'header anthropic-dangerous-direct-browser-access.
//
// Stessa interfaccia dell'altro adattatore:
//   chiedi(config, systemPrompt, frase) -> Promise<oggetto grezzo query>
// Restituisce gli argomenti del tool_use, NON validati (li valida il muro).

import { TOOL_ANTHROPIC, NOME_STRUMENTO } from './tool-schema.js';

export async function chiedi(config, systemPrompt, frase) {
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  const url = `${base}/v1/messages`;

  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    // Necessario per chiamare l'API direttamente da JavaScript nel browser.
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
