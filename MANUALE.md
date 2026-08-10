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

## 2. Le quattro schermate

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
  utile in leghe dove arrivare secondi vale poco). Default +0.15.

Puoi tornare qui in qualsiasi momento per correggere la configurazione: i punteggi e le vendite già
registrate non vengono perse.

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
- **Importa CSV** (`nome,ruolo,squadra`): aggiorna il listone mantenendo i punteggi già assegnati
  (abbina per nome, quindi rinominare uno stesso giocatore in modo molto diverso può far perdere
  l'abbinamento — controlla dopo l'import).
- **Aggiungi giocatore**: per un giocatore estratto in asta ma assente dal listone. Pensato per
  essere immediato (nome, squadra, ruolo, invio) da usare anche a voce alta con l'asta in corso.

Il contatore in alto mostra quanti giocatori hai valutato per ruolo: più ne valuti (soprattutto i
primi 40–50 per ruolo, quelli che verranno davvero contesi), più il motore sarà preciso.

### 2.3 Asta — la schermata che conta

Si usa **durante** l'asta vera. Per ogni giocatore estratto a voce:

1. **Cerca il giocatore** nella barra in alto (nome o squadra) e selezionalo.
2. Compare il **pannello decisionale**:
   - **OFFRI FINO A**: il numero deterministico, calcolato in meno di 100ms — è la cifra oltre la
     quale, secondo la tua lista, **comprare peggiora la rosa finale**. Se dice "non serve" significa
     che il giocatore non migliora la rosa nemmeno gratis (occuperebbe uno slot meglio usato).
   - **banda**: arriva poco dopo (calcolata in un Web Worker, non blocca l'interfaccia) ed è una
     stima più prudente basata su migliaia di aste simulate a partire da questo istante — tiene
     conto del fatto che i piani futuri potrebbero sfumare.
   - **prezzo atteso**: quanto probabilmente costerà davvero (diverso da "fino a quanto conviene
     offrire": sono due domande distinte, mostrate sempre entrambe).
   - **tetto avversari**: il massimo che l'avversario più ricco in quel ruolo può fisicamente
     offrire (aritmetica esatta: crediti residui meno gli slot ancora da riempire). Se è **0**, il
     giocatore è **tuo garantito a 1 credito** — evidenziato con un banner verde, sono le occasioni
     più redditizie dell'asta.
   - **secondo tetto**: chi fissa davvero il prezzo in un'asta a rialzo (il primo offerente non
     paga mai più del secondo).
   - **"perché questo numero?"**: espandibile, mostra la spiegazione semplificata del calcolo.
   - **alternative** e **allarme scarsità**: chi resta disponibile nel pool per quel ruolo, per
     capire se puoi permetterti di lasciarlo andare.
3. **Registra l'acquisto**: tocca il manager che lo ha preso (griglia di pulsanti grandi), scrivi il
   prezzo, Invio. Due tocchi più un numero, come richiesto per stare al passo con un'asta a voce.
4. **Non venduto**, se nessuno lo prende.
5. **Annulla ultimo** (undo, sempre visibile in alto): corregge un errore di battitura senza dover
   ricostruire lo stato a mano. Puoi annullare quante volte serve, anche a ritroso nel tempo.
6. **Override manuale**: se vuoi forzare un massimo diverso da quello calcolato (es. per un motivo
   che il modello non conosce), resta comunque registrato nel log.

Sotto, sempre visibili: il **pannello avversari** (crediti, slot residui, tetto) e la **tua rosa**
(chi hai preso, a che prezzo, slot mancanti).

### 2.4 Prova a secco

Da usare **prima** dell'asta, per tarare i punteggi. Assegna un po' di punteggi in Lista
giocatori, poi lancia la Prova a secco: gira 200 aste simulate sulla tua lista reale (con
avversari sintetici ma plausibili) e mostra la rosa attesa per ruolo, il valore di stagione medio
atteso, e segnala (⚠) i ruoli dove perdi sistematicamente i tuoi obiettivi migliori o prendi
giocatori con punteggio medio molto più basso che negli altri ruoli — spesso segno che la lista in
quel ruolo è da rivedere, o che gli score lì sono tarati in modo incoerente rispetto agli altri
ruoli. Impiega pochi secondi.

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

L'app salva automaticamente il tuo lavoro nel browser (`localStorage`) ad ogni azione. **Non
basarti solo su questo**: se il browser viene chiuso per errore, il salvataggio del browser
potrebbe non bastare (memoria piena, modalità privata, ecc.). Usa sempre anche:

- **Esporta** (in alto a destra): scarica un file JSON con l'intero stato (configurazione,
  punteggi, vendite). Fallo ogni tanto durante l'asta vera, è la tua unica garanzia certa.
- **Importa**: ricarica uno stato esportato in precedenza (utile anche per passare l'asta a un
  altro dispositivo a metà serata).
- **Azzera**: cancella tutto (chiede conferma). Esporta prima, se non sei sicuro.

---

## 5. Prima dell'asta vera: checklist

Il listone incluso è stato raccolto ad agosto 2026, a mercato estivo ancora aperto: **va
aggiornato a ridosso della tua asta**, non usato così com'è se l'asta è fra settimane.

1. **Aggiorna il listone**: procurati un CSV `nome,ruolo,squadra` aggiornato e importalo in Lista
   giocatori (preserva i punteggi già assegnati, abbinando per nome).
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
npm test                          # tutti i test automatici (143, dovrebbero passare tutti)
npm run typecheck                 # controllo dei tipi TypeScript
npm run build                     # produce dist/fantasta.html
npx tsx src/sim/cli.ts bench 200        # statistiche di realismo su 200 aste simulate
npx tsx src/sim/cli.ts validate 100     # confronto motore vs politiche "ingenue" (ablazione)
npx tsx src/sim/cli.ts calibrate 500 8  # ricalibrazione self-play dei parametri di prezzo
```

---

## 7. Limiti noti (onestà prima di tutto)

Questo programma è stato validato con test automatici rigorosi (verifica incrociata con forza
bruta sui calcoli esatti, controlli numerici sulle formule, ecc.), ma **due limiti restano
documentati e non ancora risolti**, per trasparenza:

- Il modello che riassume il valore di una rosa in poche formule (usato dentro il calcolo
  principale) spiega circa l'84% della variabilità reale invece del 97% teorico auspicato dalla
  specifica — non inficia la logica delle decisioni, ma i numeri assoluti mostrati vanno letti
  come **buone stime**, non come verità matematiche esatte al fantapunto.
- Il simulatore usato per le prove interne (non la Prova a secco, che usa la tua lista reale) non
  riproduce ancora perfettamente la competitività di un'asta reale: tende a lasciare troppi
  crediti inutilizzati agli avversari simulati. Questo riguarda solo gli **strumenti di test
  interni**, non la logica che vedi in asta (tetto avversari, p\*, ecc., che sono calcoli esatti
  indipendenti da questo).

Nessuno di questi due punti richiede un'azione da parte tua: sono limiti di calibrazione interna,
documentati nel codice e nei test per chi volesse approfondire o proseguire lo sviluppo.
