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

## 2. Le cinque schermate

### 2.1 Setup lega

La prima cosa da fare. Configura:

- **Manager**: quanti partecipanti (default 10), il primo è sempre "Io", gli altri prendono i nomi
  che scrivi (utile per il pannello avversari durante l'asta).
- **Budget e slot**: crediti iniziali (default 500) e slot per ruolo (default 3 P, 8 D, 8 C, 6 A =
  25 totali). Se li cambi, verifica che il totale di lega torni (il programma non lo impedisce, ma
  i numeri del motore assumono che le regole siano quelle della tua lega reale).
- **Moduli ammessi** e modulo primario: usati dal motore per calcolare quanti titolari "contano"
  per ruolo (vedi §3.5).
- **Rischio**: da −1 (punta alla rosa più sicura in media) a +1 (punta a rose con più varianza,
  utile in leghe dove arrivare secondi vale poco). Default +0.15. Agisce davvero sui calcoli: un
  rischio più alto rende il motore un po' più aggressivo sui giocatori di fascia alta rispetto alla
  media del ruolo, uno più basso lo rende più prudente/piatto — ma è un effetto voluto **modesto**,
  non una leva che ti fa comprare una squadra di soli campioni: vedi §7 per i numeri e i limiti
  misurati. Questo è il valore di **default per tutta l'asta**; puoi comunque scavalcarlo per una
  singola decisione dalla schermata Asta (vedi §2.3).

Puoi tornare qui in qualsiasi momento per correggere la configurazione: i punteggi e le vendite già
registrate non vengono perse.

Accanto al form trovi una **checklist pre-asta** sempre aggiornata (setup completo, listone
caricato, quanti punteggi hai assegnato, promemoria per la prova a secco e per verificare un
export) e un riepilogo dei limiti noti del programma (vedi §7) — utile come lista di controllo
finale prima di andare in asta, senza dover scorrere tutto il manuale.

### 2.2 Lista giocatori

Qui prepari la lista **prima** dell'asta (e la aggiorni **durante**, se serve).

- **Carica listone**: al primo utilizzo, carica il listone Serie A incluso nell'app (502
  giocatori, raccolto ad agosto 2026). **Va verificato e aggiornato a ridosso della tua asta
  reale** (vedi §5): il mercato estivo cambia le rose fino a poche settimane prima del campionato.
- **Punteggio (0–100)**: per ogni giocatore, quanto è forte **quando gioca** — non quanto gioca. È
  il programma che deduce la probabilità di titolarità dal punteggio secondo curve tarate per
  ruolo. Se un giocatore è forte ma gioca poco (o il contrario: gioca sempre ma non incide), usa
  l'**override titolarità** invece di alterare il punteggio.
- **Filtri**: per ruolo, squadra, testo libero, o "solo senza punteggio" per completare la lista
  metodicamente.
- **Scarica template CSV**: genera un file di esempio con l'intestazione e il formato esatto
  richiesto, da riempire con un foglio di calcolo (Excel, Google Sheets, ecc.) e poi reimportare.
  Comodo per preparare tutti i punteggi con calma prima dell'asta, invece che riga per riga nella
  tabella qui sotto.
- **Importa CSV** (`nome,ruolo,squadra,punteggio,titolarita`): aggiorna il listone mantenendo i
  punteggi già assegnati in precedenza (abbina per nome — rinominare uno stesso giocatore in modo
  molto diverso può far perdere l'abbinamento, controlla dopo l'import). Le ultime due colonne sono
  **opzionali**: se le compili, importi direttamente anche punteggio (0–100) e un eventuale override
  di titolarità (0–1) insieme al giocatore, senza doverli assegnare uno a uno nella tabella. Lasciale
  vuote per i giocatori che vuoi valutare più avanti.
- **Aggiungi giocatore**: per un giocatore estratto in asta ma assente dal listone. Pensato per
  essere immediato (nome, squadra, ruolo, invio) da usare anche a voce alta con l'asta in corso.

Il contatore in alto mostra quanti giocatori hai valutato per ruolo: più ne valuti (soprattutto i
primi 40–50 per ruolo, quelli che verranno davvero contesi), più il motore sarà preciso.

### 2.3 Asta — la schermata che conta

Si usa **durante** l'asta vera. Per ogni giocatore estratto a voce:

La schermata è divisa in tre colonne: a sinistra il giocatore estratto e gli eventuali allarmi di
scarsità, al centro il pannello decisionale, a destra gli avversari e la tua rosa — così hai tutto
sott'occhio senza dover scorrere.

1. **Cerca il giocatore** nella barra in alto (nome o squadra) e selezionalo.
2. Subito sopra il numero grande trovi **Aggressività per questo giocatore**: uno slider identico a
   quello di Setup lega, ma che vale **solo per questo giocatore**. Di default segue il rischio
   impostato in Setup lega ("di lega"); spostalo per questa singola decisione (es. per rincorrere un
   obiettivo preciso, o per essere più prudente su uno slot marginale) senza cambiare la
   configurazione di lega per il resto dell'asta. "ripristina" torna al valore di lega. Si azzera
   automaticamente ad ogni nuovo giocatore estratto.
3. Compare il **pannello decisionale**:
   - **OFFRI FINO A**: il numero gigante al centro, calcolato in meno di 100ms — è la cifra oltre la
     quale, secondo la tua lista, **comprare peggiora la rosa finale**. Se dice "non serve" il
     pannello diventa arancio: significa che il giocatore non migliora la rosa nemmeno gratis
     (occuperebbe uno slot meglio usato).
   - **banda**: arriva poco dopo, sotto il numero (calcolata in un Web Worker, non blocca
     l'interfaccia) ed è una stima più prudente basata su migliaia di aste simulate a partire da
     questo istante — tiene conto del fatto che i piani futuri potrebbero sfumare.
   - **scala dei prezzi**: la barra visuale sotto il numero mostra a colpo d'occhio dove cadono
     prezzo atteso, "offri fino a" e tetto avversari sulla stessa scala.
   - **prezzo atteso**, **tetto avversari** e **secondo tetto**: tre riquadri con i numeri esatti.
     Il prezzo atteso è quanto probabilmente costerà davvero (diverso da "fino a quanto conviene
     offrire": sono due domande distinte, mostrate sempre entrambe). Il tetto avversari è il
     massimo che l'avversario più ricco in quel ruolo può fisicamente offrire (aritmetica esatta:
     crediti residui meno gli slot ancora da riempire) — se è **0** il riquadro diventa verde e il
     giocatore è **tuo garantito al prezzo minimo**, evidenziato anche da un banner sopra il
     pannello: sono le occasioni più redditizie dell'asta. Il secondo tetto è chi fissa davvero il
     prezzo in un'asta a rialzo (il primo offerente non paga mai più del secondo).
   - **"perché questo numero?"**: espandibile, mostra la catena di calcolo in 4 passi (peso dello
     slot, valore per te, valore ombra del ruolo, stima rapida) — una spiegazione semplificata, il
     numero esatto sopra viene comunque dalla programmazione dinamica completa.
   - **alternative** e **allarme scarsità**, nella colonna di sinistra: chi resta disponibile nel
     pool per quel ruolo, per capire se puoi permetterti di lasciarlo andare.
4. **Registra l'acquisto** ("Chi l'ha preso?"): tocca il manager che lo ha preso (griglia di
   pulsanti grandi), scrivi il prezzo, Invio. Due tocchi più un numero, come richiesto per stare al
   passo con un'asta a voce.
5. **Non venduto**, se nessuno lo prende.
6. **Annulla ultimo** (undo, sempre visibile in alto): corregge un errore di battitura senza dover
   ricostruire lo stato a mano. Puoi annullare quante volte serve, anche a ritroso nel tempo.
7. **Override manuale**: se vuoi forzare un massimo diverso da quello calcolato (es. per un motivo
   che il modello non conosce), resta comunque registrato nel log.

Nella colonna di destra, sempre visibili: il **pannello avversari** (crediti, slot residui, tetto,
ordinati dal più pericoloso) e la **tua rosa** (chi hai preso, a che prezzo, slot mancanti per
ruolo).

### 2.4 Prova a secco

Da usare **prima** dell'asta, per tarare i punteggi. Assegna un po' di punteggi in Lista
giocatori, poi lancia la Prova a secco: gira 200 aste simulate sulla tua lista reale (con
avversari sintetici ma plausibili) e mostra la rosa attesa per ruolo, il valore di stagione medio
atteso, e segnala (⚠, "ruoli segnalati") i ruoli dove perdi sistematicamente i tuoi obiettivi
migliori **per quel ruolo**, o dove lo score medio dei giocatori acquisiti è molto più basso della
media della TUA lista per quello stesso ruolo. Il confronto è sempre **con il ruolo stesso**, mai
fra ruoli diversi: un attaccante ha per natura pochi "fenomeni" assoluti e molte riserve rispetto,
ad esempio, a un centrocampista, quindi non ha senso giudicarlo con lo stesso metro — farlo avrebbe
segnalato quasi sempre l'attacco anche quando non c'era nulla di storto (bug corretto: prima la
soglia di "obiettivo di fascia alta" era fissa a 70 per tutti i ruoli e il confronto era contro la
media incrociata degli altri ruoli). Se un ruolo resta segnalato, è un indizio concreto che vale la
pena ricontrollare quegli score, non un allarme generico. Impiega pochi secondi.

Oltre alle medie aggregate, la schermata mostra anche **rose finali di esempio**: tre squadre
REALMENTE formate dalle simulazioni (una "sfortunata", una "tipica" e una "fortunata", per valore
finale) con ogni giocatore, prezzo e score — per farti vedere concretamente il ventaglio di esiti
possibili, non solo un numero medio.

### 2.5 Report asta

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

1. **Aggiorna il listone**: scarica il template CSV da Lista giocatori, compilalo (anche con
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
npm test                          # tutti i test automatici (155, dovrebbero passare tutti)
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

- **Bug nel calcolo live, corretto**: se il TUO ruolo era già completamente pieno (tutti gli slot
  occupati, es. hai già 8/8 difensori) e valutavi un nuovo giocatore dello stesso ruolo con un
  punteggio più alto del tuo peggiore già posseduto, l'app suggeriva un "offri fino a" positivo
  invece di "non serve" — come se potessi scambiare in silenzio uno slot già occupato con uno
  nuovo, cosa impossibile in un'asta reale (non hai più spazio in rosa). Trovato con la nuova
  infrastruttura di test descritta in `readme.md` ("Testare la UI senza rifare un'asta intera a
  mano"), non con un'asta a mano — proprio l'esempio pratico di perché vale la pena usarla.
  Corretto e coperto da test di regressione.
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
  usa il nuovo **slider per-decisione** nella schermata Asta (§2.3): scavalca il rischio di lega per
  un singolo giocatore, un effetto molto più visibile perché lo decidi tu direttamente, invece di
  aspettare che una formula interna lo deduca da un solo numero globale.
- **"Ruoli segnalati" in Prova a secco, corretto**: la logica confrontava ogni ruolo con una soglia
  fissa (punteggio ≥70) e con la media degli ALTRI ruoli — ma un attaccante ha per natura una
  distribuzione di punteggi diversa da un centrocampista (pochi fenomeni, molte riserve), quindi
  quel confronto lo segnalava quasi sempre anche quando non c'era nulla di sbagliato nella
  simulazione. Ora la soglia e la media di riferimento sono calcolate PER RUOLO, sulla tua stessa
  lista (vedi §2.4).

Nessuno dei punti sopra richiede un'azione da parte tua, tranne — se vuoi — provare lo slider
per-decisione in asta quando vuoi essere più o meno aggressivo su un giocatore specifico. Il resto
sono limiti di calibrazione interna, documentati nel codice e nei test per chi volesse approfondire
o proseguire lo sviluppo.

---

## 8. E per un'asta a busta chiusa?

Questo programma è pensato per un'asta **a rialzo** (§13 del `readme.md`): un giocatore alla volta,
offerte a voce, prezzo che sale finché resta un solo offerente. Un'asta **a busta chiusa** — ogni
manager scrive un numero senza vedere le offerte altrui, vince il più alto, e **paga esattamente
quello che ha scritto** (non quanto offerto dal secondo, come nell'asta a rialzo) — è un meccanismo
diverso, e la risposta onesta è: **una parte del motore si applica pari pari, un'altra no.**

**Cosa si applica senza modifiche:**

- Il **modello di valore** (punteggio → fantamedia/titolarità → punti attesi, §2.2/§6.1): dice
  quanto vale un giocatore *per te*, a prescindere da come si svolge l'asta.
- Il **tetto avversari esatto** (§2.3, §6.4): fra un turno e l'altro, budget e slot residui di ogni
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
un'estensione della schermata Asta attuale. Non l'ho costruita perché è un pezzo di teoria dei
giochi distinto, non una variazione della UI: se ti interessa davvero, vale la pena discuterne il
disegno a parte prima di scrivere codice.
