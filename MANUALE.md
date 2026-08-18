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
atteso/tetto avversari/secondo tetto in dettaglio, "perché questo numero?" (la catena di calcolo in
4 passi: peso dello slot, valore per te, valore ombra del ruolo, stima rapida), le alternative
rimaste nello stesso ruolo, l'allarme scarsità, e lo slider di aggressività per-decisione.

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
npm test                          # tutti i test automatici (240, dovrebbero passare tutti)
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
