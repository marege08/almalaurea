/**
 * processData.js
 *
 * Traduce UNA riga del database (campi `valore` e `nota`) nella stringa
 * pronta per la cella della tabella di confronto.
 *
 * Regola decisa in Fase 1 (fase1-resoconto.md, §2.2):
 *  - valore è un numero  -> si mostra il numero, formattato con la virgola
 *    italiana, SENZA ripetere l'unità di misura (è già nell'intestazione
 *    di colonna/categoria, non va ripetuta riga per riga).
 *  - valore è null       -> si mostra SOLO la nota tradotta (mai il
 *    simbolo grezzo *, -, /, mai uno "0" inventato).
 *
 * Questa funzione non arrotonda né ricalcola nulla: il numero arriva già
 * arrotondato alla prima decimale da AlmaLaurea (vedi fase0-resoconto.md,
 * §3.2). Si limita a formattarlo per la UI.
 */

const TRADUZIONE_NOTE = {
  oscurato_meno_di_5: "Campione piccolo",
  zero_casi: "0 casi",
  non_disponibile: "Dato non disponibile",
};

/**
 * @param {{valore: number|null, nota: string|null}} riga - una riga letta da sql.js
 * @returns {string} il testo pronto da inserire nella cella
 */
function processData({ valore, nota }) {
  // Attenzione: 0 è un valore legittimo (es. "0% laureati che hanno
  // lavorato all'estero"). Per questo il controllo è "!== null", non un
  // semplice "if (valore)" — che tratterebbe 0 come falso e lo
  // confonderebbe con un dato assente.
  if (valore !== null && valore !== undefined) {
    return valore.toFixed(1).replace(".", ",");
  }

  if (nota && TRADUZIONE_NOTE[nota]) {
    return TRADUZIONE_NOTE[nota];
  }

  // Caso non previsto: una nota che non conosciamo. Il dataset attuale
  // (93/93 schede) non ne genera nessuna oltre alle tre elencate sopra,
  // ma il parser di Fase 0 prevede anche un quarto valore — "non_riconosciuto"
  // — per formati inattesi che potrebbero comparire quando si aggiungeranno
  // i corsi o la serie storica. Non è ancora tradotto per l'utente.
  // Meglio un avviso visibile in console che un buco silenzioso in tabella:
  // l'integrità del dato vale anche per i casi che NON dovrebbero capitare.
  console.warn("processData: nota non gestita ->", nota);
  return "Dato non disponibile";
}

// --- Verifica rapida (incolla questo file in un <script type="module"> e
//     prova le righe qui sotto in console, oppure usa un test runner) ---
//
// processData({ valore: 38.5, nota: null });                   // -> "38,5"
// processData({ valore: 0, nota: null });                      // -> "0,0"
// processData({ valore: null, nota: "oscurato_meno_di_5" });   // -> "Campione piccolo"
// processData({ valore: null, nota: "zero_casi" });            // -> "0 casi"
// processData({ valore: null, nota: "non_disponibile" });      // -> "Dato non disponibile"
// processData({ valore: null, nota: "qualcosa_di_strano" });   // -> warning in console + "Dato non disponibile"

export { processData, TRADUZIONE_NOTE };
