/**
 * nomi-gruppo.js
 *
 * Corrispondenza codice gruppo disciplinare -> nome, presa dal menu a
 * tendina reale del sito AlmaLaurea (non da memoria): 15 codici,
 * verificati 1:1 contro i codici realmente presenti in almalaurea.sqlite
 * (0 mancanti, 0 estranei).
 *
 * E' la classificazione adottata dal MUR a partire dal 2020 — diversa
 * dalla classificazione "storica" a 15 gruppi usata in anni precedenti
 * da AlmaLaurea: i nomi vanno presi da qui, non da memoria.
 */

export const NOMI_GRUPPO = {
  "1": "Educazione e Formazione",
  "10": "Informatica e Tecnologie ICT",
  "11": "Architettura e Ingegneria civile",
  "12": "Ingegneria industriale e dell'informazione",
  "13": "Agrario-Forestale e Veterinario",
  "14": "Medico-Sanitario e Farmaceutico",
  "15": "Scienze motorie e sportive",
  "2": "Arte e Design",
  "3": "Letterario-Umanistico",
  "4": "Linguistico",
  "5": "Politico-Sociale e Comunicazione",
  "6": "Psicologico",
  "7": "Economico",
  "8": "Giuridico",
  "9": "Scientifico"
};
