// test-browser.mjs
//
// Prova l'app COME LA VEDE UN BROWSER: avvia un server statico, apre Chrome
// headless, aspetta che la tabella si popoli e interroga il DOM vero.
//
// PERCHE' ESISTE: le prove piu' importanti di questo progetto (la tabella si
// popola? la console e' pulita? cambiare definizione cambia davvero i numeri?)
// non si possono fare senza un browser, perche' i dati li carica sql.js a
// runtime. Questo file era stato riscritto a mano tre volte in altrettante
// sessioni: adesso e' del progetto.
//
// ZERO DIPENDENZE, di proposito. Chrome e' gia' sulla macchina e Node 22 ha
// WebSocket globale, quindi si pilota Chrome via DevTools Protocol senza
// installare niente: --headless=new --remote-debugging-port=N, poi
// PUT /json/new per aprire una scheda, WebSocket, Runtime.evaluate.
//
// USO:  node backend/tests/test-browser.mjs
//       node backend/tests/test-browser.mjs --porta 8123 --vedi
//       node backend/tests/test-browser.mjs --url https://marege08.github.io/almalaurea/
//         --vedi  lascia il browser visibile (utile per guardare cosa succede)
//         --url   prova un sito gia' pubblicato invece della copia locale: le
//                 stesse verifiche valgono in produzione, ed e' il modo di
//                 sapere che il deploy e' andato davvero, non "dovrebbe".

import { spawn } from 'node:child_process';
import { setTimeout as attendi } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBBLICA = path.join(RADICE, 'frontend', 'public');

const argomenti = process.argv.slice(2);
const valoreDi = (nome, predefinito) => {
  const i = argomenti.indexOf(nome);
  return i >= 0 && argomenti[i + 1] ? argomenti[i + 1] : predefinito;
};
const PORTA_HTTP = Number(valoreDi('--porta', '8765'));
const PORTA_CDP = PORTA_HTTP + 1;
const HEADLESS = !argomenti.includes('--vedi');
// Con --url non si avvia nessun server: si prova il sito indicato.
const URL_ESTERNO = valoreDi('--url', null);
const INDIRIZZO = URL_ESTERNO ?? `http://localhost:${PORTA_HTTP}/index.html`;

const CHROME = ['google-chrome', 'google-chrome-stable', 'chromium'];

let passati = 0;
let falliti = 0;
function verifica(descrizione, condizione, dettaglio) {
  if (condizione) {
    passati++;
    console.log(`PASS ${descrizione}`);
  } else {
    falliti++;
    console.log(`FAIL ${descrizione}${dettaglio ? `  -> ${dettaglio}` : ''}`);
  }
}

// Aspetta che una porta risponda, invece di dormire a caso: un `sleep 2` e'
// tanto lento quanto fragile.
async function aspettaPorta(url, tentativi = 100) {
  for (let i = 0; i < tentativi; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json().catch(() => ({}));
    } catch { /* non ancora in piedi */ }
    await attendi(100);
  }
  throw new Error(`Nessuna risposta da ${url} dopo ${tentativi / 10}s`);
}

// --- Connessione DevTools: una scheda nuova, poi WebSocket su di essa. ---
async function apriScheda(indirizzo) {
  const scheda = await (
    await fetch(`http://127.0.0.1:${PORTA_CDP}/json/new?${encodeURIComponent(indirizzo)}`,
                { method: 'PUT' })
  ).json();
  const ws = new WebSocket(scheda.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });

  let contatore = 0;
  const inAttesa = new Map();
  const erroriConsole = [];
  ws.onmessage = (evento) => {
    const m = JSON.parse(evento.data);
    if (m.id && inAttesa.has(m.id)) {
      const { ok, ko } = inAttesa.get(m.id);
      inAttesa.delete(m.id);
      m.error ? ko(new Error(m.error.message)) : ok(m.result);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      erroriConsole.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      erroriConsole.push(m.params.exceptionDetails.text ?? 'eccezione');
    }
  };

  const invia = (method, params = {}) =>
    new Promise((ok, ko) => {
      const id = ++contatore;
      inAttesa.set(id, { ok, ko });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await invia('Runtime.enable');

  // Valuta espressioni nella pagina. `await` supportato: molte verifiche
  // devono aspettare che sql.js abbia finito.
  const valuta = async (espressione) => {
    const r = await invia('Runtime.evaluate', {
      expression: espressione,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'errore in pagina');
    }
    return r.result.value;
  };

  return { valuta, erroriConsole, chiudi: () => ws.close() };
}

// Aspetta una condizione NELLA pagina (il caricamento del DB non e' istantaneo).
// L'espressione viene incapsulata in un try: nei primi millisecondi il
// documento puo' non esistere ancora, e un null non e' un fallimento, e'
// semplicemente "non ancora". Senza questo il test muore sulla prima
// valutazione invece di aspettare.
async function aspettaInPagina(valuta, espressione, descrizione, tentativi = 200) {
  let ultimoErrore = '';
  for (let i = 0; i < tentativi; i++) {
    try {
      if (await valuta(`(() => { try { return !!(${espressione}); } catch { return false; } })()`)) {
        return true;
      }
    } catch (e) {
      ultimoErrore = e.message;
    }
    await attendi(100);
  }
  throw new Error(`Timeout aspettando: ${descrizione}${ultimoErrore ? ` (${ultimoErrore})` : ''}`);
}

async function main() {
  const server = URL_ESTERNO
    ? null
    : spawn('python3', ['-m', 'http.server', String(PORTA_HTTP)], {
        cwd: PUBBLICA, stdio: 'ignore',
      });

  let chrome = null;
  let scheda = null;
  try {
    console.log(`Provo: ${INDIRIZZO}\n`);
    if (server) await aspettaPorta(`http://127.0.0.1:${PORTA_HTTP}/index.html`).catch(() => {});

    for (const binario of CHROME) {
      try {
        chrome = spawn(binario, [
          HEADLESS ? '--headless=new' : '--new-window',
          `--remote-debugging-port=${PORTA_CDP}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--user-data-dir=/tmp/almalaurea-test-chrome',
          'about:blank',
        ], { stdio: 'ignore' });
        break;
      } catch { /* provo il prossimo */ }
    }
    if (!chrome) throw new Error(`Nessun Chrome trovato fra: ${CHROME.join(', ')}`);

    await aspettaPorta(`http://127.0.0.1:${PORTA_CDP}/json/version`);
    scheda = await apriScheda(INDIRIZZO);
    const { valuta } = scheda;

    // Prima che il documento esista, poi che l'app sia effettivamente accesa.
    await aspettaInPagina(valuta, `document.readyState === 'complete'`, 'pagina caricata');
    await aspettaInPagina(valuta,
      `document.getElementById('area-app') &&
       !document.getElementById('area-app').classList.contains('nascosto')`,
      'app visibile (database caricato)');

    // --- 1. La tabella si popola ---
    const celle = await valuta(`document.querySelectorAll('#tabella-body td').length`);
    verifica('la tabella di confronto si popola', celle > 500, `${celle} celle`);

    // --- 2. Le macro-categorie sono quelle attese ---
    const macro = await valuta(
      `[...document.querySelectorAll('#accordion-filtri details')]
         .filter(d => !d.hidden)
         .map(d => d.querySelector('summary span').textContent)`);
    verifica('«Dopo la Laurea» compare fra i filtri',
      macro.includes('Dopo la Laurea'), macro.join(' | '));

    // --- 3. Il selettore di definizione c'e' ed e' popolato ---
    const sel = await valuta(`(() => {
      const r = document.getElementById('riquadro-definizione');
      const s = document.getElementById('sel-definizione');
      return { visibile: !r.classList.contains('nascosto'),
               opzioni: [...s.options].map(o => o.value),
               scelta: s.value,
               nota: document.getElementById('nota-definizione').textContent };
    })()`);
    verifica('il selettore di definizione e\' visibile', sel.visibile);
    verifica('offre ampia e restrittiva',
      sel.opzioni.includes('ampia') && sel.opzioni.includes('restrittiva'),
      sel.opzioni.join(','));
    verifica('parte dalla definizione ampia, come il sito AlmaLaurea',
      sel.scelta === 'ampia', sel.scelta);
    verifica('la nota spiega la definizione scelta',
      sel.nota.includes('anche di formazione'), sel.nota.slice(0, 60));

    // --- 4. Cambiare definizione cambia le domande consultabili ---
    const primaDelCambio = await valuta(`(() => {
      const vis = [...document.querySelectorAll('#accordion-filtri .voce-checkbox')]
        .filter(l => !l.hidden).map(l => l.textContent);
      return { quante: vis.length, ha: vis.some(t => t.includes('Ricerca del lavoro')) };
    })()`);
    verifica('con ampia si vede «Ricerca del lavoro»', primaDelCambio.ha);

    await valuta(`(() => {
      const s = document.getElementById('sel-definizione');
      s.value = 'restrittiva';
      s.dispatchEvent(new Event('change'));
      return true;
    })()`);
    await attendi(300);

    const dopoIlCambio = await valuta(`(() => {
      const vis = [...document.querySelectorAll('#accordion-filtri .voce-checkbox')]
        .filter(l => !l.hidden).map(l => l.textContent);
      return { quante: vis.length,
               haRicerca: vis.some(t => t.includes('Ricerca del lavoro')),
               haCondizione: vis.some(t => t.includes('Condizione occupazionale')) };
    })()`);
    verifica('con restrittiva «Ricerca del lavoro» sparisce', !dopoIlCambio.haRicerca);
    verifica('con restrittiva compare «Condizione occupazionale»', dopoIlCambio.haCondizione);
    verifica('il numero di domande consultabili resta lo stesso',
      primaDelCambio.quante === dopoIlCambio.quante,
      `${primaDelCambio.quante} vs ${dopoIlCambio.quante}`);

    // --- 5. E cambia davvero i NUMERI (la ragione di tutto il lavoro) ---
    // "Non hanno mai lavorato dopo la laurea" vale 29,4 con la definizione
    // ampia e 35,7 con la restrittiva: sei punti di differenza. Se le due
    // scelte dessero lo stesso numero, il filtro non starebbe funzionando.
    const testoTabella = async () =>
      valuta(`document.getElementById('tabella-body').textContent`);
    const conRestrittiva = await testoTabella();
    await valuta(`(() => {
      const s = document.getElementById('sel-definizione');
      s.value = 'ampia'; s.dispatchEvent(new Event('change')); return true;
    })()`);
    await attendi(300);
    const conAmpia = await testoTabella();
    verifica('le due definizioni producono tabelle diverse',
      conRestrittiva !== conAmpia);

    // --- 5b. Il numero preciso, non solo "sono diverse" ---
    // A Bari (prima colonna all'avvio) "Non hanno mai lavorato dopo la laurea"
    // vale 29,4 con la definizione ampia e 35,7 con la restrittiva. E' il caso
    // che ha dimostrato che la colonna `definizione` serviva: se la pagina
    // mostrasse lo stesso numero con entrambe, il filtro non funzionerebbe.
    // La prima colonna all'avvio e' il primo ateneo in ordine di codice
    // (70001), non Bari: la si punta esplicitamente, altrimenti il test
    // verificherebbe numeri di un ateneo qualsiasi.
    await valuta(`(() => {
      const sel = document.querySelector('.colonna-scheda').querySelectorAll('select')[1];
      sel.value = '70002';
      sel.dispatchEvent(new Event('change'));
      return sel.value;
    })()`);
    await attendi(300);

    const valoreDellaRiga = (etichetta) => valuta(`(() => {
      const righe = [...document.querySelectorAll('#tabella-body tr')];
      const r = righe.find(tr => tr.cells[0]?.textContent.trim() === ${JSON.stringify(etichetta)});
      return r ? r.cells[1].textContent.trim() : null;
    })()`);
    const ETICHETTA = 'Non hanno mai lavorato dopo la laurea';
    const ampiaValore = await valoreDellaRiga(ETICHETTA);
    verifica('con ampia il valore di Bari e\' 29,4',
      ampiaValore === '29,4', String(ampiaValore));
    await valuta(`(() => {
      const s = document.getElementById('sel-definizione');
      s.value = 'restrittiva'; s.dispatchEvent(new Event('change')); return true;
    })()`);
    await attendi(300);
    const restrittivaValore = await valoreDellaRiga(ETICHETTA);
    verifica('con restrittiva lo stesso valore diventa 35,7',
      restrittivaValore === '35,7', String(restrittivaValore));

    // --- 6. Numerosita' per indagine nell'intestazione ---
    const intestazione = await valuta(
      `document.getElementById('tabella-head').textContent`);
    verifica('l\'intestazione mostra anche gli intervistati di occupazione',
      intestazione.includes('intervistati'), intestazione.slice(0, 90));

    // --- 7. Console pulita ---
    await attendi(300);
    verifica('nessun errore nella console del browser',
      scheda.erroriConsole.length === 0, scheda.erroriConsole.join(' / '));

  } finally {
    scheda?.chiudi();
    chrome?.kill();
    server?.kill();
  }

  console.log(`\n${passati} passati, ${falliti} falliti`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERRORE:', e.message);
  process.exit(1);
});
