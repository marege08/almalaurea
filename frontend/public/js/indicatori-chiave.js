// indicatori-chiave.js
//
// The handful of indicators shown at a glance in the summary of the
// comparison, and the questions selected when the page opens. Written by
// hand, unlike config-filtri.js: choosing WHICH questions a student sees
// first is an editorial decision, not something the dataset can decide.
//
// Only the title is editorial. `categoria` and `indicatore` are the exact
// AlmaLaurea labels, the same keys the comparison table reads, and the page
// shows them under every title, so each number can be traced back to its
// question. No value is computed here: this file only says where to look and
// how to format what is found.
//
// Every entry was checked against the data: it exists for all 78
// universities, all 15 groups and the courses, so a missing value is a real
// gap in the source (shown as its note), never a typo here.

/**
 * @typedef {object} IndicatoreChiave
 * @property {string} id - Stable identifier, used in the DOM.
 * @property {string} momento - 'Dopo la laurea' or 'Durante gli studi'.
 * @property {string} titolo - Plain-language question the indicator answers.
 * @property {string} indagine - 'profilo' or 'occupazione'.
 * @property {string} categoria - AlmaLaurea category label, verbatim.
 * @property {string} indicatore - AlmaLaurea indicator label, verbatim.
 * @property {string} unita - '%', 'euro', 'mesi' or 'voto'.
 * @property {boolean} [meglioBasso] - Whether a lower value is better, for the 0-10 score (js/voto.js).
 */

/** @type {IndicatoreChiave[]} Shown in the summary, scored in the Base view, selected at opening. */
export const INDICATORI_CRUSCOTTO = [
  {
    id: 'occupati',
    momento: 'Dopo la laurea',
    titolo: 'Quanti lavorano',
    indagine: 'occupazione',
    categoria: 'Tasso di occupazione',
    indicatore: 'Totale',
    unita: '%',
  },
  {
    id: 'retribuzione',
    momento: 'Dopo la laurea',
    titolo: 'Quanto si guadagna al mese',
    indagine: 'occupazione',
    categoria: 'Retribuzione mensile netta (medie, in euro)',
    indicatore: 'Totale',
    unita: 'euro',
  },
  {
    id: 'primo-lavoro',
    momento: 'Dopo la laurea',
    titolo: 'Quanto si aspetta il primo lavoro',
    indagine: 'occupazione',
    categoria: 'Occupati: tempi di ingresso nel mercato del lavoro (medie, in mesi)',
    indicatore: 'Tempo dalla laurea al reperimento del primo lavoro',
    unita: 'mesi',
    meglioBasso: true,
  },
  {
    id: 'efficacia',
    momento: 'Dopo la laurea',
    titolo: 'Quanto la laurea serve nel lavoro',
    indagine: 'occupazione',
    categoria: 'Efficacia della laurea nel lavoro svolto (%)',
    indicatore: 'Molto efficace/Efficace',
    unita: '%',
  },
  {
    id: 'in-corso',
    momento: 'Durante gli studi',
    titolo: 'Quanti si laureano in corso',
    indagine: 'profilo',
    categoria: 'Regolarità negli studi',
    indicatore: 'In corso',
    unita: '%',
  },
  {
    id: 'rifarebbero',
    momento: 'Durante gli studi',
    titolo: 'Quanti rifarebbero la stessa scelta',
    indagine: 'profilo',
    categoria: "Si iscriverebbero di nuovo all'università? (%)",
    indicatore: "Sì, allo stesso corso dell'Ateneo",
    unita: '%',
  },
];

/**
 * Selected at opening with the six above, but not in the summary.
 *
 * The average length of studies is deliberately absent: a course is a
 * three-year degree, while university and group sheets mix it with two-year
 * and single-cycle degrees, so the years would not be comparable at all.
 *
 * @type {IndicatoreChiave[]}
 */
export const ALTRI_INDICATORI_PRINCIPALI = [
  {
    id: 'soddisfatti',
    momento: 'Durante gli studi',
    titolo: 'Quanti sono decisamente soddisfatti del corso',
    indagine: 'profilo',
    categoria: 'Sono complessivamente soddisfatti del corso di laurea (%)',
    indicatore: 'Decisamente sì',
    unita: '%',
  },
  {
    id: 'voto',
    momento: 'Durante gli studi',
    titolo: 'Con che voto ci si laurea',
    indagine: 'profilo',
    categoria: 'Voto di laurea (%)',
    indicatore: 'Voto di laurea (medie, in 110-mi)',
    unita: 'voto',
  },
];

/**
 * Returns the label of the AlmaLaurea question behind an indicator.
 *
 * @param {IndicatoreChiave} ind - Indicator.
 * @returns {string} Category and indicator, as AlmaLaurea writes them.
 */
export function etichettaUfficiale(ind) {
  return `${ind.categoria} › ${ind.indicatore}`;
}

/**
 * Returns the scale a bar or a dot plot draws a value on.
 *
 * Scales are fixed per unit instead of fitted to the values on screen: a
 * fitted scale turns a one-point difference into half the width of a card and
 * makes it look like a gap. Percentages always run from 0 to 100, and a vote
 * runs over the legal range of an Italian degree mark. Money and durations
 * start at zero and stretch only when a value would not fit.
 *
 * @param {string} unita - Unit of the indicator.
 * @param {number[]} valori - Values that must fit, possibly empty.
 * @returns {{min:number, max:number}} Scale.
 */
export function scalaPer(unita, valori) {
  const massimo = valori.length ? Math.max(...valori) : 0;
  switch (unita) {
    case '%': return { min: 0, max: 100 };
    case 'voto': return { min: 66, max: 110 };
    case 'euro': return { min: 0, max: Math.max(2000, Math.ceil(massimo / 500) * 500) };
    default: return { min: 0, max: Math.max(6, Math.ceil(massimo)) };
  }
}

/**
 * Returns the position of a value on a scale, as a percentage of its length.
 *
 * @param {number} valore - Value to place.
 * @param {{min:number, max:number}} scala - Scale.
 * @returns {number} Position between 0 and 100.
 */
export function posizioneSu(valore, scala) {
  const p = ((valore - scala.min) / (scala.max - scala.min)) * 100;
  return Math.min(100, Math.max(0, p));
}

/**
 * Formats a value with its unit, Italian style.
 *
 * Euros are published by AlmaLaurea as whole numbers and read better with a
 * thousands separator; everything else keeps the single decimal the source
 * provides, exactly as the comparison table shows it. The separator is forced
 * (`useGrouping: 'always'`): Italian locale data leaves four-digit numbers
 * ungrouped by default, so 1530 would print without its point.
 *
 * @param {number} valore - Value from the dataset.
 * @param {string} unita - Unit of the indicator.
 * @returns {string} Formatted value.
 */
export function formattaConUnita(valore, unita) {
  if (unita === 'euro') {
    return `${valore.toLocaleString('it-IT', { maximumFractionDigits: 1, useGrouping: 'always' })} €`;
  }
  const numero = valore.toFixed(1).replace('.', ',');
  switch (unita) {
    case '%': return `${numero}%`;
    case 'mesi': return `${numero} mesi`;
    default: return numero;
  }
}

/**
 * Returns the scale's end labels.
 *
 * @param {{min:number, max:number}} scala - Scale.
 * @param {string} unita - Unit of the indicator.
 * @returns {[string, string]} Labels for the two ends of the scale.
 */
export function etichetteScala(scala, unita) {
  const f = (v) => {
    switch (unita) {
      case '%': return `${v}%`;
      case 'euro': return `${v.toLocaleString('it-IT', { useGrouping: 'always' })} €`;
      case 'mesi': return `${v} mesi`;
      default: return String(v);
    }
  };
  return [f(scala.min), f(scala.max)];
}
