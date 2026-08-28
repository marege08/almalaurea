/**
 * config-filtri.js
 *
 * Mappatura reale indicatori AlmaLaurea -> macro-categorie, generata
 * direttamente da almalaurea.sqlite (query DISTINCT sezione, categoria,
 * indicatore), non scritta a mano: se il dataset cambia, questo file si
 * rigenera con lo stesso script, non si modifica a mano riga per riga.
 *
 * UNITA' DI FILTRO = "domanda", non il singolo indicatore grezzo:
 *  - se `categoria` non e' vuota, la domanda e' (sezione, categoria) e
 *    `indicatori` elenca le opzioni di risposta da mostrare come
 *    sotto-colonne (es. "Decisamente si'/no" hanno senso solo insieme
 *    alla domanda a cui appartengono — da soli sono ambigui: la stessa
 *    coppia di risposte compare in 24 domande diverse nel dataset).
 *  - se `categoria` e' vuota (''), l'indicatore e' gia' completo da solo
 *    (es. "Dottorato di ricerca"): e' la sua stessa "domanda", un
 *    gruppo da un solo elemento.
 *
 * La macro-categoria si ricava dalla sezione ufficiale AlmaLaurea
 * (fase1-resoconto.md, §3.2) — non e' un giudizio indicatore per
 * indicatore, e' una semplice tabella sezione -> macro-categoria.
 *
 * Per il rendering: dato un elemento di CONFIG_FILTRI,
 *  - se categoria != '' -> query: WHERE categoria = elemento.categoria
 *  - se categoria == '' -> query: WHERE categoria = '' AND indicatore = elemento.indicatori[0]
 * (la categoria, quando presente, e' di per se' univoca nel dataset:
 * verificato che nessuna categoria si ripete in sezioni diverse).
 *
 * Nota su una stranezza ereditata dai dati originali, NON corretta a
 * mano: nella sezione 1 la categoria "Eta' alla laurea (%)" include
 * anche "Cittadini stranieri (%)" come indicatore. E' cosi' nella
 * struttura ufficiale della scheda AlmaLaurea (non e' un bug del
 * parser di Fase 0): si lascia com'e', per fedelta' alla fonte.
 */

export const CONFIG_FILTRI = {
  "Successo e Percorso": [
    {
      "id": "hanno_precedenti_esperienze_universitarie",
      "label": "Hanno precedenti esperienze universitarie (%)",
      "sezione": "4. RIUSCITA NEGLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Hanno precedenti esperienze universitarie (%)"
      ]
    },
    {
      "id": "nessuna_precedente_esperienza_universitaria",
      "label": "Nessuna precedente esperienza universitaria",
      "sezione": "4. RIUSCITA NEGLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Nessuna precedente esperienza universitaria"
      ]
    },
    {
      "id": "non_portate_a_termine",
      "label": "Non portate a termine",
      "sezione": "4. RIUSCITA NEGLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Non portate a termine"
      ]
    },
    {
      "id": "portate_a_termine",
      "label": "Portate a termine",
      "sezione": "4. RIUSCITA NEGLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Portate a termine"
      ]
    },
    {
      "id": "eta_all_immatricolazione",
      "label": "Età all'immatricolazione (%)",
      "sezione": "4. RIUSCITA NEGLI STUDI UNIVERSITARI",
      "categoria": "Età all'immatricolazione (%)",
      "indicatori": [
        "2 o più anni di ritardo",
        "Punteggio degli esami (medie, in 30-mi)",
        "Regolare o 1 anno di ritardo"
      ]
    },
    {
      "id": "motivazione_principale_nella_scelta_di_un_corso_completament",
      "label": "Motivazione principale nella scelta di un corso completamente in teledidattica(per 100 con titolo in Atenei telematici)",
      "sezione": "4. RIUSCITA NEGLI STUDI UNIVERSITARI",
      "categoria": "Motivazione principale nella scelta di un corso completamente in teledidattica(per 100 con titolo in Atenei telematici)",
      "indicatori": [
        "Disponibilità, in qualsiasi momento, del materiale didattico online",
        "Possibilità di mettersi in contatto con i docenti più facilmente",
        "Possibilità di organizzare meglio il proprio tempo",
        "Possibilità di seguire le lezioni online senza la necessità di raggiungere la sede"
      ]
    },
    {
      "id": "motivazioni_molto_importanti_nella_scelta_del_corso_di_laure",
      "label": "Motivazioni molto importanti nella scelta del corso di laurea (%)",
      "sezione": "4. RIUSCITA NEGLI STUDI UNIVERSITARI",
      "categoria": "Motivazioni molto importanti nella scelta del corso di laurea (%)",
      "indicatori": [
        "Fattori prevalentemente culturali",
        "Fattori prevalentemente professionalizzanti",
        "Fattori sia culturali sia professionalizzanti",
        "Né gli uni né gli altri"
      ]
    },
    {
      "id": "regolarita_negli_studi",
      "label": "Regolarità negli studi",
      "sezione": "4. RIUSCITA NEGLI STUDI UNIVERSITARI",
      "categoria": "Regolarità negli studi",
      "indicatori": [
        "1° anno fuori corso",
        "2° anno fuori corso",
        "3° anno fuori corso",
        "4° anno fuori corso",
        "5° anno fuori corso e oltre",
        "Durata degli studi (medie, in anni)",
        "In corso",
        "Indice di ritardo (rapporto fra ritardo e durata normale del corso)",
        "Ritardo alla laurea (medie, in anni)"
      ]
    },
    {
      "id": "voto_di_laurea",
      "label": "Voto di laurea (%)",
      "sezione": "4. RIUSCITA NEGLI STUDI UNIVERSITARI",
      "categoria": "Voto di laurea (%)",
      "indicatori": [
        "110 e lode",
        "Voto di laurea (medie, in 110-mi)",
        "da 100 a 104",
        "da 105 a 110",
        "meno di 100"
      ]
    },
    {
      "id": "altre_attivita_di_qualificazione_professionale",
      "label": "Altre attività di qualificazione professionale",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Altre attività di qualificazione professionale"
      ]
    },
    {
      "id": "altro_tipo_di_master_o_corso_di_perfezionamento",
      "label": "Altro tipo di master o corso di perfezionamento",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Altro tipo di master o corso di perfezionamento"
      ]
    },
    {
      "id": "altro_titolo_equiparato_alla_laurea",
      "label": "Altro titolo equiparato alla laurea",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Altro titolo equiparato alla laurea"
      ]
    },
    {
      "id": "attivita_sostenuta_da_borsa_o_assegno_di_studio",
      "label": "Attività sostenuta da borsa o assegno di studio",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Attività sostenuta da borsa o assegno di studio"
      ]
    },
    {
      "id": "dottorato_di_ricerca",
      "label": "Dottorato di ricerca",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Dottorato di ricerca"
      ]
    },
    {
      "id": "intendono_proseguire_gli_studi_dopo_il_conseguimento_del_tit",
      "label": "Intendono proseguire gli studi dopo il conseguimento del titolo (%)",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Intendono proseguire gli studi dopo il conseguimento del titolo (%)"
      ]
    },
    {
      "id": "laurea_di_primo_livello",
      "label": "Laurea di primo livello",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Laurea di primo livello"
      ]
    },
    {
      "id": "laurea_magistrale_a_ciclo_unico",
      "label": "Laurea magistrale a ciclo unico",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Laurea magistrale a ciclo unico"
      ]
    },
    {
      "id": "laurea_magistrale_biennale",
      "label": "Laurea magistrale biennale",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Laurea magistrale biennale"
      ]
    },
    {
      "id": "master_universitario",
      "label": "Master universitario",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Master universitario"
      ]
    },
    {
      "id": "non_intendono_proseguire",
      "label": "Non intendono proseguire",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Non intendono proseguire"
      ]
    },
    {
      "id": "scuola_di_specializzazione_post_laurea",
      "label": "Scuola di specializzazione post-laurea",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Scuola di specializzazione post-laurea"
      ]
    },
    {
      "id": "tirocinio_praticantato",
      "label": "Tirocinio, praticantato",
      "sezione": "9. PROSPETTIVE DI STUDIO",
      "categoria": "",
      "indicatori": [
        "Tirocinio, praticantato"
      ]
    }
  ],
  "Lavoro e Futuro": [
    {
      "id": "aspetti_ritenuti_rilevanti_nella_ricerca_del_lavoro_decisame",
      "label": "Aspetti ritenuti rilevanti nella ricerca del lavoro: decisamente sì (%)",
      "sezione": "10. PROSPETTIVE DI LAVORO",
      "categoria": "Aspetti ritenuti rilevanti nella ricerca del lavoro: decisamente sì (%)",
      "indicatori": [
        "Acquisizione di professionalità",
        "Coerenza con gli studi",
        "Coinvolgimento e partecipazione all’attività lavorativa e ai processi decisionali",
        "Flessibilità dell’orario di lavoro",
        "Indipendenza o autonomia",
        "Luogo di lavoro (ubicazione, caratteristiche fisiche dell’ambiente di lavoro)",
        "Opportunità di contatti con l'estero",
        "Possibilità di carriera",
        "Possibilità di guadagno",
        "Possibilità di utilizzare al meglio le competenze acquisite",
        "Prestigio ricevuto dal lavoro",
        "Rapporti con i colleghi sul luogo di lavoro",
        "Rispondenza agli interessi culturali",
        "Stabilità/sicurezza del posto di lavoro",
        "Tempo libero",
        "Utilità sociale del lavoro"
      ]
    },
    {
      "id": "contratto",
      "label": "CONTRATTO",
      "sezione": "10. PROSPETTIVE DI LAVORO",
      "categoria": "CONTRATTO",
      "indicatori": [
        "A tempo determinato",
        "Apprendistato",
        "Autonomo/in conto proprio",
        "Somministrazione di lavoro (ex interinale)",
        "Stage",
        "Tempo indeterminato"
      ]
    },
    {
      "id": "disponibilita_a_lavorare_nelle_seguenti_aree_geografiche_dec",
      "label": "Disponibilità a lavorare nelle seguenti aree geografiche: decisamente sì (%)",
      "sezione": "10. PROSPETTIVE DI LAVORO",
      "categoria": "Disponibilità a lavorare nelle seguenti aree geografiche: decisamente sì (%)",
      "indicatori": [
        "Italia centrale",
        "Italia meridionale",
        "Italia settentrionale",
        "Provincia degli studi",
        "Provincia di residenza",
        "Regione degli studi",
        "Stato europeo",
        "Stato extraeuropeo"
      ]
    },
    {
      "id": "disponibilita_ad_accettare_lavori_non_attinenti_al_proprio_t",
      "label": "Disponibilità ad accettare lavori non attinenti al proprio titolo di studio (%)",
      "sezione": "10. PROSPETTIVE DI LAVORO",
      "categoria": "Disponibilità ad accettare lavori non attinenti al proprio titolo di studio (%)",
      "indicatori": [
        "No",
        "Sì, come soluzione transitoria",
        "Sì, comunque"
      ]
    },
    {
      "id": "disponibilita_ad_effettuare_trasferte_di_lavoro",
      "label": "Disponibilità ad effettuare trasferte di lavoro (%)",
      "sezione": "10. PROSPETTIVE DI LAVORO",
      "categoria": "Disponibilità ad effettuare trasferte di lavoro (%)",
      "indicatori": [
        "Non disponibili a trasferte",
        "Sì, anche con trasferimenti di residenza",
        "Sì, anche frequenti (senza cambi di residenza)",
        "Sì, ma solo in numero limitato"
      ]
    },
    {
      "id": "orario_modalita_lavorativa",
      "label": "ORARIO/MODALITA' LAVORATIVA",
      "sezione": "10. PROSPETTIVE DI LAVORO",
      "categoria": "ORARIO/MODALITA' LAVORATIVA",
      "indicatori": [
        "Part-time",
        "Telelavoro o smart-working",
        "Tempo pieno"
      ]
    },
    {
      "id": "sono_interessati_a_lavorare_nei_seguenti_settori_decisamente",
      "label": "Sono interessati a lavorare nei seguenti settori: decisamente sì (%)",
      "sezione": "10. PROSPETTIVE DI LAVORO",
      "categoria": "Sono interessati a lavorare nei seguenti settori: decisamente sì (%)",
      "indicatori": [
        "Privato (compreso l'avvio di un'attività autonoma/in conto proprio)",
        "Pubblico"
      ]
    },
    {
      "id": "altre_esperienze_di_lavoro_con_continuita_a_tempo_pieno",
      "label": "Altre esperienze di lavoro con continuità a tempo pieno",
      "sezione": "6. LAVORO DURANTE GLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Altre esperienze di lavoro con continuità a tempo pieno"
      ]
    },
    {
      "id": "hanno_avuto_esperienze_di_lavoro",
      "label": "Hanno avuto esperienze di lavoro (%)",
      "sezione": "6. LAVORO DURANTE GLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Hanno avuto esperienze di lavoro (%)"
      ]
    },
    {
      "id": "lavoratori_studenti",
      "label": "Lavoratori-studenti",
      "sezione": "6. LAVORO DURANTE GLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Lavoratori-studenti"
      ]
    },
    {
      "id": "lavoro_a_tempo_parziale",
      "label": "Lavoro a tempo parziale",
      "sezione": "6. LAVORO DURANTE GLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Lavoro a tempo parziale"
      ]
    },
    {
      "id": "lavoro_occasionale_saltuario_stagionale",
      "label": "Lavoro occasionale, saltuario, stagionale",
      "sezione": "6. LAVORO DURANTE GLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Lavoro occasionale, saltuario, stagionale"
      ]
    },
    {
      "id": "nessuna_esperienza_di_lavoro",
      "label": "Nessuna esperienza di lavoro",
      "sezione": "6. LAVORO DURANTE GLI STUDI UNIVERSITARI",
      "categoria": "",
      "indicatori": [
        "Nessuna esperienza di lavoro"
      ]
    },
    {
      "id": "hanno_ritenuto_difficile_conciliare_studio_e_lavoro_per_100",
      "label": "Hanno ritenuto difficile conciliare studio e lavoro(per 100 che hanno avuto esperienze di lavoro con continuità a tempo pieno o parziale)",
      "sezione": "6. LAVORO DURANTE GLI STUDI UNIVERSITARI",
      "categoria": "Hanno ritenuto difficile conciliare studio e lavoro(per 100 che hanno avuto esperienze di lavoro con continuità a tempo pieno o parziale)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Lavoro coerente con gli studi(per 100 che hanno avuto esperienze di lavoro)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "hanno_ritenuto_adeguata_la_supervisione_della_prova_finale_p",
      "label": "Hanno ritenuto adeguata la supervisione della prova finale(per 100 per cui era prevista la supervisione della prova finale)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Hanno ritenuto adeguata la supervisione della prova finale(per 100 per cui era prevista la supervisione della prova finale)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "hanno_ritenuto_adeguato_il_materiale_didattico_indicato_o_fo",
      "label": "Hanno ritenuto adeguato il materiale didattico (indicato o fornito) per la preparazione degli esami (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Hanno ritenuto adeguato il materiale didattico (indicato o fornito) per la preparazione degli esami (%)",
      "indicatori": [
        "Mai o quasi mai",
        "Per meno della metà degli esami",
        "Per più della metà degli esami",
        "Sempre o quasi sempre"
      ]
    },
    {
      "id": "hanno_ritenuto_il_carico_di_studio_degli_insegnamenti_adegua",
      "label": "Hanno ritenuto il carico di studio degli insegnamenti adeguato alla durata del corso di studio (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Hanno ritenuto il carico di studio degli insegnamenti adeguato alla durata del corso di studio (%)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Era prevista la supervisione della prova finale (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "hanno_ritenuto_l_organizzazione_degli_esami_appelli_orari_in",
      "label": "Hanno ritenuto l'organizzazione degli esami (appelli, orari, informazioni, prenotazioni, ...) soddisfacente (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Hanno ritenuto l'organizzazione degli esami (appelli, orari, informazioni, prenotazioni, ...) soddisfacente (%)",
      "indicatori": [
        "Mai o quasi mai",
        "Per meno della metà degli esami",
        "Per più della metà degli esami",
        "Sempre o quasi sempre"
      ]
    },
    {
      "id": "i_risultati_degli_esami_hanno_rispecchiato_l_effettiva_prepa",
      "label": "I risultati degli esami hanno rispecchiato l'effettiva preparazione (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "I risultati degli esami hanno rispecchiato l'effettiva preparazione (%)",
      "indicatori": [
        "Mai o quasi mai",
        "Per meno della metà degli esami",
        "Per più della metà degli esami",
        "Sempre o quasi sempre"
      ]
    },
    {
      "id": "si_iscriverebbero_di_nuovo_all_universita",
      "label": "Si iscriverebbero di nuovo all'università? (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Si iscriverebbero di nuovo all'università? (%)",
      "indicatori": [
        "Non si iscriverebbero più all'università",
        "Sì, allo stesso corso dell'Ateneo",
        "Sì, allo stesso corso ma in un altro Ateneo",
        "Sì, ma ad un altro corso dell'Ateneo",
        "Sì, ma ad un altro corso e in un altro Ateneo"
      ]
    },
    {
      "id": "sono_complessivamente_soddisfatti_del_corso_di_laurea",
      "label": "Sono complessivamente soddisfatti del corso di laurea (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono complessivamente soddisfatti del corso di laurea (%)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_complessivamente_soddisfatti_delle_attivita_didattiche",
      "label": "Sono complessivamente soddisfatti delle attività didattiche (lezioni, esercitazioni, simulazioni, ...) (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono complessivamente soddisfatti delle attività didattiche (lezioni, esercitazioni, simulazioni, ...) (%)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_corsi_integrativi_laboratori_online_per",
      "label": "Sono soddisfatti dei corsi integrativi/laboratori online(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei corsi integrativi/laboratori online(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno avuto accesso a software/virtual machine, … (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_rapporti_con_gli_studenti",
      "label": "Sono soddisfatti dei rapporti con gli studenti (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei rapporti con gli studenti (%)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno utilizzato le aule (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_rapporti_con_i_collaboratori_dei_docent",
      "label": "Sono soddisfatti dei rapporti con i collaboratori dei docenti (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei rapporti con i collaboratori dei docenti (%)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no",
        "Sono stati seguiti da un tutor durante il corso di laurea (%)"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_rapporti_con_i_docenti_in_generale",
      "label": "Sono soddisfatti dei rapporti con i docenti in generale (%)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei rapporti con i docenti in generale (%)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_servizi_amministrativi_online_per_100_f",
      "label": "Sono soddisfatti dei servizi amministrativi online(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei servizi amministrativi online(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_servizi_bibliotecari_online_per_100_fru",
      "label": "Sono soddisfatti dei servizi bibliotecari online(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei servizi bibliotecari online(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno utilizzato le attrezzature per le altre attività didattiche (laboratori, attività pratiche, ...) (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_servizi_delle_segreterie_studenti_per_1",
      "label": "Sono soddisfatti dei servizi delle segreterie studenti(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei servizi delle segreterie studenti(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno usufruito dei servizi amministrativi online (modulistica, iscrizioni, tasse, ...) (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_servizi_di_forum_spazi_di_condivisione",
      "label": "Sono soddisfatti dei servizi di forum/spazi di condivisione on line con i docenti(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei servizi di forum/spazi di condivisione on line con i docenti(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno utilizzato gli spazi dedicati allo studio individuale (%)",
        "Non li hanno utilizzati in quanto non presenti",
        "Non li hanno utilizzati nonostante fossero presenti",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_servizi_di_orientamento_allo_studio_pos",
      "label": "Sono soddisfatti dei servizi di orientamento allo studio post-laurea(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei servizi di orientamento allo studio post-laurea(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno usufruito di iniziative formative di orientamento al lavoro (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_servizi_di_prenotazione_online_di_strut",
      "label": "Sono soddisfatti dei servizi di prenotazione online di strutture fisiche(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei servizi di prenotazione online di strutture fisiche(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno usufruito dei servizi di orientamento allo studio post-laurea (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dei_servizi_di_sostegno_alla_ricerca_del_la",
      "label": "Sono soddisfatti dei servizi di sostegno alla ricerca del lavoro(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dei servizi di sostegno alla ricerca del lavoro(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno usufruito dell'ufficio/servizi job placement (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_del_rapporto_con_il_tutor_per_100_che_sono",
      "label": "Sono soddisfatti del rapporto con il tutor(per 100 che sono stati seguiti da un tutor)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti del rapporto con il tutor(per 100 che sono stati seguiti da un tutor)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dell_organizzazione_dell_ufficio_servizi_jo",
      "label": "Sono soddisfatti dell'organizzazione dell'ufficio/servizi job placement(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti dell'organizzazione dell'ufficio/servizi job placement(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno usufruito dei servizi delle segreterie studenti (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_della_fruizione_dei_software_virtual_machin",
      "label": "Sono soddisfatti della fruizione dei software/virtual machine, ...(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti della fruizione dei software/virtual machine, ...(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno usufruito dei servizi di forum/spazi di condivisione on line con i docenti (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_delle_iniziative_formative_di_orientamento",
      "label": "Sono soddisfatti delle iniziative formative di orientamento al lavoro(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Sono soddisfatti delle iniziative formative di orientamento al lavoro(per 100 fruitori)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Hanno usufruito dei servizi di sostegno alla ricerca del lavoro (%)",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "valutazione_degli_spazi_dedicati_allo_studio_individuale_per",
      "label": "Valutazione degli spazi dedicati allo studio individuale(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Valutazione degli spazi dedicati allo studio individuale(per 100 fruitori)",
      "indicatori": [
        "Adeguati",
        "Hanno utilizzato i servizi di prenotazione online di strutture fisiche (%)",
        "Inadeguati"
      ]
    },
    {
      "id": "valutazione_dei_servizi_di_biblioteca_prestito_consultazione",
      "label": "Valutazione dei servizi di biblioteca (prestito/consultazione, orari di apertura, ...)(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Valutazione dei servizi di biblioteca (prestito/consultazione, orari di apertura, ...)(per 100 fruitori)",
      "indicatori": [
        "Abbastanza negativa",
        "Abbastanza positiva",
        "Decisamente negativa",
        "Decisamente positiva",
        "Hanno utilizzato i servizi bibliotecari online (%)"
      ]
    },
    {
      "id": "valutazione_delle_attrezzature_per_le_altre_attivita_didatti",
      "label": "Valutazione delle attrezzature per le altre attività didattiche (laboratori, attività pratiche, …)(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Valutazione delle attrezzature per le altre attività didattiche (laboratori, attività pratiche, …)(per 100 fruitori)",
      "indicatori": [
        "Hanno usufruito dei corsi integrativi/laboratori online (%)",
        "Mai adeguate",
        "Raramente adeguate",
        "Sempre o quasi sempre adeguate",
        "Spesso adeguate"
      ]
    },
    {
      "id": "valutazione_delle_aule_per_100_fruitori",
      "label": "Valutazione delle aule(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Valutazione delle aule(per 100 fruitori)",
      "indicatori": [
        "Hanno utilizzato le postazioni informatiche (%)",
        "Mai adeguate",
        "Non le hanno utilizzate in quanto non presenti",
        "Non le hanno utilizzate nonostante fossero presenti",
        "Raramente adeguate",
        "Sempre o quasi sempre adeguate",
        "Spesso adeguate"
      ]
    },
    {
      "id": "valutazione_delle_postazioni_informatiche_per_100_fruitori",
      "label": "Valutazione delle postazioni informatiche(per 100 fruitori)",
      "sezione": "7. GIUDIZI SULL´ESPERIENZA UNIVERSITARIA",
      "categoria": "Valutazione delle postazioni informatiche(per 100 fruitori)",
      "indicatori": [
        "Hanno utilizzato i servizi di biblioteca (prestito/consultazione, orari di apertura, ...) (%)",
        "In numero adeguato",
        "In numero inadeguato"
      ]
    }
  ],
  "Competenze e Ambiente": [
    {
      "id": "hanno_alloggiato_a_meno_di_un_ora_di_viaggio_dalla_sede_degl",
      "label": "Hanno alloggiato a meno di un'ora di viaggio dalla sede degli studi (%)",
      "sezione": "5. CONDIZIONI DI STUDIO",
      "categoria": "Hanno alloggiato a meno di un'ora di viaggio dalla sede degli studi (%)",
      "indicatori": [
        "Meno del 50%",
        "Più del 50% della durata degli studi"
      ]
    },
    {
      "id": "hanno_frequentato_regolarmente",
      "label": "Hanno frequentato regolarmente (%)",
      "sezione": "5. CONDIZIONI DI STUDIO",
      "categoria": "Hanno frequentato regolarmente (%)",
      "indicatori": [
        "1 o più esami all'estero convalidati(per 100 che hanno svolto esperienze di studio all'estero riconosciute dal corso che stanno concludendo)",
        "Altra esperienza riconosciuta dal corso di studio",
        "Con Erasmus o altro programma dell'Unione Europea",
        "Hanno preparato all'estero una parte significativa della tesi(per 100 che hanno svolto esperienze di studio all'estero riconosciute dal corso che stanno concludendo)",
        "Hanno svolto periodi di studio all’estero durante il corso di studio (%)",
        "Hanno svolto periodi di studio all’estero riconosciuti dal corso di studio",
        "Hanno usufruito del servizio di borse di studio offerto dall'organismo per il Diritto allo Studio",
        "Meno del 25%",
        "Più del 75% degli insegnamenti previsti",
        "Tra il 25% e il 50%",
        "Tra il 50% e il 75%"
      ]
    },
    {
      "id": "sono_soddisfatti_del_supporto_fornito_dall_universita_per_il",
      "label": "Sono soddisfatti del supporto fornito dall'Università per il tirocinio curriculare(per 100 che hanno svolto tirocini organizzati dal corso che stanno concludendo)",
      "sezione": "5. CONDIZIONI DI STUDIO",
      "categoria": "Sono soddisfatti del supporto fornito dall'Università per il tirocinio curriculare(per 100 che hanno svolto tirocini organizzati dal corso che stanno concludendo)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_del_supporto_fornito_dall_universita_per_l",
      "label": "Sono soddisfatti del supporto fornito dall'Università per l'esperienza di studio all'estero(per 100 che hanno svolto esperienze di studio all'estero riconosciute dal corso che stanno concludendo)",
      "sezione": "5. CONDIZIONI DI STUDIO",
      "categoria": "Sono soddisfatti del supporto fornito dall'Università per l'esperienza di studio all'estero(per 100 che hanno svolto esperienze di studio all'estero riconosciute dal corso che stanno concludendo)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no"
      ]
    },
    {
      "id": "sono_soddisfatti_dell_esperienza_di_studio_all_estero_per_10",
      "label": "Sono soddisfatti dell'esperienza di studio all'estero(per 100 che hanno svolto esperienze di studio all'estero riconosciute dal corso che stanno concludendo)",
      "sezione": "5. CONDIZIONI DI STUDIO",
      "categoria": "Sono soddisfatti dell'esperienza di studio all'estero(per 100 che hanno svolto esperienze di studio all'estero riconosciute dal corso che stanno concludendo)",
      "indicatori": [
        "Attività di lavoro successivamente riconosciute dal corso",
        "Decisamente no",
        "Decisamente sì",
        "Hanno svolto tirocini formativi curriculari o lavoro riconosciuti dal corso di studio (%)",
        "Più no che sì",
        "Più sì che no",
        "Tirocini curriculari organizzati dal corso e svolti al di fuori dell'università",
        "Tirocini curriculari organizzati dal corso e svolti presso l'università"
      ]
    },
    {
      "id": "sono_soddisfatti_dell_esperienza_di_tirocinio_curriculare_pe",
      "label": "Sono soddisfatti dell'esperienza di tirocinio curriculare(per 100 che hanno svolto tirocini organizzati dal corso che stanno concludendo)",
      "sezione": "5. CONDIZIONI DI STUDIO",
      "categoria": "Sono soddisfatti dell'esperienza di tirocinio curriculare(per 100 che hanno svolto tirocini organizzati dal corso che stanno concludendo)",
      "indicatori": [
        "Decisamente no",
        "Decisamente sì",
        "Più no che sì",
        "Più sì che no",
        "Tempo impiegato per la tesi/prova finale (medie, in mesi)"
      ]
    },
    {
      "id": "lingue_straniere_conoscenza_almeno_b2",
      "label": "Lingue straniere: conoscenza “almeno B2” (%)",
      "sezione": "8. CONOSCENZE LINGUISTICHE E INFORMATICHE",
      "categoria": "Lingue straniere: conoscenza “almeno B2” (%)",
      "indicatori": [
        "Francese parlato",
        "Francese scritto",
        "Inglese parlato",
        "Inglese scritto",
        "Spagnolo parlato",
        "Spagnolo scritto",
        "Tedesco parlato",
        "Tedesco scritto"
      ]
    },
    {
      "id": "strumenti_informatici_livello_di_conoscenza_almeno_buona",
      "label": "Strumenti informatici: livello di conoscenza \"almeno buona\" (%)",
      "sezione": "8. CONOSCENZE LINGUISTICHE E INFORMATICHE",
      "categoria": "Strumenti informatici: livello di conoscenza \"almeno buona\" (%)",
      "indicatori": [
        "Data base",
        "Disegno e progettazione assistita",
        "Elaborazione e pubblicazione in rete di contenuti multimediali",
        "Fogli elettronici",
        "Linguaggi di programmazione",
        "Navigazione in Internet e comunicazione in rete",
        "Realizzazione siti web",
        "Reti di trasmissione dati",
        "Sistemi operativi",
        "Strumenti di presentazione",
        "Word processor"
      ]
    }
  ],
  "Profilo Studente": [
    {
      "id": "eta_alla_laurea",
      "label": "Età alla laurea (%)",
      "sezione": "1. CARATTERISTICHE ANAGRAFICHE",
      "categoria": "Età alla laurea (%)",
      "indicatori": [
        "23-24 anni",
        "25-26 anni",
        "27 anni e oltre",
        "Cittadini stranieri (%)",
        "Età alla laurea (medie, in anni)",
        "Meno di 23 anni"
      ]
    },
    {
      "id": "genere",
      "label": "Genere (%)",
      "sezione": "1. CARATTERISTICHE ANAGRAFICHE",
      "categoria": "Genere (%)",
      "indicatori": [
        "Donne",
        "Uomini"
      ]
    },
    {
      "id": "residenza",
      "label": "Residenza (%)",
      "sezione": "1. CARATTERISTICHE ANAGRAFICHE",
      "categoria": "Residenza (%)",
      "indicatori": [
        "Altra provincia della stessa regione",
        "Altra regione",
        "Estero",
        "Stessa provincia della sede degli studi"
      ]
    },
    {
      "id": "classe_sociale",
      "label": "Classe sociale (%)",
      "sezione": "2. ORIGINE SOCIALE",
      "categoria": "Classe sociale (%)",
      "indicatori": [
        "Classe del lavoro esecutivo",
        "Classe elevata",
        "Classe media autonoma",
        "Classe media impiegatizia"
      ]
    },
    {
      "id": "titolo_di_studio_dei_genitori",
      "label": "Titolo di studio dei genitori (%)",
      "sezione": "2. ORIGINE SOCIALE",
      "categoria": "Titolo di studio dei genitori (%)",
      "indicatori": [
        "Almeno un genitore laureato",
        "Diploma di scuola secondaria di secondo grado",
        "Entrambi con laurea",
        "Nessun genitore laureato",
        "Qualifica professionale, titolo inferiore o nessun titolo",
        "Uno solo con laurea"
      ]
    },
    {
      "id": "diploma",
      "label": "Diploma (%)",
      "sezione": "3. STUDI SECONDARI DI SECONDO GRADO",
      "categoria": "Diploma (%)",
      "indicatori": [
        "Liceale",
        "Liceo artistico e musicale e coreutico",
        "Liceo classico",
        "Liceo delle scienze umane",
        "Liceo linguistico",
        "Liceo scientifico",
        "Professionale",
        "Tecnico",
        "Tecnico economico",
        "Tecnico tecnologico",
        "Titolo estero",
        "Voto di diploma (medie, in 100-mi)"
      ]
    },
    {
      "id": "hanno_conseguito_il_diploma",
      "label": "Hanno conseguito il diploma (%)",
      "sezione": "3. STUDI SECONDARI DI SECONDO GRADO",
      "categoria": "Hanno conseguito il diploma (%)",
      "indicatori": [
        "Al Centro, ma si sono laureati al Nord o al Sud-Isole",
        "Al Nord, ma si sono laureati al Centro o al Sud-Isole",
        "Al Sud-Isole, ma si sono laureati al Centro o al Nord",
        "All'estero",
        "In una provincia limitrofa",
        "In una provincia non limitrofa, ma nella stessa ripartizione geografica",
        "Nella stessa provincia della sede degli studi universitari"
      ]
    }
  ]
};
