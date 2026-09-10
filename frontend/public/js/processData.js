/**
 * processData.js
 *
 * Converts one database row (`valore` and `nota`) into table-cell text.
 *
 * Numeric values are displayed with the Italian decimal comma without
 * repeating the unit, which already appears in the column or category header.
 * Null values display only the translated note; raw `*`, `-`, and `/` symbols
 * are never exposed, and zero is never invented.
 *
 * The function does not round or recalculate values: AlmaLaurea already
 * provides them rounded to one decimal place. It only formats them for the UI.
 */

const TRADUZIONE_NOTE = {
  oscurato_meno_di_5: "Campione piccolo",
  zero_casi: "0 casi",
  non_disponibile: "Dato non disponibile",
};

/**
 * Formats a database row for display in a table cell.
 *
 * @param {{valore: number|null, nota: string|null}} riga - A row read by sql.js.
 * @returns {string} Text ready for insertion into a table cell.
 *
 * @example
 * processData({ valore: 38.5, nota: null })                  -> "38,5"
 * processData({ valore: 0, nota: null })                     -> "0,0"
 * processData({ valore: null, nota: "oscurato_meno_di_5" })  -> "Campione piccolo"
 * processData({ valore: null, nota: "zero_casi" })           -> "0 casi"
 * processData({ valore: null, nota: "non_disponibile" })     -> "Dato non disponibile"
 * processData({ valore: null, nota: "qualcosa_di_strano" })  -> console warning, then "Dato non disponibile"
 */
function processData({ valore, nota }) {
  // Zero is a legitimate value, such as 0% of graduates who worked abroad.
  // An explicit null/undefined check prevents zero from being treated as absent.
  if (valore !== null && valore !== undefined) {
    return valore.toFixed(1).replace(".", ",");
  }

  if (nota && TRADUZIONE_NOTE[nota]) {
    return TRADUZIONE_NOTE[nota];
  }

  // The current dataset (93/93 sheets) produces only the three notes above.
  // The parser also allows a fourth value, "non_riconosciuto", for
  // unexpected formats that may appear when courses or historical data are
  // added; it is not yet translated for users. A console warning keeps this
  // case visible instead of silently leaving a gap in the table.
  console.warn("processData: nota non gestita ->", nota);
  return "Dato non disponibile";
}

export { processData, TRADUZIONE_NOTE };
