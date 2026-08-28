// openai-compat.js
//
// Adattatore per la "forma OpenAI-compatibile": /chat/completions con
// function calling. Copre OpenAI, i provider cloud OpenAI-compat e i runner
// locali (Ollama http://localhost:11434/v1, LM Studio, llama.cpp, vLLM...).
//
// Interfaccia comune a tutti gli adattatori:
//   chiedi(config, systemPrompt, tool, frase) -> Promise<oggetto grezzo query>
// Restituisce l'oggetto ARGOMENTI del tool-call, NON validato: la validazione
// e' compito di validatore.js (il muro). Qui ci limitiamo a parlare l'API.

import { TOOL_OPENAI, NOME_STRUMENTO } from './tool-schema.js';

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
    // Forziamo la chiamata al nostro strumento dove il provider lo supporta.
    // I runner che ignorano tool_choice ripiegano sul fallback piu' sotto.
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

  // Percorso normale: tool_calls con gli argomenti come stringa JSON.
  const toolCall = messaggio?.tool_calls?.find(
    (t) => t?.function?.name === NOME_STRUMENTO
  );
  if (toolCall?.function?.arguments != null) {
    return estraiJson(toolCall.function.arguments);
  }

  // Fallback per modelli locali che mettono il JSON nel contenuto invece
  // di usare il canale tool_calls.
  if (typeof messaggio?.content === 'string' && messaggio.content.trim()) {
    return estraiJson(messaggio.content);
  }

  throw new Error('AI (OpenAI-compat): nessuna chiamata allo strumento nella risposta.');
}

// Estrae un oggetto JSON da una stringa che potrebbe contenere testo intorno
// (thinking, code fence...). Non "corregge" i dati: solo parsing robusto.
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
