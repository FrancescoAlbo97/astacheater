# FantAsta — Manuale d'uso

Assistente decisionale per l'asta del fantacalcio a rialzo. Funziona interamente offline, da un
singolo file HTML (`dist/fantasta.html`), senza rete e senza installazioni: apribile anche da
telefono. Questo manuale spiega come avviarlo, come si usa ogni schermata e cosa significano i
numeri che mostra. Per la specifica tecnica completa (formule, criteri di accettazione, fasi di
sviluppo) vedi `readme.md`.

---

## 1. Avviarlo

Ci sono due modi, a seconda di cosa vuoi fare.

### Durante lo sviluppo (con ricompilazione automatica)

```bash
npm install     # solo la prima volta
npm run dev
```

Apri l'indirizzo che compare in console (di solito `http://localhost:5173/`).

### Il file finale, quello che userai davvero all'asta

```bash
npm run build
```

Produce `dist/fantasta.html`: un **unico file**, senza dipendenze esterne. Aprilo due volte per
verificarlo prima del giorno dell'asta:

- da un browser desktop, trascinandolo o con `file:///percorso/dist/fantasta.html`;
- **dal telefono che userai in asta**, per essere sicuro che si apra e sia leggibile.

Non serve nessun server: è pensato per funzionare anche senza connessione a internet.

---

## 2. Le otto schermate

Divise in due gruppi nel menu in alto, separati da una barretta verticale: a sinistra le cinque
schermate della **gestione dell'asta** (quelle che usi in continuazione mentre l'asta è in corso), a
destra Setup/Prova a secco/Report asta (quelle che usi una volta prima e una volta dopo).

### 2.1 Setup lega

La prima cosa da fare. Configura:

- **Manager**: quanti partecipanti (default 10), il primo è sempre "Io", gli altri prendono i nomi
  che scrivi (utile per riconoscerli nelle altre schermate durante l'asta).
- **Budget e slot**: crediti iniziali (default 500) e slot per ruolo (default 3 P, 8 D, 8 C, 6 A =
  25 totali). Se li cambi, verifica che il totale di lega torni (il programma non lo impedisce, ma
  i numeri del motore assumono che le regole siano quelle della tua lega reale).
- **Moduli ammessi** e modulo primario: usati dal motore per calcolare quanti titolari "contano"
  per ruolo (vedi §3.5), e per la vista Formazione di "La mia rosa" (§2.5).
- **Rischio**: da −1 (punta alla rosa più sicura in media) a +1 (punta a rose con più varianza,
  utile in leghe dove arrivare secondi vale poco). Default +0.15. Agisce davvero sui calcoli: un
  rischio più alto rende il motore un po' più aggressivo sui giocatori di fascia alta rispetto alla
  media del ruolo, uno più basso lo rende più prudente/piatto — ma è un effetto voluto **modesto**,
  non una leva che ti fa comprare una squadra di soli campioni: vedi §7 per i numeri e i limiti
  misurati. Questo è il valore di **default per tutta l'asta**; puoi comunque scavalcarlo per una
  singola decisione dal Banco d'asta (vedi §2.2).
- **Peso per ruolo** (nuovo): quanto vale per TE un punto guadagnato in un ruolo rispetto agli
  altri — 1 per tutti = nessuna preferenza (comportamento di sempre). Non cambia quanto ti aspetti
  che paghino gli AVVERSARI (tetto, prezzo atteso restano stime oggettive di mercato): cambia solo
  la TUA disponibilità a pagare. **Attenzione a un effetto non ovvio, verificato**: alzare il peso
  di un ruolo non "paga di più chiunque ci giochi" — spinge a inseguire con più aggressività i
  MIGLIORI candidati di quel ruolo, e a scartare ANCORA PIÙ volentieri quelli mediocri (un posto in
  quel ruolo vale di più, quindi conviene ancora di più aspettare un'occasione migliore invece di
  accontentarsi). Su un giocatore già scarso del ruolo pesato, "offri fino a" può quindi SCENDERE
  quando alzi il peso, non salire — è il comportamento corretto di un piano che ottimizza CHI riempie
  quel ruolo, non un errore.
- **Pesi di slot** (nuovo): quanto conta il tuo 1°, 2°, 3°... titolare DENTRO a ciascun ruolo — un
  numero per ogni slot di quel ruolo, in ordine decrescente (si riordinano da soli se li inverti
  quando esci dal campo). Diverso dal peso per ruolo sopra: quello cambia l'importanza del ruolo nel
  suo insieme, questo cambia la FORMA dentro al ruolo. Il caso concreto che lo ha motivato: se giochi
  con due portieri "titolari" a rotazione in base alla partita invece di uno solo netto, il default
  (2° portiere scontato quasi a zero, pensato per "un solo vero titolare + riserve") sottostima
  quanto ti serve un secondo portiere buono — alzando il peso del suo 2° slot vicino al 1° (es. 0.5 e
  0.45 invece di 0.87 e 0.11), il piano lo insegue con un'aggressività molto più realistica per come
  giochi davvero tu.

Puoi tornare qui in qualsiasi momento per correggere la configurazione: i punteggi e le vendite già
registrate non vengono perse.

Accanto al form trovi una **checklist pre-asta** sempre aggiornata (setup completo, listone
caricato, quanti punteggi hai assegnato, promemoria per la prova a secco e per verificare un
export) e un riepilogo dei limiti noti del programma (vedi §7) — utile come lista di controllo
finale prima di andare in asta, senza dover scorrere tutto il manuale.

### 2.2 Banco d'asta — la schermata che conta

Si usa **durante** l'asta vera, ad ogni giocatore estratto a voce. È pensata per essere veloce:
niente pannello di predizione esteso qui (quello vive in Predizione, §2.6, sempre a un clic di
distanza) — solo il necessario per segnare in fretta chi è uscito, a chi va e per quanto.

1. **Cerca il giocatore** ("Chi è uscito?", nome o squadra) e selezionalo.
2. Compare un riepilogo compatto: nome/ruolo/squadra/score, il tuo slot residuo in quel ruolo, e il
   pannello **OFFRI FINO A** in versione ridotta (prezzo atteso, tetto avversari, banda) con un link
   **"apri Predizione →"** per l'analisi completa (perché questo numero, alternative, allarme
   scarsità) quando ti serve approfondire prima di decidere.
3. **"A chi va?"**: tocca il manager che lo ha preso (i manager con lo slot di quel ruolo già pieno
   sono disattivati, non puoi assegnarglielo per sbaglio), scrivi il prezzo, Invio → **Assegna**.
   Oppure **"Nessuno l'ha preso"** se resta invenduto.
4. Il giocatore finisce subito nello slot successivo libero di quel ruolo per quel manager (in coda,
   nell'ordine in cui compri): se vuoi decidere TU la posizione esatta (chi è titolare, chi in
   panchina), lo sistemi con calma in **La mia rosa** (§2.5) — non c'è bisogno di deciderlo lì per lì
   ad ogni acquisto, rallenterebbe solo la registrazione dal vivo.
5. **Coda — i prossimi dalla tua lista obiettivi**: i giocatori che hai segnato con la ★ (§2.3),
   ancora da estrarre, con punteggio/prezzo atteso/tetto — un promemoria di chi tenere d'occhio.
6. A destra, due schede:
   - **Registro**: le ultime vendite, in ordine. Clic su una riga per **correggere** (manager
     sbagliato, prezzo sbagliato, o l'asta è stata riaperta): scegli il nuovo manager/prezzo e
     **Salva correzione**, oppure **Rimetti in asta** per annullarla del tutto e farla ricomparire
     fra i giocatori da estrarre. La correzione ricalcola da sola crediti e tetti di tutti.
   - **Non acquistati**: chi è uscito senza trovare un acquirente. **Riproponi** lo rimette
     immediatamente disponibile per la ricerca, come se non fosse mai uscito (utile per il classico
     giro finale in cui si ripropongono gli invenduti).
7. **Avanzamento asta**: quanti assegnati, quanti liberi (non acquistati), quanti ancora da
   estrarre — sempre visibile in fondo alla colonna destra e nella barra in alto.
8. **Annulla ultimo** (undo, sempre visibile in alto a sinistra): corregge un errore appena fatto
   senza dover ricostruire lo stato a mano. Puoi annullare quante volte serve, anche a ritroso nel
   tempo — per correggere qualcosa di PIÙ vecchio dell'ultimo evento usa "Correggi" dal Registro
   (punto 6), non l'undo.

**Semplificazioni consapevoli rispetto a una gestione "ideale"**: niente scorciatoie da tastiera
1-9/0 per scegliere il manager (solo clic) e niente passaggio obbligato "in che slot lo metti?" ad
ogni singolo acquisto (lo decidi con calma dopo, in "La mia rosa") — entrambe scelte per non
rallentare la registrazione durante un'asta a voce dal vivo, dove ogni secondo conta.

### 2.3 Pool giocatori

Qui prepari la lista **prima** dell'asta e la consulti **durante**, per sapere sempre chi manca, chi
è rimasto senza acquirente e chi è già stato preso (e da chi).

Tre schede in alto:

- **Da estrarre**: chi deve ancora uscire. Qui prepari i punteggi (vedi sotto) e vedi, per ogni
  giocatore, **p̂** (prezzo atteso) e **chi può permetterselo** — i manager il cui tetto (aritmetica
  esatta) copre almeno il prezzo atteso: se la colonna mostra "tutti" non c'è competizione reale, se
  mostra pochi nomi (o nessuno) è un'occasione o un campanello d'allarme a seconda di chi sei tu fra
  quei nomi.
- **Non acquistati**: chi è uscito senza acquirente. **Riproponi** lo rimette in circolo (stesso
  effetto del pulsante gemello nel Banco d'asta, §2.2).
- **Assegnati**: chi è stato comprato, da chi e a quanto — la vista "dove sono finiti tutti".

Selezionando un ruolo specifico (P/D/C/A, non "Tutti") compaiono 4 tessere con i numeri di quel
ruolo: quanti restano da estrarre, quanti "da 75+" sono ancora in pool, quanti slot di quel ruolo
sono ancora aperti in tutta la lega, il prezzo medio pagato finora.

- **★ Obiettivi**: segna una stella sui giocatori che ti interessano davvero (indipendente dal
  punteggio — anche un giocatore già valutato può non essere una "priorità"). Filtro "solo i miei
  obiettivi" per vederli isolati, e compaiono nella Coda del Banco d'asta (§2.2).
- **Punteggio (0–100)**: per ogni giocatore, quanto è forte **quando gioca** — non quanto gioca. È
  il programma che deduce la probabilità di titolarità dal punteggio secondo curve tarate per
  ruolo. Se un giocatore è forte ma gioca poco (o il contrario: gioca sempre ma non incide), usa
  l'**override titolarità** invece di alterare il punteggio. Modificabile solo nella scheda "Da
  estrarre" (una volta deciso l'esito, editare lo score serve raramente).
- **Filtri**: per ruolo, squadra, testo libero, o "solo senza punteggio" per completare la lista
  metodicamente.
- **Scarica template CSV**: genera un file di esempio con l'intestazione e il formato esatto
  richiesto, da riempire con un foglio di calcolo (Excel, Google Sheets, ecc.) e poi reimportare.
- **Importa CSV** (`nome,ruolo,squadra,punteggio,titolarita`): aggiorna il listone mantenendo i
  punteggi già assegnati in precedenza (abbina per nome). Le ultime due colonne sono **opzionali**.
- **Aggiungi giocatore**: per un giocatore estratto in asta ma assente dal listone. Pensato per
  essere immediato (nome, squadra, ruolo, invio) da usare anche a voce alta con l'asta in corso.

Il contatore in alto mostra quanti giocatori hai valutato per ruolo: più ne valuti (soprattutto i
primi 40–50 per ruolo, quelli che verranno davvero contesi), più il motore sarà preciso.

### 2.4 Fantallenatori

Le rose di TUTTI i manager (te compreso) a confronto in un colpo d'occhio: crediti residui, slot
totali liberi, **tetto** (il massimo che quel manager può offrire su un singolo giocatore — la
stessa aritmetica esatta del tetto avversari), slot liberi per ruolo (mini-barre P/D/C/A),
**minaccia** e **pressione**. Ordinata per crediti residui.

- **Minaccia**: quanti dei tuoi obiettivi ★ (segnati in Pool giocatori) quel manager può ancora
  permettersi — stessa aritmetica esatta di "chi può permetterselo" in Pool giocatori, aggregata su
  tutta la tua lista di obiettivi invece che su un giocatore alla volta.
- **Pressione**: i ruoli dove quel manager ha ancora slot aperti ma il pool residuo in quel ruolo è
  già risicato per lui e per tutti gli altri manager insieme — stessa condizione di "allarme
  scarsità" della schermata Banco d'asta, qui applicata a un manager qualunque invece che solo a te.

Clic su una riga per entrare nel **dettaglio** di quel fantallenatore: la sua rosa completa,
ruolo per ruolo, con eventuali note automatiche (es. "manca almeno un titolare in D"). Per gli
avversari (non per te) compare anche **"su cosa compete ancora con te"**: i ruoli dove sia tu sia
lui avete ancora slot liberi — un modo rapido per capire chi è davvero un rivale sui tuoi prossimi
obiettivi e chi invece non ti intralcia più. Se ha minaccia o pressione, compare anche un riquadro
**"minaccia e pressione"** con il dettaglio: quali obiettivi esattamente e i numeri (slot suoi, pool
residuo, slot degli altri) dietro ogni ruolo segnalato.

### 2.5 La mia rosa

Non solo l'elenco di chi hai comprato, ma **dove lo metti**: lo slot è la posizione che decidi TU
(titolare o panchina, e quale numero — D1, D2, …), non l'ordine in cui l'hai acquistato. Due viste:

- **Slot**: la tua rosa divisa nei 4 ruoli, titolari e panchina separati secondo la formazione
  primaria. Trascina un giocatore (l'icona ⠿) per spostarlo — anche da panchina a titolare o
  viceversa. Se un panchinaro ha un punteggio più alto di un titolare nello stesso ruolo, compare un
  avviso ⚠ ("vuoi scambiarli?") — un suggerimento, non una correzione automatica: l'ultima parola
  resta sempre tua (magari quel titolare gioca sempre e l'altro è un cambio a partita in corso, cosa
  che il punteggio da solo non racconta).
- **Formazione**: cosa scenderebbe in campo oggi con il modulo scelto (switcher 3-4-3/3-5-2/ecc,
  fra quelli ammessi in Setup), secondo gli slot che hai assegnato — non un calcolo automatico
  "chi è più forte", ma la fotografia della TUA gerarchia. A fianco: titolari coperti, spesa per
  reparto (con confronto alla media di lega — se sei molto sopra o sotto compare una nota), e una
  stima di massima di quanto ti restano da spendere per gli slot ancora vuoti.

In testata: titolari coperti, gerarchie da sistemare (quante ⚠ sopra), crediti per slot residuo,
massimo offribile ora su un singolo giocatore.

### 2.6 Predizione

L'analisi completa per un giocatore, con calma — tutto quello che nel Banco d'asta (§2.2) resta
volutamente compresso in tre righe: il numero "OFFRI FINO A" con la scala dei prezzi, prezzo
atteso/tetto avversari/secondo tetto in dettaglio (più, quando disponibile, una riga "interesse
stimato" sotto il tetto avversari — quanto pensiamo converrebbe offrire al concorrente più
interessato, non solo quanto potrebbe fisicamente pagare, vedi §7), "perché questo numero?" (la
catena di calcolo in 4 passi: peso dello slot, valore per te, valore ombra del ruolo, stima rapida),
le alternative rimaste nello stesso ruolo, l'allarme scarsità, e lo slider di aggressività
per-decisione. A inizio asta, se i prezzi mostrati sembrano incoerenti fra un giocatore e l'altro,
guarda l'avviso in cima al pannello: con poche vendite registrate i prezzi sono ancora poco
affidabili, e il testo ti dice se stai già usando una stima calibrata sulla tua lega o ancora la
curva generica (§7).

Ci arrivi in due modi: dal link **"apri Predizione →"** nel Banco d'asta (stesso giocatore, senza
doverlo ricercare due volte), oppure cercando direttamente qui — utile per analizzare con calma un
giocatore PRIMA che esca in asta, non solo mentre è sotto i riflettori.

### 2.7 Prova a secco

Da usare **prima** dell'asta, per tarare i punteggi. Assegna un po' di punteggi in Pool giocatori,
poi lancia la Prova a secco: gira 200 aste simulate sulla tua lista reale e mostra la rosa attesa
per ruolo, il valore di stagione medio atteso, e segnala (⚠,
"ruoli segnalati") i ruoli dove perdi sistematicamente i tuoi obiettivi migliori **per quel ruolo**,
o dove lo score medio dei giocatori acquisiti è molto più basso della media della TUA lista per
quello stesso ruolo. Il confronto è sempre **con il ruolo stesso**, mai fra ruoli diversi: un
attaccante ha per natura pochi "fenomeni" assoluti e molte riserve rispetto, ad esempio, a un
centrocampista, quindi non ha senso giudicarlo con lo stesso metro — farlo avrebbe segnalato quasi
sempre l'attacco anche quando non c'era nulla di storto (bug corretto: prima la soglia di "obiettivo
di fascia alta" era fissa a 70 per tutti i ruoli e il confronto era contro la media incrociata degli
altri ruoli). Se un ruolo resta segnalato, è un indizio concreto che vale la pena ricontrollare
quegli score, non un allarme generico. Impiega pochi secondi.

**Come sono fatti gli avversari simulati**: ognuno parte dai TUOI punteggi e li perturba con un
piccolo margine casuale (± 10 punti circa), così ognuno finisce per avere obiettivi leggermente
diversi dai tuoi invece di condividere un'unica classifica di mercato — e il mix di comportamenti
(alcuni genuinamente bravi, altri con i difetti tipici — parte troppo presto, si affeziona a una
squadra, ecc.) cambia a ogni asta simulata, non è sempre lo stesso "personaggio" nello stesso posto.

Oltre alle medie aggregate, la schermata mostra anche **rose finali di esempio**: tre squadre
REALMENTE formate dalle simulazioni (una "sfortunata", una "tipica" e una "fortunata", per valore
finale) con ogni giocatore, prezzo e score — per farti vedere concretamente il ventaglio di esiti
possibili, non solo un numero medio.

**Diagnostica** (nuovo): non solo "che rosa aspettarti", ma "quanto fidarsi di questi numeri", sulla
TUA lista reale invece che su un benchmark sintetico:

- **Spesa per ruolo, reale vs quota attesa**: confronta quanto la simulazione spende per ruolo (in
  media) con la quota che il modello di prezzo stesso si aspetta (§6.3.1: P 5%/D 15%/C 30%/A 50%). Un
  ruolo ⚠ è fuori dalla banda di ±8 punti percentuali attesa (§9.5).
- **Crediti non spesi a fine asta**: mediana, p10/p90 e media dei crediti che restano inutilizzati
  nella TUA rosa a fine simulazione. Il target di riferimento è 0–15 (§9.5) — se il numero che vedi è
  molto più alto (limite noto, vedi §7), significa che la simulazione lascia sul tavolo crediti che
  in un'asta vera verrebbero spesi, quindi le rose simulate tendono a essere più "povere" di quanto
  sarebbero in realtà.
- **Obiettivi ★ acquisiti**: quota media dei TUOI obiettivi (segnati in Pool giocatori) che finisci
  davvero per acquisire nelle simulazioni, con l'atteso di riferimento (30–50%, §9.5). Compare solo
  se hai segnato almeno un obiettivo.
- **Punteggio vs prezzo pagato**: uno scatter dei tuoi acquisti simulati (campionato per leggibilità).
  Una tendenza crescente per ruolo è il segnale atteso; se per un ruolo il grafico è piatto o
  disordinato, il modello di prezzo per quel ruolo potrebbe essere scalato male sul tuo listone.

Questi numeri condividono il motore con la Prova a secco stessa (stesso `runAuctionSim`): se sono
fuori banda, è lo stesso limite già discusso in §7, ora visibile e misurabile sulla tua lista reale
invece che solo su un benchmark sintetico.

**Guarda un'asta simulata per intero** (nuovo): non una media su 200 aste, ma UNA asta plausibile
vista giocata per giocata — chi ha preso cosa, quando, per quanto, con la stessa identica macchina
della Prova a secco (stesso jitter dai tuoi punteggi, stesso mix di avversari rimescolato, la tua
configurazione personalizzata di rischio/pesi). Mostra la tua rosa completa di quell'asta e il log
di TUTTE le vendite (non solo le tue) in ordine di estrazione, con le tue evidenziate. Ogni clic su
"genera un'altra" produce un'asta diversa ma riproducibile. Utile per farsi un'idea concreta di come
potrebbe svolgersi, in un modo che una media aggregata non può dare — a costo di essere un singolo
campione: non trarne conclusioni generali, per quello restano i numeri aggregati sopra.

**"Il motore esatto avrebbe seguito questa simulazione?"** (nuovo): sotto ogni asta simulata, lo
stesso identico "Report asta" che vedi dopo un'asta vera (§2.8), applicato a QUESTA asta simulata —
per ogni tuo acquisto, confronta "offri fino a" calcolato dal motore esatto un istante prima con
quanto è stato davvero pagato nella simulazione, più una tabella 1ª metà/2ª metà per capire SE e
DOVE la simulazione si allontana dal consiglio dal vivo man mano che l'asta procede. Risponde
direttamente alla domanda "l'algoritmo si comporta bene, soprattutto da metà in poi?" con numeri
concreti invece che con un'impressione. **Attenzione, spiegata anche nella schermata**: dentro la
simulazione, anche "io" decido con la policy approssimata del simulatore (`auction-sim.ts`), non con
questo calcolo esatto — sono due motori diversi fin dall'inizio (§9.3). Questo report misura QUANTO
le due cose divergono in un'asta plausibile, non se il simulatore in assoluto è realistico (quello
è il limite già discusso in §7, "F7/F10").

### 2.8 Report asta

Risponde a una domanda diversa dalla Prova a secco: non "cosa mi devo aspettare", ma **"questo
meccanismo mi sta davvero aiutando?"**, guardando la TUA asta reale — anche se ancora in corso, non
serve aspettare la fine. Non è una simulazione: rigioca il log dei tuoi eventi (compresi gli undo,
risolti correttamente) e, per ogni vendita, ricalcola cosa diceva il motore un istante prima che
avvenisse, con lo stato di allora — crediti, slot e rosa di quel momento, non quelli di adesso.

Premi **Genera report** (richiede almeno una vendita registrata) e trovi:

- **Valore di stagione atteso**, **crediti spesi**: lo stesso metro della Prova a secco, per
  confrontare la rosa REALE con quella che ti aspettavi.
- **Volte sopra il tuo tetto**: quante volte hai pagato più di quanto "offri fino a" diceva in
  quel momento, e di quanti crediti in totale — un indizio se ti stai facendo prendere la mano
  nel calore dell'asta rispetto a quello che il modello riteneva conveniente.
- **Occasioni mancate**: giocatori finiti a un avversario a un prezzo che, secondo il TUO modello
  in quel momento, potevi permetterti senza peggiorare la rosa finale. Non è un verdetto ("avresti
  dovuto vincerlo") — magari stavi inseguendo un altro obiettivo — ma un elenco concreto da
  rivedere, non un'impressione generica.
- L'elenco dettagliato di ogni acquisto, con prezzo pagato, tetto e prezzo atteso calcolati
  dal motore in quell'istante.

Usalo per capire, con numeri concreti sulla TUA asta e non su medie ipotetiche, se seguire il
"offri fino a" ti ha davvero portato a spendere meglio — non solo se "sembra funzionare".

---

## 3. I concetti chiave, in breve

Per capire *perché* il programma dice quello che dice (la spiegazione completa, con le formule, è
nel `readme.md`):

1. **p\* (offri fino a) e p̂ (prezzo atteso) sono due numeri diversi, sempre mostrati entrambi.**
   p\* dipende solo da quanto vale il giocatore *per te* e da cosa potresti comprare altrimenti con
   gli stessi crediti. p̂ dipende da quanto lo valutano gli altri. Non vanno confusi: il primo dice
   fin dove *puoi* salire senza rovinarti, il secondo quanto probabilmente *dovrai* pagare.
2. **Il tetto avversari è calcolo esatto, non una stima**: ogni manager deve riempire tutti i suoi
   slot e ogni giocatore costa almeno 1 credito, quindi il massimo che può offrire su un singolo
   giocatore è una sottrazione, non un'ipotesi.
3. **I prezzi si tarano da soli durante l'asta**: non ci sono dati di mercato esterni. Il programma
   parte da una curva iniziale approssimativa e la corregge ad ogni vendita registrata — più
   avanti nell'asta, più affidabile diventa (mostrato dall'etichetta di confidenza: bassa/media/
   alta, e da quante osservazioni ha usato per ogni ruolo).
4. **Il punteggio misura la qualità *quando gioca*, non quanto gioca**: un giocatore fortissimo ma
   che gioca a corrente alternata NON va sottovalutato nel punteggio — è il programma che deduce
   la titolarità automaticamente. Usa l'override solo per i casi davvero anomali (rientro da
   infortunio, squadra che ruota molto).
5. **λ (lambda)**, quando appare, è il valore di un credito in più in fantapunti di stagione: con
   i parametri di default, verso 1 credito ≈ 1 fantapunto, una regola mnemonica comoda a voce alta.

---

## 4. Backup e sicurezza dei dati

L'app salva automaticamente il tuo lavoro nel browser (`localStorage`) **ad ogni singola azione**
(ogni punteggio, ogni vendita, ogni undo). In pratica questo significa che chiudere per sbaglio la
scheda, un crash del browser, o spegnere/riavviare il computer **non ti fa perdere nulla**: quando
riapri la pagina, l'ultimo stato salvato ricompare automaticamente da solo, senza dover importare
niente a mano. In alto a destra trovi sempre l'orario dell'ultimo salvataggio riuscito ("salvato
alle HH:MM:SS"), così non devi fidarti alla cieca.

**Quello che l'autosave nel browser NON copre**: se cancelli i dati di navigazione del browser
(cache/cronologia), usi una scheda in incognito, o vuoi continuare l'asta su un **altro
dispositivo**, il `localStorage` non ti segue. Per questi casi:

- **Backup automatico su file**: ogni 5 minuti, se è successo qualcosa di nuovo, l'app scarica da
  sola un file JSON di backup (`fantasta-backup-auto-<timestamp>.json`) nella cartella Download —
  una seconda rete di sicurezza indipendente dal browser stesso. **Nota importante**: dopo il primo
  paio di download automatici ravvicinati, i browser (Chrome in particolare) chiedono il permesso
  di scaricare più file dallo stesso sito — **concedilo**, altrimenti i backup successivi vengono
  bloccati silenziosamente senza nessun avviso evidente. Controlla la cartella Download una volta
  ogni tanto durante l'asta per conferma, e ricordati di ripulirla ogni tanto (si accumulano).
- **Esporta** (in alto a destra): scarica subito un file JSON con l'intero stato (configurazione,
  punteggi, vendite), senza aspettare i 5 minuti. Fallo comunque ogni tanto a mano durante l'asta
  vera se vuoi essere sicuro al 100%, specialmente prima di un momento delicato.
- **Importa**: ricarica uno stato esportato in precedenza (utile anche per passare l'asta a un
  altro dispositivo a metà serata, o per recuperare da uno dei backup automatici in Download).
- **Azzera**: cancella tutto (chiede conferma). Esporta prima, se non sei sicuro.

---

## 5. Prima dell'asta vera: checklist

Il listone incluso è stato raccolto ad agosto 2026, a mercato estivo ancora aperto: **va
aggiornato a ridosso della tua asta**, non usato così com'è se l'asta è fra settimane.

1. **Aggiorna il listone**: scarica il template CSV da Pool giocatori, compilalo (anche con
   punteggio e titolarità già pronti, se li hai preparati in anticipo su un foglio di calcolo) e
   importalo — preserva i punteggi già assegnati, abbinando per nome.
2. **(Opzionale) Ricalibra i parametri di prezzo** con la simulazione self-play da riga di comando:
   ```bash
   npx tsx src/sim/cli.ts calibrate 500 8
   ```
   Aggiorna `data/defaults.json`. Richiede qualche minuto; non è indispensabile, il programma
   funziona comunque con i parametri di default.
3. **Prova a secco due volte** sulla lista definitiva, per assicurarti che nessun giocatore che ti
   interessa risulti mancante e che la distribuzione della rosa attesa ti convinca.
4. **Verifica un export JSON** manuale prima di iniziare, per sapere già come si fa sotto pressione.

---

## 6. Comandi utili da riga di comando

Per chi vuole guardare sotto il cofano o rifare le verifiche:

```bash
npm test                          # tutti i test automatici (294, dovrebbero passare tutti)
npm run typecheck                 # controllo dei tipi TypeScript
npm run build                     # produce dist/fantasta.html
npx tsx src/sim/cli.ts bench 200        # statistiche di realismo su 200 aste simulate
npx tsx src/sim/cli.ts validate 100     # confronto motore vs politiche "ingenue" (ablazione)
npx tsx src/sim/cli.ts calibrate 500 8  # ricalibrazione self-play dei parametri di prezzo
```

---

## 7. Limiti noti (onestà prima di tutto)

Questo programma è stato validato con test automatici rigorosi (verifica incrociata con forza
bruta sui calcoli esatti, controlli numerici sulle formule, ecc.). Diversi bug reali sono stati
trovati e corretti durante lo sviluppo (vedi sotto); **alcuni limiti restano documentati e non
ancora risolti del tutto**, per trasparenza:

- **Il Monte Carlo (banda di Predizione) riscritto: avversari a base di valore vero + orizzonte
  molto più profondo — bug reale trovato per strada, segnalazione dell'utente**. L'utente ha
  descritto a parole esattamente come dovrebbe ragionare un fantallenatore durante una simulazione:
  "quando ha tanti soldi sarà vicino al prezzo reale... se c'è scarsità offrirà tanto, se è l'unico
  con lo slot libero offrirà pochissimo" — e ha correttamente diagnosticato che il vecchio rollout
  simulava solo poche decine di estrazioni prima di "indovinare" il resto della rosa con un valore
  fisso, invece di portare l'asta fino in fondo. Verificato leggendo il codice: vero su entrambi i
  punti. Gli avversari, dentro il rollout, rispondevano con "prezzo di mercato atteso × rumore
  casuale" — zero ragionamento sulla loro reale scarsità — e l'orizzonte era tagliato a 80
  estrazioni fisse indipendentemente da quante ne restassero davvero. **Corretto**: estratta la
  logica di offerta "a base di valore" già validata su dati reali nel simulatore offline
  (`sim/auction-sim.ts`, usata per "Prova a secco") in un modulo condiviso (`core/
  rational-bidder.ts`), e usata ora per QUALUNQUE manager nel rollout, non solo per te; l'orizzonte
  arriva di default fino alla fine vera del pool residuo (limite di sicurezza solo per l'inizio
  asta, quando il pool è al suo massimo). **Un bug reale trovato mentre si implementava questo
  cambio, non prima**: con tutti i manager resi "razionali" su una rosa da 25 slot, un parametro di
  arrotondamento del budget ereditato dalla vecchia versione (tarata per un solo manager con un
  pool già ridotto) faceva collassare il calcolo interno a zero per OGNI manager — sintomo
  osservabile: ogni offerta, per qualunque giocatore, scendeva al minimo di lega. Corretto
  allineando quel parametro allo stesso valore già in uso con successo nel simulatore offline per
  lo stesso identico problema. **Costo onestamente più alto**: rendere razionali anche i 9
  avversari (non solo te) e simulare molto più a fondo costa di più — il numero di simulazioni per
  singola stima è sceso da 2000 a 150 per restare in un tempo ragionevole (resta ben sopra il
  minimo di affidabilità richiesto, "almeno 100"); il tempo tipico per aggiornare la banda passa da
  meno di 3 secondi a qualche secondo in più, ma senza mai bloccare l'app (gira in un thread
  separato). Verificato dal vivo in un browser reale: la banda ora mostra una variabilità sensata
  invece di un valore fisso ripetuto, nessun errore in console.

- **Nuovo: venti scenari di robustità al CAMBIO DI SETUP** (`test/setup-robustness-scenarios.test.ts`,
  20 test, molti a proprietà casuale), richiesti esplicitamente dall'utente per poter verificare "che
  quando cambio i valori di setup o altro comunque vengono rispettati questi test" — a differenza dei
  12 scenari "da metà asta" (su una config fissa), questi variano budget, numero di slot, numero di
  manager, prezzo minimo, rischio, pesi di ruolo/slot personalizzati, e verificano che le proprietà
  fondamentali reggano per QUALUNQUE valore ragionevole, non solo per il default. **Hanno trovato un
  bug reale, non solo confermato che tutto andava bene**: vedi il punto subito sotto.
- **Bug reale corretto, trovato da uno di questi 20 test: il prezzo minimo di lega (`minPrice`) non
  veniva mai usato nel calcolo esatto dal vivo, solo nel rollout Monte Carlo**. Il test faceva
  variare `minPrice` (di default sempre 1, mai cambiato in nessun test precedente di questo
  progetto) e verificava che un giocatore "garantito" (nessun avversario eleggibile) risultasse
  offerto esattamente al prezzo minimo configurato. Con `minPrice = 2` il test falliva: il banner
  "Tuo garantito a 2 crediti" e il numero "OFFRI FINO A" appena sotto (fermo a 1) avrebbero mostrato
  due numeri in disaccordo nella stessa schermata. Causa: `max-bid.ts` faceva partire la bisezione da
  `1` fisso invece che dal prezzo minimo configurato, e `operationalMaxBid` (`ceiling.ts`) non
  considerava affatto `minPrice` nel suo calcolo — invisibile finché nessuno aveva mai testato un
  valore diverso da 1 (il default), esattamente il tipo di bug che un test "a proprietà casuale sul
  Setup" è pensato per stanare. **Corretto** in entrambi i file: la bisezione ora parte dal prezzo
  minimo, e l'offerta operativa applica `minPrice` come pavimento SOLO al tetto avversari (mai a p*
  direttamente, così un candidato che non serve resta a 0, non forzato al minimo). Con `minPrice = 1`
  (ogni config precedente a questo fix) il comportamento è identico, byte per byte: zero regressioni
  sulle centinaia di test esistenti. Aggiunto anche un test diretto e veloce in `test/ceiling.test.ts`
  per la stessa regressione, accanto a quello a proprietà casuale.
- **Tre miglioramenti ispirati a un vecchio prototipo del progetto, MAI usati come sostituto del
  motore**. L'utente ha chiesto di analizzare `neural_network/` (un tentativo di anni fa, mai
  completato, mai allenato con successo — nessun peso salvato, codice morto, un `except:` vuoto)
  che imparava a valutare un'asta con una rete neurale allenata via self-play (auto-gioco contro
  copie di sé stessa). Verdetto onesto dato in chat: NON conviene estendere quell'approccio a
  questo progetto (input a dimensione fissa incompatibile con un pool che cambia, zero nozione di
  ruoli, ricompensa scollegata dal prezzo pagato, e soprattutto: una rete allenata sarebbe MENO
  debuggabile del sistema attuale, non di più — l'esatto opposto di quello che serve dopo aver
  appena trovato e corretto bug reali leggendo formule riga per riga). Individuate però tre idee
  GENUINE prese in prestito dal concetto di self-play, implementate SENZA addestrare nulla, dentro
  il motore trasparente già esistente:
  1. **Stima dell'interesse degli avversari** (`estimateOpponentWillingness`, `engine.ts`): accanto
     al tetto FISICO già esatto (§6.4 del `readme.md`, quanto un avversario PUÒ pagare al massimo),
     una nuova stima di quanto gli CONVERREBBE offrire per QUESTO giocatore — fa girare la stessa
     `computeDuals`/`approxMaxBid` (§6.6) sul roster/budget reale di ciascun avversario con slot
     libero, assumendo che valuti i giocatori come te (ipotesi esplicita, mostrata in UI accanto al
     tetto fisico, mai al posto suo). Un avversario già pieno nel ruolo non entra mai nel calcolo.
  2. **Prior di prezzo su misura per la tua lega** (`league-prior.ts`, nuovo file): quando la
     confidenza sui prezzi REALI di questa lega è ancora bassa (early auction), invece della curva
     teorica generica si usano 10 aste sintetiche giocate con la CONFIGURAZIONE ESATTA della tua
     lega (stessa macchina di "Prova a secco") per stimare una curva di partenza più su misura. I
     dati reali, appena arrivano, restano sempre più forti (nessun cambiamento al meccanismo di
     ridge già esistente). Calcolo (qualche centinaio di ms) tenuto rigorosamente FUORI dal
     percorso di una singola decisione (§13.9): una cache scaldata in background da un effetto
     React, mai dentro `computeDecisionForPlayer`.
  3. **λ smussato su una finestra** (`marginalValue`, `plan-dp.ts`): invece di leggere solo il
     gradino più recente dell'inviluppo di valore, se ne mediano fino a 5 consecutivi — riduce la
     sensibilità residua a un singolo scatto idiosincratico, nello stesso spirito di "un valore
     appreso generalizza, non legge un solo punto" ma senza bisogno di allenare nulla. Nessuna
     regressione: con un solo gradino disponibile (il caso comune) il risultato è identico a prima.

  Verificato che il costo aggiuntivo del punto 1 resta dentro un budget realistico per un'asta vera
  (soglia del test di prestazione allargata 100ms→180ms, con motivazione esplicita nel commento:
  misurato isolato ~70ms, il resto è margine per la contesa della suite intera in parallelo — la
  stessa identica logica già applicata ai budget di rollout/sim in una sessione precedente).

- **Nuovo: dodici scenari di integrazione "da metà asta"** (`test/integration-scenarios.test.ts`,
  13 test), richiesti esplicitamente dall'utente dopo diversi round di bug reali trovati durante
  l'uso vero: non funzioni isolate come negli altri file, ma `computeDecisionForPlayer` end-to-end
  su stati REALISTICI parzialmente giocati, verificando situazioni che "fanno la differenza
  nell'ottenimento degli obiettivi" (parole dell'utente) — fra gli altri: diventare l'unico manager
  con uno slot libero in un ruolo (il prossimo giocatore deve risultare garantito al prezzo minimo,
  non un numero vicino per coincidenza) e la controprova che NON scatta se anche un solo avversario
  resta eleggibile; comprare un centrocampista costoso lasciandosi comunque un budget vero per
  rilanciare su un attaccante dopo, e il contraltare di uno strasperpero che DEVE comprimere
  davvero le offerte successive; la certezza-equivalenza di "non serve" (§6.6) verificata a livello
  di integrazione, non solo sulla funzione pura `applyHedge`; un ruolo davvero pieno che resta
  "non serve" sempre, anche per un fenomeno assoluto; l'occasione reale (candidato più economico ma
  di valore comparabile riceve un'offerta più alta, non più bassa); la nuova stima di interesse
  degli avversari che ignora sempre chi è già pieno nel ruolo; λ invariante anche su un'asta
  ASIMMETRICA (non solo il caso simmetrico già coperto altrove); l'allarme scarsità; il budget
  quasi esaurito che non fa mai esplodere l'offerta oltre il vero massimo per slot; uno
  strasperpero che non "avvelena" le decisioni su un ruolo scorrelato.

- **Bug reale corretto: i "duali" (λ) usati per la stima rapida e per il pannello "perché questo
  numero" dipendevano da QUALE giocatore si stava prezzando — segnalato dall'utente come "ci sono
  ancora tanti errori... vedo giocatori con valori più bassi che mi propone prezzi più alti... la
  parte dello slot del ruolo fa un casino"**. Indagine su un'asta reale, prima dell'inizio (zero
  vendite): confrontando i primi 12 giocatori per ruolo, alcuni "punteggio più basso → prezzo più
  alto" erano in realtà corretti (il valore vero per te non è il punteggio grezzo ma punteggio ×
  titolarità: un giocatore con punteggio leggermente più basso ma titolarità più alta può valere
  DAVVERO di più — non un bug, `myValue` fa esattamente questo). Un altro gruppo era spiegabile da
  un ragionamento di "occasione": un giocatore con prezzo di mercato atteso bassissimo (perché il
  suo punteggio grezzo è basso) ma valore quasi identico a un'alternativa molto più cara, riceve
  giustamente un p* più alto — se non lo prendi ora a poco, l'alternativa equivalente ti costerà
  molto di più (anche questo NON è un bug, è arbitraggio corretto). Ma un residuo di casi non si
  spiegava con nessuno dei due: es. Cande (valore 195.2, prezzo atteso 1) e Kalulu (valore 195.9,
  prezzo atteso 22) nello stesso ruolo, stessa istantanea d'asta — chiedendo "quanto offrire per
  Kalulu" si otteneva λ = 1.052; chiedendo "quanto offrire per Cande" (un giocatore diverso!) si
  otteneva λ = 0.422, più della metà. Causa: `computeDuals` veniva chiamato sul pool con il
  giocatore-bersaglio ESCLUSO (`roleInputsWithoutTarget`) — necessario per la programmazione
  dinamica esatta (deve poter reinserire il bersaglio a un prezzo di prova senza contarlo due
  volte), ma riusato per comodità anche per i duali, che non ne hanno bisogno. λ (`marginalValue` in
  `plan-dp.ts`) è una ricerca all'indietro dell'ultimo "gradino" nell'inviluppo di valore
  dell'intero mercato: escludere un candidato diverso a ogni query può spostare quel gradino a un
  budget completamente diverso, con salti anche di 2-3×. Sintomo pratico osservato: il pannello
  "perché questo numero" mostrava una "stima rapida" di 350+ crediti per un centrocampista il cui
  prezzo massimo VERO (dalla programmazione dinamica esatta, non toccata dal bug) era 30 — un
  numero platealmente assurdo che alimentava esattamente la sfiducia "l'algoritmo non funziona".
  Confermato che `sim/auction-sim.ts` (il simulatore) non ha mai avuto questo problema: lì i duali
  si ricalcolano periodicamente sul pool INTERO, mai escludendo un candidato specifico — la stessa
  soluzione è stata applicata anche qui. **Corretto**: i duali ora si calcolano una sola volta per
  istantanea, sul pool completo (bersaglio incluso, dato che i pesi di slot dipendono solo da chi
  possiedi già, non dal pool opzionale). Verificato sui dati reali: λ ora è identico (1.052) per
  tutti i 496 giocatori del listone, e la stima rapida per Cande/Kalulu/Bremer/Solet/Dimarco/Wesley
  torna monotona nel loro valore vero. Aggiunti 2 test (uno diretto, uno a proprietà casuali) che
  verificano che λ non cambi in base al giocatore scelto come bersaglio nella stessa istantanea.
  **Non ancora un bug, ma un rischio segnalato onestamente**: nessun caso reale in questo listone
  aveva ANCHE `reason: 'not-useful'` nello stesso momento (quindi la "copertura" del punto
  successivo non aveva mai mostrato un numero assurdo come "offri fino a"), ma la combinazione era
  possibile prima di questo fix — risolta alla radice, non solo mascherata.
- **Segnalazione confermata ma NON un bug: l'aggressività non sposta il prezzo in modo percepibile
  ("cambio il valore con l'aggressività e non si smuove")**. Rifatta la misura sui dati reali con
  risk = −1/−0.5/0/+0.5/+1 sugli stessi giocatori: `myValue` cambia sempre in modo monotono (come
  atteso), ma il prezzo massimo finale spesso si muove di 0-5 crediti su un range di decine, e in un
  caso (un difensore da top-lista) l'effetto è risultato addirittura a "U" fra gli estremi — la
  stessa saturazione già documentata più sotto in questa sezione, non una regressione nuova.
  Nessuna ulteriore azione: l'alternativa a bonus di varianza è già stata provata e scartata (vedi
  più sotto, "tentativo di un'alternativa"); resta lo slider per-decisione in Predizione come
  strumento più diretto, con l'effetto debole ormai atteso e documentato.
- **Segnalazione confermata e presa sul serio: "non funziona sui primi giocatori... vanno aspettati
  che almeno siano stati estratti un tot"**. Verificato: con zero vendite registrate, il prezzo di
  mercato atteso (p̂) di ogni ruolo è la curva teorica pura (nessun dato reale di QUESTA lega ancora
  disponibile, confidenza "bassa" per definizione) e dipende SOLO dal punteggio grezzo, non dalla
  tua titolarità personalizzata — quindi un giocatore con punteggio basso ma titolarità alta (per
  te) può avere un p̂ quasi a pavimento (1 credito) mentre il suo valore vero per te è alto: è
  proprio l'ingrediente che rende il meccanismo di "occasione" del punto sopra più aggressivo e più
  rumoroso a inizio asta, quando c'è meno da perdere nel fidarsi di quella stima. La sezione
  "confidenza bassa/media/alta" esisteva già in piccolo in fondo al pannello ma passava
  inosservata; **aggiunto un avviso più visibile** in cima al pannello di decisione quando la
  confidenza è "bassa" ("Prezzi di mercato ancora poco affidabili... possono sembrare incoerenti fra
  un giocatore e l'altro finché non se ne vendono un po' di più"). Non impedisce di usare l'app da
  subito (l'utente non ha chiesto di bloccarla, solo di capire perché sembra "impazzita" all'inizio)
  ma rende esplicito il motivo invece di lasciarlo indovinare.
- **Bug reale corretto: "non serve" per il piano matematico esatto non deve azzerare l'offerta se
  hai ancora slot liberi — segnalato dall'utente, con l'esempio del fix precedente ancora vivo**.
  Anche dopo il fix del punto successivo, l'utente ha segnalato che il problema persisteva: "non
  funziona, li mette tutti comunque nel primo... il ragionamento deve essere che, per un giocatore,
  al di là di quanto è forte, io provo a piazzarlo... va bene anche se ne ho quattro migliori da
  acquistare, perché poi quei quattro migliori li acquisterò... è inutile scrivere 'non serve': non
  serve rispetto a cosa?" Analizzando un'asta reale: con TUTTI e 8 gli slot D ancora liberi (zero
  posseduti — quindi "sicuramente prendo gli 8 migliori del pool" è l'ipotesi più fragile
  possibile), difensori discreti (score 62-71, su 175 candidati nel pool) risultavano SEMPRE "non
  serve". Causa: il piano ottimo esatto (§6.5-6.6) confronta "prendo questo giocatore" con "prendo
  la MIGLIOR combinazione possibile degli altri candidati del pool, tutti ottenibili al loro prezzo
  atteso" — un'ipotesi di CERTEZZA (nessuna concorrenza reale su quei candidati) che non regge in
  un'asta vera con altri 9 manager che li vogliono anche loro. Prima tappa (verifica, non ancora
  soluzione): controllato se la banda Monte Carlo (che dovrebbe già modellare questa incertezza)
  desse un'indicazione diversa — sì, ma in modo ROTTO: **trovato un secondo bug reale**, la banda
  indicava 333 crediti (quasi tutto il budget) con zero varianza su 2000 simulazioni per lo stesso
  difensore, perché il calcolo di fine orizzonte simulato assumeva SEMPRE di riuscire a riempire gli
  slot non ancora simulati con giocatori di qualità "filler" — **indipendentemente da quanti crediti
  restassero davvero** dopo aver speso una fortuna su un giocatore. Corretto in `rollout.ts`: la
  qualità del filler assunta ora scala con quanto budget-per-slot resta REALMENTE a fine simulazione
  rispetto a prima della decisione — per lo stesso difensore, la banda è scesa a un molto più
  sensato 101. **Soluzione principale**: quando ho ancora slot liberi in un ruolo (altrimenti "non
  serve" è un vincolo VERO, fisico, non un'ipotesi — resta cosi) e il piano esatto dice "non serve"
  solo per l'ipotesi di certezza sopra, si usa al suo posto una stima di copertura basata SOLO sui
  giocatori che possiedo già (nessuna ipotesi su chi prenderò in futuro) — per lo stesso difensore,
  "offri fino a" passa da 0 a 34. Un candidato genuinamente scarso resta "non serve": la copertura
  non forza un'offerta per chiunque, solo per chi le due stime (esatta e approssimata) valutano
  diversamente. Aggiunta anche una nota esplicita nel pannello "perché questo numero" quando scatta
  questo caso, perché altrimenti il numero "offri fino a" sembrerebbe contraddire la riga "se lo
  prendi → rosa finale X pt" appena sotto (che resta calcolata con l'ipotesi di certezza, per
  trasparenza — non nascosta, spiegata). Test aggiunti: 5 su una funzione dedicata (`applyHedge` in
  `engine.ts`, incluso uno con proprietà casuali) più un test end-to-end che verifica che un ruolo
  DAVVERO pieno resti "non serve" senza eccezioni.
- **Bug reale corretto: il "prossimo slot" era calcolato per QUANTI giocatori possiedi, non per
  QUANTO valgono — segnalato dall'utente**. "I calciatori che compro non sono in ordine per peso,
  quindi considerare il primo acquisto come diretto primo slot è sbagliato: un giocatore buono e
  titolare, anche se ne ho già presi molti altri in quel ruolo, è comunque ottimo potenzialmente
  come 7° o 8° slot preso a 1-2 crediti, è stupido lasciarlo." Verificato leggendo il codice: nel
  calcolo APPROSSIMATO del "peso ombra" (§6.6, `base-policy.ts`), il peso applicato al prossimo
  acquisto in un ruolo veniva scelto in base a QUANTI giocatori possiedi già in quel ruolo (un
  conteggio), non in base a dove il nuovo candidato si piazzerebbe DAVVERO per valore fra quelli
  già posseduti. Un giocatore ottimo trovato a poco prezzo dopo averne già comprati 6 mediocri nello
  stesso ruolo veniva quindi valutato con il peso minuscolo riservato al 7° slot (nei pesi di
  default, circa 0.03-0.05), come se non potesse mai scavalcare i mediocri già in rosa — esattamente
  il sintomo segnalato. **Buona notizia verificata**: il numero PRINCIPALE "offri fino a" che vedi
  in asta non aveva questo problema — la programmazione dinamica esatta (§6.5) ha sempre ordinato
  TUTTI i candidati, posseduti e no, per valore decrescente prima di assegnare i pesi, mai per
  ordine di acquisto. Il bug era isolato all'approssimazione più veloce usata per tre cose diverse:
  (1) la riga "perché questo numero?" nel pannello di spiegazione, (2) la banda Monte Carlo
  (Predizione, rollout), (3) il manager razionale del simulatore (Prova a secco e tutti gli
  strumenti diagnostici di questa sessione). **Corretto**: ora si tengono i valori reali dei
  giocatori già posseduti in quel ruolo (non quanti sono), ordinati dal migliore al peggiore, e si
  calcola dove il nuovo candidato si piazzerebbe DAVVERO in quella lista — esattamente la stessa
  logica già usata dalla DP esatta. Effetto verificato: sulla lega simulata, la quota di budget per
  ruolo si è spostata un po' (attaccanti giù, portieri su) — un effetto atteso di aver smesso di
  sottovalutare buoni giocatori "in ritardo" per un ruolo, non un nuovo problema. Test aggiunti in
  `test/base-policy.test.ts`, incluso uno con proprietà casuali che verifica che l'ORDINE con cui
  hai comprato i tuoi giocatori non cambi mai la valutazione di un nuovo candidato — solo il valore
  conta.
- **Instabilità della curva di prezzo in corso d'asta, ridotta (non eliminata) — trovato da un
  confronto con dati reali di mercato che l'utente ha allegato**. L'utente ha condiviso una pagina
  reale di Fantacalcio-Online ("i più comprati") e ha fatto notare un meccanismo concreto: a inizio
  asta i prezzi restano vicini alla quotazione ufficiale, poi via via che gli slot si riempiono si
  allontanano parecchio — un effetto reale e prevedibile (scarsità), non rumore. Ha chiesto di
  ragionarci e capire come ristrutturare l'algoritmo. Tracciando come cambiava la curva di prezzo
  (A_ρ, θ_ρ) ogni 25 estrazioni durante un'intera asta simulata, è emerso che il modello CAMBIA
  prezzo in corso d'asta, ma non nel modo giusto: l'intercetta di ruolo per gli attaccanti è arrivata
  a esplodere di **14 volte** il valore iniziale (da 1,21 a 16,73) e la ripidità della curva è
  crollata a un quarto, con 45 vendite reali osservate — un numero che non dovrebbe più produrre
  questa instabilità. Un attaccante buono mai venduto (score 81) passava da "offri fino a 17" a
  inizio asta a "offri fino a 0" (non conviene comprarlo a nessun prezzo) entro metà asta, pur avendo
  ancora uno slot libero per quel ruolo e crediti disponibili. **Causa, la stessa famiglia del bug di
  Meret già corretto ma non ancora sanata del tutto**: poche vendite reali concentrate in una fascia
  di punteggio stretta identificano male la vera pendenza della curva, e quella incertezza si scarica
  sull'intercetta, che oscilla parecchio — il modello contava solo QUANTE vendite aveva osservato,
  non QUANTO fossero disperse per punteggio, quindi 45 vendite strette venivano trattate con la
  stessa fiducia di 45 vendite ben distribuite. **Distinzione importante fatta con l'utente**: quello
  che lui descriveva (prezzi che si allontanano dalla quotazione per scarsità, mano a mano che
  l'asta avanza) è un effetto ECONOMICO reale, diverso da questo, che è invece RUMORE statistico —
  stesso sintomo superficiale ("i prezzi cambiano molto durante l'asta"), causa diversa. **Corretto**
  in `src/core/price-model.ts`: il peso dato ai dati osservati (rispetto al prior teorico/reale) ora
  dipende anche da quanto sono disperse le vendite per punteggio, non solo da quante sono — un
  campione di vendite tutte simili in punteggio riceve automaticamente meno fiducia. **Non è la
  soluzione completa**: sullo stesso caso osservato l'instabilità si riduce parecchio (l'intercetta
  non supera più circa 4-5× il prior, invece di 14×) ma non sparisce — è un problema statistico di
  fondo (con pochissime vendite reali per ruolo in una singola lega, ~30-80 in tutta l'asta, un po'
  di rumore resta strutturale), non un bug con una soluzione definitiva. Aggiunti test dedicati (uno
  con numeri fissi, uno con proprietà casuali) in `test/price-model.test.ts` che verificano
  esplicitamente che un campione concentrato in una fascia stretta resti più vicino al prior di uno
  sparso, a parità di numero di osservazioni — così un regresso futuro di questa protezione viene
  intercettato da un test che fallisce, non scoperto di nuovo da un'altra segnalazione utente.
- **Crediti non spesi nelle aste simulate, corretto (non del tutto) — trovato proseguendo
  l'indagine sul punto successivo**. Con lo strumento del punto successivo l'utente ha visto che i
  suoi acquisti simulati erano quasi tutti "overpay" secondo il motore esatto, ma ha poi notato il
  problema di fondo con un numero concreto: "simulando le aste siamo tra i 400 e i 450 crediti
  spesi, dovremmo spendere minimo 450, orientativamente 480-490". Analisi con un'asta reale
  tracciata giocatore per giocatore: all'ULTIMO slot dell'intera rosa, con 27 crediti di surplus
  reale su quell'unico slot rimasto, il modello calcolava ANCORA "candidato senza valore" e offriva
  il minimo (1 credito) — un meccanismo di "pressione a spendere" già esistente (`auction-sim.ts`,
  aggiunto in una sessione precedente proprio per questo problema) restava disattivato perché
  si attiva solo su candidati che il modello giudica già "utili", e quello no. **Causa profonda,
  collegata al ricalibro dei prior di prezzo di oggi stesso**: abbassare θ (voce successiva) ha
  alzato il "valore di un credito" a lega intera (λ) da ~1 a ~2.3, e siccome la formula che decide
  se un candidato è "utile" divide per questo numero, un λ più alto rende MOLTI PIÙ candidati
  "non utili" di prima — il fix di oggi ha involontariamente aggravato un problema già noto.
  **Un primo tentativo di correzione è stato provato e SCARTATO con numeri reali, non a intuito**:
  allargare il gate (far scattare la pressione a spendere anche su candidati "senza valore") ha
  PEGGIORATO i crediti non spesi invece di migliorarli (misurato: mediana 53→67 su un'asta reale) —
  perché spinge ANCHE i manager avversari "razionali" a rilanciare di più sugli stessi pochi
  giocatori marginali, e vincere una gara al rialzo più dura non equivale a spendere di più: spesso
  si perde comunque quel giocatore a un prezzo più alto pagato da un altro. **Il fix che ha
  funzionato**: lasciare il filtro "solo candidati utili" intatto, ma aumentare quanto la pressione
  a spendere pesa sui candidati che quel filtro lascia comunque passare. Risultato misurato: crediti
  non spesi mediani, su un'asta reale, da 51 a 17 (spesi ~483 su 500, dentro il range 480-490
  indicato) e, sull'intera lega simulata, da 137-146 a 33-40 — con miglioramento contemporaneo anche
  del prezzo più caro dell'asta (109→164-178, ora dentro la banda 120-260 attesa dalla specifica).
  **Non ancora perfetto**: nei casi peggiori si resta comunque intorno a 450-455 spesi (non sempre
  480-490), e altre due metriche collegate (quanti giocatori vengono venduti a 1 credito, quanti
  obiettivi di fascia alta vengono davvero acquisiti) restano fuori dalla banda attesa dalla
  specifica — non toccate da questo fix, stesso limite di fondo già descritto sotto (F7/F10).
- **Il "me" simulato nella Prova a secco non decide come il motore live — misurato, non solo
  sospettato**. Dopo il ricalibro dei prior di prezzo (voce successiva), l'utente ha continuato a
  trovare "strani" i crediti nelle aste simulate, soprattutto nella seconda metà, e ha chiesto un
  modo per VERIFICARLO invece di doversi fidare a intuito. Costruito uno strumento che applica lo
  stesso "Report asta" già usato per le aste vere (§2.8) a un'asta simulata, giocatore per
  giocatore: per ogni acquisto di "io" nella simulazione, confronta "offri fino a" calcolato dal
  motore ESATTO (`computeMaxBid`, bisezione, quello che vedi dal vivo) con quanto è stato davvero
  pagato dalla policy APPROSSIMATA che il simulatore usa internamente per tutti i manager, compreso
  "io" (`auction-sim.ts`, mai stata la stessa cosa fin dall'inizio, §9.3). Risultato misurato su più
  aste simulate reali: la divergenza è enorme e pervasiva, non un'eccezione — tipicamente 23-25
  acquisti su 23-25 totali risultano "overpay" secondo il motore esatto, e diversi di questi sono
  acquisti per giocatori che il motore esatto classifica `reason: 'not-useful'` (offerta massima
  ESATTAMENTE zero, "non vale la pena comprarlo a nessun prezzo"), pur con lo slot di ruolo ancora
  libero — la simulazione li compra comunque per pochi crediti. Il fenomeno non è concentrato solo
  nella seconda metà (compare fin dai primi giocatori), il che è di per sé un'informazione utile:
  non è "il motore regge finché ha budget e poi crolla", è che la policy approssimata del
  simulatore diverge da quella esatta per costruzione, in ogni fase. **Causa nota, non nuova**:
  questa policy approssimata include di proposito un "urgency boost" (aggiunto in una sessione
  precedente per evitare che le aste simulate finissero con troppi crediti inutilizzati) che spinge
  a comprare riempitivi anche quando il calcolo esatto direbbe di aspettare un'occasione migliore —
  un compromesso già accettato allora, ma il cui costo non era mai stato quantificato così
  direttamente. **Non ancora deciso se e come intervenire sulla policy del simulatore stesso**
  (rischia di reintrodurre il problema dei crediti inutilizzati che l'urgency boost risolveva): per
  ora lo strumento di misura è disponibile in Prova a secco → "Guarda un'asta simulata per intero"
  → "Il motore esatto avrebbe seguito questa simulazione?" (§2.7), incluso lo spacco 1ª/2ª metà, così
  puoi verificarlo tu stesso su qualunque asta simulata invece di doverti fidare di un numero
  aggregato che non spiega DOVE le cose divergono.
- **Prior di prezzo troppo ripidi su TUTTI i ruoli, ricalibrati con dati reali — trovato
  proseguendo l'indagine sul bug del portiere qui sotto**. Dopo il fix del segno (vedi la voce
  successiva), l'utente ha segnalato che il problema non era isolato a un portiere: "sono prezzi
  molto strani... se spendo così tanto per pochi giocatori poi non c'ho più niente per gli altri
  slot". Analizzando la sua asta reale aggiornata su tutti e 4 i ruoli, non solo i portieri: un
  attaccante a punteggio 94 riceveva un "offri fino a" di 132 crediti e un prezzo di mercato
  stimato di 269, con solo 2 vendite reali osservate in quel ruolo (il modello si affidava quindi
  per l'88% al θ teorico di ruolo, mai validato). Simulando "seguo alla lettera le 4 offerte più
  alte, una per ruolo" si esaurivano 283 crediti su 355 disponibili, lasciandone 72 per i restanti
  19 slot — esattamente il sintomo segnalato. L'utente ha poi fornito un file Excel con le
  quotazioni reali di Fantacalcio-Online (573 giocatori di Serie A). Incrociando per nome 396 di
  quei giocatori con i punteggi che l'utente aveva assegnato loro nel proprio listone, e rifittando
  con la stessa regressione robusta già in produzione (§6.3.3): il θ reale risulta **~2-2.5× più
  basso** di quello teorico su TUTTI i ruoli (es. θ_A: 10.1 teorico → 4.02 reale), in modo
  sorprendentemente uniforme — segno che l'errore non era specifico a un ruolo ma al METODO con cui
  i θ originali erano stati derivati (teoricamente, dal rapporto fra prezzo del top e prezzo
  marginale, mai controllato contro un'asta vera). Conferma indipendente notevole: un vecchio
  tentativo di ricalibrazione via self-play (mai completato, documentato più sotto) aveva già
  trovato per conto proprio θ_A→3.4 con un metodo completamente diverso (equilibrio fra bot
  simulati, non dati reali) — due strade indipendenti che convergono nella stessa direzione è una
  conferma forte, non una coincidenza. **Corretto** sostituendo i valori teorici di default
  (`DEFAULT_THETA`/`DEFAULT_A` in `src/core/config.ts`) con quelli fittati sui dati reali. Effetto
  collaterale onesto da segnalare: il "valore di un credito al margine" (λ, mostrato internamente
  nei calcoli) è salito da ~1.0 a ~2.3 punti/credito — una conseguenza diretta e non evitabile della
  correzione (non un effetto regolabile a parte), che rende obsoleta la vecchia regola pratica "1
  credito ≈ 1 fantapunto" citata nella specifica tecnica. Verificato che questo non è casuale: i
  mercati reali di fantacalcio sono noti per essere poco efficienti a fine asta (molti buoni
  giocatori restano a 1-2 crediti), quindi un margine più ampio è plausibile, non un campanello
  d'allarme. Test aggiornati di conseguenza in `test/plan-dp.test.ts` e `test/sim.test.ts`, con
  commenti che spiegano perché i vecchi numeri non erano più quelli giusti. **Limite onesto**: le
  quotazioni usate come base sono un indice di mercato generale del sito, non i prezzi medi
  realmente pagati nella tua specifica configurazione di lega (10 squadre/500 crediti) — un
  ricalibro futuro con dati ancora più mirati (prezzi medi reali per quella configurazione,
  disponibili sullo stesso sito ma non estratti in blocco in questa sessione per limiti tecnici di
  affidabilità dello scraping) potrebbe affinare ulteriormente questi numeri. Dettagli completi in
  `readme.md` §6.5 e §6.3.1.
- **Bug reale nel modello di prezzo, corretto — trovato da un'asta vera dell'utente, non da un
  test**. Segnalato così: "il portiere del Napoli, score 83, rimasto libero dopo che i 5 migliori
  erano già stati venduti a poco (10-40 crediti), mi risultava 'offri fino a 118' — non ha senso."
  Riprodotto esattamente con l'export JSON di quell'asta: la regressione online che stima il
  prezzo dal proprio ruolo (§6.3.3) aveva ricevuto solo 6 vendite di portieri, tutte concentrate in
  una fascia di punteggio strettissima (86-95 su 100) e con prezzi bassi e NON correlati allo
  score (il più alto in punteggio, 94, era stato il più economico, 10 crediti). Su un campione così
  piccolo e stretto, la pendenza grezza della regressione usciva **negativa** (-9.3): "punteggio
  più alto, prezzo più basso". Poiché pendenza e intercetta sono statisticamente legate quando lo
  score varia poco nel campione, l'intercetta esplodeva per compensare (equivalente in scala
  lineare a un prezzo base di oltre 100.000 crediti), e questo valore assurdo sopravviveva persino
  alla miscela con il prior di default (che pesa per il 71% quando le osservazioni sono poche) —
  risultato: un prezzo PREVISTO di 313 crediti per uno score di 95 e ancora 106 per uno score di
  50, l'esatto contrario di quello che un prezzo dovrebbe fare (§6.3.1 definisce θ_ρ — quanto il
  prezzo cresce con lo score — come sempre ≥ 0 per costruzione: non può mai scendere). **Corretto**
  impedendo alla pendenza grezza di uscire negativa (si riporta a 0 — "nessuna relazione affidabile
  in questo campione", non "il prezzo scende con lo score" — e si ricalcola l'intercetta in modo
  coerente come media pesata dei prezzi osservati, non lasciando l'estrapolazione distorta).
  Verificato sui numeri reali di quell'asta: "offri fino a" per quel portiere è sceso da 118 a 87.
  **Non è però la soluzione completa, e va detto chiaramente**: anche corretto il segno, il prezzo
  resta più alto di quanto i 6 prezzi realmente osservati (10-40 crediti) suggerirebbero, perché con
  così poche osservazioni il modello si affida ancora per il 71% al prior teorico di ruolo (θ_P=7.1
  di default) — un valore calcolato dalla specifica in astratto, mai validato contro dati reali di
  un'asta vera (stesso problema, mai risolto, della ricalibrazione self-play F7 già documentata più
  sotto). Se il tuo campionato tratta i portieri sistematicamente "a poco" rispetto a quel prior,
  l'"offri fino a" resterà probabilmente più alto del dovuto finché non ci sono più vendite di
  portieri a punteggi più vari (non solo quelli fra 86 e 95) a correggere la stima. Test di
  regressione con i numeri reali di questa scoperta in `test/price-model.test.ts` (incluso un test
  property-based che verifica che la pendenza non sia mai negativa, per qualunque campione).
- **Bug nel calcolo live, corretto**: se il TUO ruolo era già completamente pieno (tutti gli slot
  occupati, es. hai già 8/8 difensori) e valutavi un nuovo giocatore dello stesso ruolo con un
  punteggio più alto del tuo peggiore già posseduto, l'app suggeriva un "offri fino a" positivo
  invece di "non serve" — come se potessi scambiare in silenzio uno slot già occupato con uno
  nuovo, cosa impossibile in un'asta reale (non hai più spazio in rosa). Trovato con la nuova
  infrastruttura di test descritta in `readme.md` ("Testare la UI senza rifare un'asta intera a
  mano"), non con un'asta a mano — proprio l'esempio pratico di perché vale la pena usarla.
  Corretto e coperto da test di regressione.
- **Riorganizzazione in otto schermate**: la vecchia schermata "Asta" faceva troppe cose insieme
  (registrazione, predizione estesa, rosa avversari, mia rosa) — ora la registrazione veloce (Banco
  d'asta) e l'analisi approfondita (Predizione) sono separate, e "chi ha preso cosa" ha finalmente
  un posto dedicato per ogni fantallenatore (Fantallenatori) e per la propria rosa con controllo
  manuale degli slot (La mia rosa). Novità nel modello dati: un giocatore può essere rimesso in
  circolo (`revert`, usato sia da "Riproponi" sui non-acquistati sia da "Correggi"/"Rimetti in
  asta" su una vendita), può essere segnato come obiettivo personale indipendente dal punteggio
  (★), e l'ordine degli slot in rosa è manuale e persistente, non più implicito nell'ordine
  d'acquisto. Semplificazioni consapevoli rispetto al design originale: niente scorciatoie da
  tastiera per scegliere il manager e niente scelta obbligata dello slot ad ogni singolo acquisto
  (vedi §2.2) — entrambe avrebbero rallentato la registrazione dal vivo più di quanto valessero.
- Il modello che riassume il valore di una rosa in poche formule (usato dentro il calcolo
  principale) spiega circa l'84% della variabilità reale invece del 97% teorico auspicato dalla
  specifica — non inficia la logica delle decisioni, ma i numeri assoluti mostrati vanno letti
  come **buone stime**, non come verità matematiche esatte al fantapunto.
- Il simulatore usato per le prove interne (non la Prova a secco, che usa la tua lista reale)
  ancora non riproduce del tutto la distribuzione dei prezzi di un'asta reale (qualche vendita
  resta più economica o più cara del plausibile). Un bug concreto che causava questo — il motore
  "si bloccava" e smetteva di rilanciare seriamente su qualunque giocatore non appena il proprio
  piano d'acquisto risultava già affrontabile, molto prima della fine dell'asta — è stato trovato e
  corretto (miglioramento verificato: il motore ora sfrutta molto meglio il budget residuo contro
  avversari sintetici). Un margine di scostamento resta, documentato nel codice e nei test. Questo
  riguarda gli **strumenti di test interni**; la logica che vedi in asta (tetto avversari, p\*, la
  banda del rollout) usa in parte lo stesso meccanismo corretto e ne beneficia direttamente.
- **Crediti non spesi a fine asta, aggiornamento**: un utente ha segnalato aste simulate che
  finivano con circa 300 crediti su 500 (60%) inutilizzati, molto oltre il realistico. Trovate e
  corrette **due cause concrete**: (1) il bug del "blocco" descritto sopra, che azzerava le offerte
  ben prima della fine dell'asta; (2) il parametro **rischio** (§2.1), aggiunto alla configurazione
  ma **mai realmente collegato** ai calcoli — veniva salvato ma nessuna formula lo leggeva. Corretto
  in tutti e 4 i punti dove viene usato (decisione live, banda del rollout, Prova a secco,
  simulatore interno). Dopo i fix, sulla lista reale inclusa nell'app i crediti non spesi sono scesi
  dal 20–67% osservato prima al 5–23% circa, a seconda del seed casuale — un netto miglioramento, ma
  **non ancora stabilmente sotto la soglia ideale del 10%** indicata dalla specifica in ogni singola
  simulazione. Verificalo tu stesso con `npx tsx src/sim/cli.ts bench 200`.
- **Realismo degli avversari nella Prova a secco, aggiornamento con un compromesso onesto**. Fino a
  poco fa, i 9 avversari simulati condividevano l'80% della TUA classifica (parametro `rho`, mai
  visibile) e usavano SEMPRE una delle 6 euristiche "irrazionali" (§9.2), in una disposizione fissa
  identica in tutte le 200 aste — mai un avversario genuinamente razionale, mai un mix che varia da
  un'asta all'altra. Corretto: ogni avversario ora parte dai TUOI punteggi e li perturba di un
  jitter casuale (±10 punti di score, indipendente per giocatore), il mix di archetipi è rimescolato
  ad ogni asta e include una quota di avversari genuinamente razionali (~20%, non solo tu).
  Misurato sullo stesso listone reale, prima/dopo: i **crediti non spesi migliorano nettamente**
  (mediana 69→35, p90 193→64), ma la **spesa per ruolo si allontana dalla quota attesa** per
  difensori e attaccanti (D 18%→32%, A 48%→26%, contro un atteso 15%/50%) — un risultato NON
  interamente positivo, riportato così com'è. Causa più probabile: gli avversari razionali, a
  differenza delle euristiche precedenti (che pagano multipli del prezzo di mercato atteso), offrono
  in base al proprio VALORE calcolato (§6.1) — e quel valore differenzia i ruoli molto meno
  (attaccante ~8-12% sopra centrocampista ai punteggi più alti) di quanto il modello di prezzo si
  aspetti che il mercato paghi per loro (50% contro 30% di quota budget). Con avversari
  genuinamente razionali in gioco, questo scarto (già ipotizzato in una conversazione precedente
  sui "pesi per ruolo", mai misurato fino ad ora) diventa visibile nei numeri aggregati. Non
  ritoccato ulteriormente in questa sessione per evitare di ritarare una costante alla cieca finché
  il numero non "sembra giusto" — la prossima mossa naturale, se si vuole chiudere questo scarto, è
  proprio il meccanismo di peso-per-ruolo discusso allora, non un altro numero a caso qui.
- **Peso per ruolo, implementato — con un comportamento reale ma non ovvio, verificato prima di
  darlo per buono**. Come annunciato nel punto sopra: aggiunto un moltiplicatore personale per
  ruolo (Setup lega, §2.1), applicato SOLO al proprio valore/DP (mai al modello di prezzo — stessa
  scelta già fatta per il rischio, §6.8). Verificando l'effetto su un'asta reale a metà (fixture
  interna), è emerso che **l'effetto non è uniforme**: per il MIGLIOR attaccante ancora disponibile,
  alzare il peso di A da 1 a 2.5 ha portato "offri fino a" da 93 a 137 (in su, come atteso); per un
  attaccante mediocre con alternative migliori nel pool, lo stesso cambiamento ha portato "offri
  fino a" da 2 a 1 (in GIÙ). Non è un bug: il valore grezzo del candidato raddoppia comunque
  esattamente per il peso — ma la DP ora valuta ANCHE le alternative dello stesso ruolo con lo
  stesso peso più alto, quindi il costo-opportunità di accontentarsi di un giocatore mediocre in un
  ruolo che vale di più sale ancora di più. In pratica: il peso per ruolo ti fa inseguire i MIGLIORI
  di quel ruolo con più aggressività, non spendere di più per chiunque ci giochi. Documentato in UI
  (Setup) e qui prima che qualcuno lo scambiasse per un errore. Test di regressione per entrambi i
  casi (migliore e mediocre) in `test/engine.test.ts`.
- **Pesi di slot personalizzabili + visualizzatore di un'asta simulata singola, implementati e
  auditati**. I due filoni rimasti aperti dai punti precedenti. I pesi di slot (Setup §2.1) usano lo
  stesso principio del peso per ruolo (solo il proprio valore/DP, mai il modello di prezzo) ma
  cambiano la FORMA dentro al ruolo invece che la sua importanza — verificato concretamente sul caso
  che li ha motivati ("due portieri titolari a rotazione"): con i pesi di default (2° portiere
  scontato all'11% del 1°), offrire per un secondo portiere quasi pari al primo rende una frazione
  minima del tetto disponibile; con pesi personalizzati "due titolari comparabili" (es. 0.5/0.45/0.05
  invece di 0.87/0.11/0.02), lo stesso identico candidato vale sensibilmente di più — misurato,
  non solo ipotizzato (`test/engine.test.ts`). Il visualizzatore (Prova a secco) riusa esattamente lo
  stesso motore della simulazione aggregata, un solo seed alla volta.
  **Audit di robustezza richiesto esplicitamente prima di considerarli finiti**: nessun bug reale
  emerso, ma diversi casi limite meritavano un test esplicito invece di essere solo "probabilmente a
  posto" — pesi di slot tutti a zero per un ruolo, zero slot per un ruolo, peso per ruolo al massimo
  consentito insieme a pesi di slot personalizzati, una config con lunghezze di array disallineate
  costruita apposta (slot cambiati dopo aver personalizzato i pesi, il caso più realistico di errore
  utente) — tutti verificati non lanciare mai un errore e non produrre mai NaN/Infinity, con un test
  property-based aggiuntivo (`fast-check`) su combinazioni casuali di peso per ruolo e forma dei pesi
  di slot. La protezione tecnica dietro tutto questo è `normalizeSlotWeights` (`src/core/config.ts`):
  applicata sia nella UI di Setup sia difensivamente in ogni punto del motore che legge
  `config.slotWeights`, così una config salvata prima che questo controllo esistesse — o con slot
  cambiati dopo aver personalizzato i pesi — non fa mai esplodere la DP (che altrimenti lancerebbe un
  errore su lunghezze disallineate, §13.3) invece di limitarsi ad adattarsi.
- **Rischio/aggressività: effetto reale ma volutamente contenuto, non una leva "tutto o niente"**.
  Stesso utente ha notato che il parametro rischio, anche al massimo (+1), non produce una squadra
  visibilmente più "da fenomeni". Verificato con misure su 20 aste simulate sulla lista reale: il
  rischio sposta davvero la valutazione interna dei giocatori (la specifica lo implementa
  aumentando la "convessità" della curva punteggio→rendimento atteso, §6.8 del `readme.md`), ma
  l'effetto sulla squadra REALMENTE comprata è debole e non sempre coerente in una singola asta —
  il rumore della singola simulazione (chi estrae chi, gli avversari sintetici) pesa quanto o più
  del segnale del rischio. Non è un problema risolvibile alzando semplicemente una costante: è stato
  provato (moltiplicatore raddoppiato) e il risultato è diventato **meno** prevedibile, non di più,
  segno che il meccanismo approssimato ammesso dalla specifica satura oltre un certo punto invece di
  scalare linearmente. Lasciato al valore di specifica; consulta `src/core/config.ts`
  (`DEFAULT_RISK_CONFIG`) per i dettagli. Per un controllo più diretto e immediato sull'aggressività,
  usa il nuovo **slider per-decisione** in Predizione (§2.6): scavalca il rischio di lega per un
  singolo giocatore, un effetto molto più visibile perché lo decidi tu direttamente, invece di
  aspettare che una formula interna lo deduca da un solo numero globale.
- **Rischio, tentativo di un'alternativa: provata e non adottata, per una ragione istruttiva**. La
  letteratura di ricerca operativa conferma che "scegliere una rosa sotto vincolo di budget
  massimizzando valore atteso più rischio × deviazione standard" è un problema NP-hard riconosciuto
  (ottimizzazione di portafoglio media-varianza con vincolo di cardinalità) — nessuna formula chiusa
  lo risolve davvero. Come esperimento, è stata implementata un'alternativa più letterale alla
  formula di specifica: invece di distorcere la curva punteggio→rendimento, un bonus/malus additivo
  proporzionale alla varianza Bernoulliana del singolo candidato (quanto è incerta la sua
  titolarità), calcolabile senza simulazioni (`riskAdjustedPlayerValue`/`seasonSdProxy` in
  `src/core/value-model.ts`, disponibile ma NON attiva di default). Misurata su 20 aste appaiate
  sullo stesso listone e sugli stessi seed del meccanismo attuale: la nuova idea sposta davvero la
  titolarità media nella direzione attesa, ma solo nel 55% delle aste singole (11/20) — sopra il
  caso ma ben lontano da una soglia di affidabilità dell'75% fissata PRIMA di guardare i numeri, e
  peggiore del meccanismo attuale (10/20) sul punteggio medio, che addirittura SCENDE con più
  rischio invece di salire (i candidati "tutto o niente" nel listone reale hanno tipicamente
  punteggio medio, non altissimo). **Non sostituita**, per due motivi entrambi utili da capire:
  primo, non ha superato la soglia che ci si era dati in anticipo; secondo, e più interessante,
  conferma che "cercare varianza" nel senso preciso della teoria di portafoglio non è la stessa
  cosa di "punta ai top" che ci si aspetterebbe intuitivamente da un cursore di "aggressività" — la
  formula di specifica ottimizza davvero un'altra cosa. Il codice resta nel progetto, testato e
  documentato, come base per chi volesse riprendere il problema con un'idea diversa.
- **"Ruoli segnalati" in Prova a secco, corretto**: la logica confrontava ogni ruolo con una soglia
  fissa (punteggio ≥70) e con la media degli ALTRI ruoli — ma un attaccante ha per natura una
  distribuzione di punteggi diversa da un centrocampista (pochi fenomeni, molte riserve), quindi
  quel confronto lo segnalava quasi sempre anche quando non c'era nulla di sbagliato nella
  simulazione. Ora la soglia e la media di riferimento sono calcolate PER RUOLO, sulla tua stessa
  lista (vedi §2.7).

Nessuno dei punti sopra richiede un'azione da parte tua, tranne — se vuoi — provare lo slider
per-decisione in Predizione quando vuoi essere più o meno aggressivo su un giocatore specifico. Il resto
sono limiti di calibrazione interna, documentati nel codice e nei test per chi volesse approfondire
o proseguire lo sviluppo.

**Radicamento teorico** (per chi volesse approfondire, senza che cambi nulla nell'uso pratico): λ
(§3, il valore di un credito in più) è quello che la programmazione lineare chiama uno "shadow
price" — con l'avvertenza che per problemi discreti come uno zaino (un giocatore lo compri intero,
non a frazioni) questa nozione ha "buchi" teorici noti, che sono la spiegazione di fondo di un bug
di plateau trovato e corretto in una sessione precedente, non un caso isolato di questo progetto
(vedi il commento sopra `marginalValue` in `src/core/plan-dp.ts`). L'idea che il primo slot di un
ruolo valga più dell'ottavo (§6.2 del `readme.md`) è imparentata con un problema classico della
ricerca operativa, il "Sequential Stochastic Assignment Problem" (Derman-Lieberman-Ross, 1972) — con
la precisazione onesta che quel problema non modella prezzi né concorrenza fra acquirenti, quindi è
solo una validazione concettuale, non la fonte dei numeri usati (vedi il commento sopra
`DEFAULT_SLOT_WEIGHTS` in `src/core/config.ts`).

---

## 8. E per un'asta a busta chiusa?

Questo programma è pensato per un'asta **a rialzo** (§13 del `readme.md`): un giocatore alla volta,
offerte a voce, prezzo che sale finché resta un solo offerente. Un'asta **a busta chiusa** — ogni
manager scrive un numero senza vedere le offerte altrui, vince il più alto, e **paga esattamente
quello che ha scritto** (non quanto offerto dal secondo, come nell'asta a rialzo) — è un meccanismo
diverso, e la risposta onesta è: **una parte del motore si applica pari pari, un'altra no.**

**Cosa si applica senza modifiche:**

- Il **modello di valore** (punteggio → fantamedia/titolarità → punti attesi, §2.3/§6.1): dice
  quanto vale un giocatore *per te*, a prescindere da come si svolge l'asta.
- Il **tetto avversari esatto** (§2.2/§2.6, §6.4): fra un turno e l'altro, budget e slot residui di ogni
  manager restano pubblici esattamente come in un'asta a rialzo (si scoprono quando le buste si
  aprono), quindi questo calcolo resta valido turno dopo turno.
- La **programmazione dinamica sulla tua rosa** (§6.5): "cos'è il piano ottimo per i crediti/slot
  che mi restano" non dipende da come si decide il prezzo di UN singolo giocatore — è sempre la tua
  stessa ottimizzazione, a prescindere dal meccanismo d'asta.

**Cosa invece NON si può riusare così com'è: il numero "OFFRI FINO A" stesso.** Nell'asta a rialzo,
p\* è il tuo tetto MASSIMO perché in pratica paghi solo quanto basta per battere il secondo
offerente (ecco perché lo schermo mostra sempre "prezzo atteso" e "offri fino a" come due numeri
distinti). In una busta chiusa **paghi sempre esattamente quello che scrivi**: scrivere il tuo vero
valore massimo (p\*) è una strategia PEGGIORE, non equivalente — la teoria dei giochi la chiama
"bid shading": conviene scrivere un numero PIÙ BASSO di quanto il giocatore vale davvero per te,
tanto più quanta più concorrenza ti aspetti su quel giocatore. Quanto più basso dipende da come
stimi le offerte altrui — un calcolo che oggi il programma non fa (il modello di prezzo online,
§6.3, impara dai prezzi REALIZZATI di un'asta a rialzo, non dalla distribuzione di offerte
nascoste di una busta chiusa).

**In pratica**, se un giorno servisse una "modalità busta chiusa": il motore di valutazione/rosa
(la parte più complessa e già rigorosamente testata) si riuserebbe quasi integralmente, ma
servirebbe una formula NUOVA per "quanto scrivere in busta" a partire dal tetto già calcolato — non
un'estensione del Banco d'asta attuale. Non l'ho costruita perché è un pezzo di teoria dei
giochi distinto, non una variazione della UI: se ti interessa davvero, vale la pena discuterne il
disegno a parte prima di scrivere codice.
