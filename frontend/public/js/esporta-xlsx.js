// esporta-xlsx.js
//
// Writes a real Excel workbook (.xlsx) without any library. An .xlsx file is a
// zip archive of a few XML files; this module writes those files and packs
// them uncompressed ("stored"), which every spreadsheet program reads. A CSV
// would be simpler but breaks in Italian Excel, where the comma is the decimal
// separator; an .xlsx carries numbers as numbers in every locale.
//
// The module touches neither the DOM nor the databases: the caller passes the
// sheets as rows of plain values and gets the file bytes back.

/**
 * @typedef {string|number|null|undefined|{v:(string|number|null), stile:('grassetto'|'corsivo')}} CellaXlsx
 * A cell: a number, a text, nothing, or a value with a style.
 */

/**
 * @typedef {object} FoglioXlsx
 * @property {string} nome - Sheet name (at most 31 characters, no []:*?/\).
 * @property {CellaXlsx[][]} righe - Rows of cells, from the top.
 * @property {number[]} [larghezze] - Column widths, in characters.
 * @property {boolean} [bloccaPrima] - Keep the first row visible while scrolling.
 */

const STILI = { grassetto: 1, corsivo: 2 };

const TIPI_CONTENUTO = {
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
  workbook: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  styles: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',
  sheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
};
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const INTESTAZIONE_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * Escapes a text for XML, dropping the control characters XML 1.0 forbids.
 *
 * @param {string} testo - Text to escape.
 * @returns {string} Escaped text.
 */
function xml(testo) {
  return String(testo)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Returns the letters of a column: 0 -> A, 25 -> Z, 26 -> AA.
 *
 * @param {number} indice - Column index, from 0.
 * @returns {string} Column letters.
 */
export function letteraColonna(indice) {
  let lettere = '';
  for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    lettere = String.fromCharCode(65 + ((n - 1) % 26)) + lettere;
  }
  return lettere;
}

/**
 * Writes one cell, or nothing for an empty one.
 *
 * @param {CellaXlsx} cella - Cell.
 * @param {string} rif - Cell reference, e.g. "B3".
 * @returns {string} XML of the cell.
 */
function xmlCella(cella, rif) {
  const conStile = cella !== null && typeof cella === 'object';
  const valore = conStile ? cella.v : cella;
  const stile = conStile && STILI[cella.stile] ? ` s="${STILI[cella.stile]}"` : '';
  if (valore === null || valore === undefined || valore === '') return '';
  if (typeof valore === 'number') {
    return Number.isFinite(valore) ? `<c r="${rif}"${stile}><v>${valore}</v></c>` : '';
  }
  return `<c r="${rif}" t="inlineStr"${stile}><is><t xml:space="preserve">${xml(valore)}</t></is></c>`;
}

/**
 * Writes the XML of one sheet.
 *
 * @param {FoglioXlsx} foglio - Sheet.
 * @returns {string} Worksheet XML.
 */
function xmlFoglio(foglio) {
  const vista = foglio.bloccaPrima
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';
  const colonne = foglio.larghezze?.length
    ? `<cols>${foglio.larghezze.map((l, i) => `<col min="${i + 1}" max="${i + 1}" width="${l}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const righe = foglio.righe.map((riga, r) =>
    `<row r="${r + 1}">${riga.map((c, i) => xmlCella(c, `${letteraColonna(i)}${r + 1}`)).join('')}</row>`).join('');
  return `${INTESTAZIONE_XML}<worksheet xmlns="${NS_MAIN}">${vista}${colonne}<sheetData>${righe}</sheetData></worksheet>`;
}

/**
 * Returns a valid, unique sheet name.
 *
 * @param {string} nome - Wanted name.
 * @param {Set<string>} usati - Names already taken, lower case.
 * @returns {string} Sheet name.
 */
function nomeFoglio(nome, usati) {
  const base = String(nome).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Foglio';
  let scelto = base;
  for (let n = 2; usati.has(scelto.toLowerCase()); n++) scelto = `${base.slice(0, 28)} ${n}`;
  usati.add(scelto.toLowerCase());
  return scelto;
}

// CRC-32 (the zip checksum), with its table built once.
const TABELLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/**
 * Computes the CRC-32 of some bytes.
 *
 * @param {Uint8Array} dati - Bytes.
 * @returns {number} Checksum, unsigned.
 */
export function crc32(dati) {
  let c = 0xFFFFFFFF;
  for (const b of dati) c = TABELLA_CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Packs files into an uncompressed zip archive.
 *
 * @param {{nome:string, dati:Uint8Array}[]} file - Files, in order.
 * @returns {Uint8Array} Zip bytes.
 */
function zip(file) {
  const codifica = new TextEncoder();
  const locali = [];
  const centrali = [];
  let posizione = 0;
  for (const { nome, dati } of file) {
    const n = codifica.encode(nome);
    const crc = crc32(dati);
    // Date 1980-01-01, time 00:00: a fixed stamp keeps the output reproducible.
    const campi = (firma, lunghezza) => {
      const b = new DataView(new ArrayBuffer(lunghezza));
      b.setUint32(0, firma, true);
      return b;
    };
    const locale = campi(0x04034b50, 30);
    locale.setUint16(4, 20, true);
    locale.setUint16(10, 0, true);
    locale.setUint16(12, 0x21, true);
    locale.setUint32(14, crc, true);
    locale.setUint32(18, dati.length, true);
    locale.setUint32(22, dati.length, true);
    locale.setUint16(26, n.length, true);
    locali.push(new Uint8Array(locale.buffer), n, dati);

    const centrale = campi(0x02014b50, 46);
    centrale.setUint16(4, 20, true);
    centrale.setUint16(6, 20, true);
    centrale.setUint16(14, 0x21, true);
    centrale.setUint32(16, crc, true);
    centrale.setUint32(20, dati.length, true);
    centrale.setUint32(24, dati.length, true);
    centrale.setUint16(28, n.length, true);
    centrale.setUint32(42, posizione, true);
    centrali.push(new Uint8Array(centrale.buffer), n);
    posizione += 30 + n.length + dati.length;
  }
  const dimensioneCentrale = centrali.reduce((s, b) => s + b.length, 0);
  const fine = new DataView(new ArrayBuffer(22));
  fine.setUint32(0, 0x06054b50, true);
  fine.setUint16(8, file.length, true);
  fine.setUint16(10, file.length, true);
  fine.setUint32(12, dimensioneCentrale, true);
  fine.setUint32(16, posizione, true);

  const parti = [...locali, ...centrali, new Uint8Array(fine.buffer)];
  const uscita = new Uint8Array(parti.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of parti) { uscita.set(b, p); p += b.length; }
  return uscita;
}

/**
 * Builds an .xlsx workbook.
 *
 * @param {FoglioXlsx[]} fogli - Sheets, in tab order (at least one).
 * @returns {Uint8Array} File bytes, ready for a Blob.
 */
export function creaXlsx(fogli) {
  if (!fogli.length) throw new Error('Un file Excel ha almeno un foglio.');
  const usati = new Set();
  const nomi = fogli.map((f) => nomeFoglio(f.nome, usati));
  const parti = {
    '[Content_Types].xml': `${INTESTAZIONE_XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="${TIPI_CONTENUTO.rels}"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="${TIPI_CONTENUTO.workbook}"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="${TIPI_CONTENUTO.styles}"/>` +
      fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${TIPI_CONTENUTO.sheet}"/>`).join('') +
      '</Types>',
    '_rels/.rels': `${INTESTAZIONE_XML}<Relationships xmlns="${NS_PKG_REL}">` +
      `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${INTESTAZIONE_XML}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
      nomi.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': `${INTESTAZIONE_XML}<Relationships xmlns="${NS_PKG_REL}">` +
      fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${fogli.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`,
    // Three cell styles: 0 plain, 1 bold (headers), 2 italic (STILI above).
    'xl/styles.xml': `${INTESTAZIONE_XML}<styleSheet xmlns="${NS_MAIN}">` +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><i/><sz val="11"/><color rgb="FF5F6B6A"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  };
  fogli.forEach((f, i) => { parti[`xl/worksheets/sheet${i + 1}.xml`] = xmlFoglio(f); });
  const codifica = new TextEncoder();
  return zip(Object.entries(parti).map(([nome, testo]) => ({ nome, dati: codifica.encode(testo) })));
}
