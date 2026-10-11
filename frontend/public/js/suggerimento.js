// suggerimento.js
//
// A tooltip drawn by the page instead of the browser. The native tooltip that
// a title attribute produces cannot be styled, and on a phone it never shows,
// because there is no hover. This module keeps every title where app.js
// writes it (the tests read it there) and only borrows it while the bubble is
// up: on hover the title attribute, or the <title> child of an SVG marker, is
// taken off so the browser stays quiet, and is put back on leave.
//
// Mouse: the bubble follows hover, after a short delay. Touch and pen: a tap
// on a value toggles it, a tap elsewhere or a scroll closes it; controls
// (buttons, links, form fields) are left to their own tap.

const RITARDO_MS = 150;
const MARGINE = 8;
const INTERATTIVI = 'button, a, input, select, textarea, summary, label';

let bolla = null;
let sorgente = null;
let titoloPreso = null;
let timer = null;

/**
 * Finds the element that carries a tooltip for the given target: the nearest
 * ancestor with a title attribute, or an SVG with a <title> child.
 *
 * @param {EventTarget} bersaglio - Event target.
 * @returns {Element|null} Tooltip source, or null.
 */
function trovaSorgente(bersaglio) {
  for (let nodo = bersaglio; nodo && nodo.nodeType === 1; nodo = nodo.parentNode) {
    if (nodo === sorgente) return nodo;
    if (nodo.hasAttribute('title')) return nodo;
    if (nodo instanceof SVGSVGElement && nodo.querySelector(':scope > title')) return nodo;
  }
  return null;
}

/**
 * Takes the tooltip text off its source, so the native tooltip stays hidden.
 *
 * @param {Element} el - Tooltip source.
 * @returns {string} The text that was taken.
 */
function prendiTitolo(el) {
  if (el.hasAttribute('title')) {
    titoloPreso = { attributo: el.getAttribute('title') };
    el.removeAttribute('title');
    return titoloPreso.attributo;
  }
  const nodo = el.querySelector(':scope > title');
  titoloPreso = { nodo };
  nodo.remove();
  return nodo.textContent;
}

/** Puts the borrowed title back where it was. */
function restituisciTitolo() {
  if (!sorgente || !titoloPreso) return;
  if (titoloPreso.attributo !== undefined) {
    // app.js may have written a new title meanwhile: that one wins.
    if (!sorgente.hasAttribute('title')) sorgente.setAttribute('title', titoloPreso.attributo);
  } else {
    sorgente.prepend(titoloPreso.nodo);
  }
  sorgente.removeAttribute('aria-describedby');
  titoloPreso = null;
}

/**
 * Fills the bubble: with more than one line the first is bold.
 *
 * @param {string} testo - Tooltip text; lines split on "\n".
 */
function riempi(testo) {
  const righe = testo.split('\n').filter((r) => r.trim() !== '');
  bolla.replaceChildren(...righe.map((riga, i) => {
    const p = document.createElement(righe.length > 1 && i === 0 ? 'strong' : 'span');
    p.textContent = riga;
    return p;
  }));
}

/**
 * Places the bubble above the source, or below when there is no room, and
 * keeps it inside the viewport. The anchor is the source's content, not its
 * box: a table cell is wide, its number sits at the right edge.
 *
 * @param {Element} el - Tooltip source.
 */
function posiziona(el) {
  let r = el.getBoundingClientRect();
  if (!(el instanceof SVGElement) && el.textContent.trim() !== '') {
    const intervallo = document.createRange();
    intervallo.selectNodeContents(el);
    const contenuto = intervallo.getBoundingClientRect();
    if (contenuto.width > 0) r = contenuto;
  }
  const b = bolla.getBoundingClientRect();
  const centro = r.left + r.width / 2;
  const x = Math.min(Math.max(centro - b.width / 2, MARGINE), window.innerWidth - b.width - MARGINE);
  const sopra = r.top - b.height - 10 >= MARGINE;
  const y = sopra ? r.top - b.height - 10 : r.bottom + 10;
  bolla.dataset.lato = sopra ? 'sopra' : 'sotto';
  bolla.style.left = `${x + window.scrollX}px`;
  bolla.style.top = `${y + window.scrollY}px`;
  bolla.style.setProperty('--freccia', `${centro - x}px`);
}

/**
 * Shows the bubble for a source.
 *
 * @param {Element} el - Tooltip source.
 */
function mostra(el) {
  nascondi();
  sorgente = el;
  riempi(prendiTitolo(el));
  el.setAttribute('aria-describedby', bolla.id);
  bolla.hidden = false;
  bolla.classList.remove('visibile');
  posiziona(el);
  requestAnimationFrame(() => bolla.classList.add('visibile'));
}

/** Hides the bubble and returns the title to its source. */
function nascondi() {
  clearTimeout(timer);
  restituisciTitolo();
  sorgente = null;
  if (bolla) {
    bolla.hidden = true;
    bolla.classList.remove('visibile');
  }
}

/** Creates the bubble and wires the listeners. Call once. */
export function attivaSuggerimenti() {
  bolla = document.createElement('div');
  bolla.id = 'suggerimento';
  bolla.className = 'suggerimento';
  bolla.setAttribute('role', 'tooltip');
  bolla.hidden = true;
  document.body.append(bolla);

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = trovaSorgente(e.target);
    if (!el || el === sorgente) return;
    clearTimeout(timer);
    if (sorgente) nascondi();
    timer = setTimeout(() => mostra(el), RITARDO_MS);
  });

  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    const da = trovaSorgente(e.target);
    if (!da) return;
    if (e.relatedTarget && da.contains(e.relatedTarget)) return;
    clearTimeout(timer);
    if (da === sorgente) nascondi();
  });

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      nascondi();
      return;
    }
    const el = trovaSorgente(e.target);
    if (!el || el.closest(INTERATTIVI)) {
      nascondi();
      return;
    }
    if (el === sorgente) nascondi();
    else mostra(el);
  });

  window.addEventListener('scroll', () => { if (sorgente) nascondi(); }, { passive: true });
  window.addEventListener('resize', nascondi);
  window.addEventListener('blur', nascondi);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') nascondi(); });
}
