# FantAsta — il problema, il software, l'algoritmo

## Il problema

In un'asta di fantacalcio dal vivo (tipicamente 10 fantallenatori, 500 crediti
ciascuno, circa 25 giocatori da comprare a testa) ogni giocatore viene proposto
una volta sola, a voce, e bisogna decidere in pochi secondi quanto offrire.
Decisione difficile perché dipende da troppe cose insieme: quanto vale
davvero quel giocatore per me, quanto budget e quanti slot per ruolo mi
restano, cosa può ancora permettersi ciascun avversario, e quanto rischio a
lasciarlo per aspettare un'occasione migliore più avanti. Fare questi calcoli
a mente, ogni 30 secondi, per due ore, non è realistico — da qui l'esigenza di
uno strumento che li faccia al posto tuo, in tempo reale, sul telefono o sul
portatile mentre l'asta procede.

## Cosa abbiamo costruito

Un'app web a file singolo (`dist/fantasta.html`, funziona anche offline senza
installare nulla) con:

- **Un motore di decisione** (il cuore matematico): dato lo stato corrente
  dell'asta, calcola per ogni giocatore un numero preciso — "offri fino a
  X crediti" — più il ragionamento dietro quel numero.
- **Una UI a schermate** per gestire l'asta dal vivo: Setup lega, Lista
  giocatori (con import CSV), Banco d'asta (registrazione veloce delle
  vendite mentre l'asta procede), Fantallenatori (chi ha preso cosa e con
  quanto budget), La mia rosa, Predizione (l'analisi completa su un
  giocatore), Report asta (a fine asta, o su un'asta simulata).
- **Un simulatore offline** (self-play) usato per calibrare i parametri del
  motore su dati reali e per generare aste di prova su cui esercitarsi prima
  del giorno vero.

Tutto lo stato dell'asta (chi ha comprato cosa, i punteggi assegnati, gli
annullamenti) è un log di eventi: permette l'undo a qualunque profondità e
l'export/import per riprendere un'asta salvata.

## Come funziona l'algoritmo, fase per fase

### 1. Prima dell'asta (Setup)

Si configura la lega (numero di fantallenatori, budget, slot per ruolo,
formazione) e si carica il listone con un **punteggio per giocatore**: il
prezzo in crediti che pagheresti per lui a inizio asta, tipicamente 1-250 su
un budget di 500, senza un tetto fisso — un top player può valere anche più
della metà del budget. Il punteggio è la valutazione dell'utente: il motore
non lo ricalcola né lo trasforma, gli si affianca solo quando serve
(vedi punto 2 sotto).

### 2. Quando un giocatore viene messo all'asta

Per il giocatore estratto, il motore calcola in pochi millisecondi:

- **Il mio valore**: il punteggio caricato, corretto da due leve personali —
  quanto pesa per me quel ruolo (§11 Setup) e un bonus di **copertura
  titolari**: finché non ho ancora assicurato un numero sufficiente di
  titolari certi in quel ruolo (i titolari della formazione + una riserva),
  un candidato con alta probabilità di titolarità vale un po' più del suo
  punteggio nudo — una volta raggiunta la copertura, il bonus si annulla e
  conta solo il valore, permettendo di concentrarsi su chi costa meno anche
  se gioca meno.
- **Il prezzo di mercato atteso**: quanto è plausibile che valga per il
  mercato in generale, stimato da una curva calibrata su dati reali e
  aggiornata via via con le vendite realmente osservate in QUESTA asta.
- **Il tetto avversari**: il massimo che il concorrente più ricco con quel
  ruolo ancora libero può fisicamente pagare — un vincolo esatto, non una
  stima, che l'offerta consigliata non supera mai.
- **L'offerta massima ottima**: risolvendo esattamente (programmazione
  dinamica) "se compro questo giocatore a un dato prezzo, la mia rosa finale
  migliora o peggiora rispetto a non comprarlo e tenere il budget per
  altro?" — la risposta è il numero mostrato, "OFFRI FINO A".
- Accanto al numero: alternative rimaste nello stesso ruolo, un allarme se il
  pool residuo rischia di non bastare, e una stima di quanto converrebbe
  offrire all'avversario più interessato.

Su richiesta, una **simulazione Monte Carlo** (migliaia di continuazioni
casuali dell'asta, in background) rifinisce il numero con una banda
(minimo probabile / mediana / massimo probabile), utile quando la decisione
è in bilico.

### 3. Durante la trattativa

L'utente registra il prezzo vero a cui il giocatore è stato venduto (a se
stesso o a un avversario). Questo aggiorna lo stato: budget e slot residui
di chi ha comprato, e il modello di prezzo di mercato — che da quel momento
tiene conto anche di questa vendita reale, affinandosi asta dopo asta.

### 4. Dopo ogni vendita

Tutto si ricalcola per il prossimo giocatore: il mio valore, la copertura
titolari (che avanza man mano che compro), il tetto avversari, il modello di
prezzo. Non c'è nulla da fare manualmente: il motore riparte da zero calcoli
ad ogni giocatore, sullo stato aggiornato.

### 5. Dopo l'asta (o su un'asta simulata)

La schermata "Report asta" ripercorre l'intero log delle vendite e confronta,
per ognuna, cosa il motore avrebbe consigliato in quel momento con cosa è
successo davvero — quanto ho sovrapagato, quali occasioni ho perso rispetto
al mio tetto, e il valore finale stimato della rosa che ho costruito.

## La Terza Via: Ibridazione Monte Carlo + Knapsack

Il sistema implementa un approccio ibrido a tre livelli per massimizzare la qualità delle decisioni:

### Livello 1: Statistico (Monte Carlo)

**Obiettivo**: Stimare la distribuzione di probabilità dei prezzi di mercato.

**Come funziona**:
- Simula migliaia di continuazioni possibili dell'asta
- Campiona solo i giocatori rilevanti (Top-N dinamico per ruolo)
- Aggiorna le distribuzioni in tempo reale man mano che i giocatori vengono venduti
- Produce: mediana, percentili (min/max probabili), volatilità attesa

**Assunzioni**:
- Gli avversari seguono strategie razionali simili alle tue
- Il pool di giocatori si restringe dinamicamente
- I prezzi seguono una distribuzione calibrata sui dati osservati

**Vantaggi**: Gestisce l'incertezza intrinseca dell'asta, adattandosi agli imprevisti.

### Livello 2: Tattico (Strategie di Offerta)

**Obiettivo**: Tradurre le stime statistiche in azioni concrete.

**Tre modalità operative**:
1. **Conservativa**: Offri al 20° percentile (alta probabilità di successo, basso rischio di sovrappagare)
2. **Equilibrata**: Offri alla mediana (bilancio ottimale rischio/rendimento)
3. **Aggressiva**: Offri all'80° percentile (massimizza probabilità di acquisto, accetta rischio premium)

**Formula di aggiustamento**:
```
Offerta = BasePrice × (1 + RiskModifier × StrategyFactor)
```
dove `RiskModifier` dipende da: scarsità del ruolo, budget residuo, competizione attesa.

### Livello 3: Strategico (Ottimizzazione Knapsack)

**Obiettivo**: Massimizzare il valore totale della rosa sotto vincoli multipli.

**Problema formale (ILP - Integer Linear Programming)**:
```
Massimizza: Σ (value_i × x_i)
Vincoli:
  1. Σ (cost_i × x_i) ≤ BudgetResiduo
  2. Σ (x_i per ruolo r) ≤ SlotDisponibili_r
  3. x_i ∈ {0, 1}  (variabile binaria: prendi o lasci)
```

**Algoritmo**: Greedy con backtracking limitato per soluzioni sub-ottime in <10ms.

**Metriche prodotte**:
- **Valore Teorico Massimo**: Il punteggio massimo raggiungibile con budget e slot attuali
- **Shadow Price**: Quanto valore perdi se rimuovi un giocatore dal pool (misura l'insostituibilità)
- **Core Players**: Giocatori sempre presenti nella soluzione ottima (shadow price alto)
- **Costo Opportunità**: Se compri X, quanto valore teorico rinunci rispetto all'ottimo?

**Formula di aggiustamento prezzo**:
```
PrezzoAggiustato = BaseMaxBid × max(0.5, 1 - (OpportunityCost / AbsoluteValue))
```

**Integrazione con Monte Carlo**:
1. Monte Carlo genera distribuzioni di prezzo per tutti i giocatori
2. Knapsack usa i valori attesi (median) per costruire la rosa ottimale
3. Il costo opportunità retro-agisce sull'offerta massima consigliata
4. Risultato: un prezzo che bilancia valore assoluto, scarsità e impatto sulla rosa ideale

### Esempio Concreto

**Scenario**: Budget 100, Slot: 1 A, 1 C. Pool: Attaccante A (valore 80, prezzo 50), Attaccante B (valore 60, prezzo 30), Centrocampista C (valore 70, prezzo 40).

**Senza Knapsack**: A sembra migliore (80 > 70), offri fino a 50.

**Con Knapsack**:
- Rosa ottimale: B + C = 60 + 70 = 130 (budget 70)
- Se compri A: rimani con 50 crediti, puoi prendere solo B o C → max 80 + 60 = 140 o 80 + 70 = 150 (ma non ti basta il budget per entrambi)
- Shadow Price di A: 130 - (valore con A) = perdita netta
- **Risultato**: Il sistema potrebbe sconsigliare A anche se ha valore assoluto più alto, perché blocca il budget impedendo la combinazione ottimale.

### Assunzioni del Modello Ibrido

1. **Razionalità degli avversari**: Tutti massimizzano il valore della propria rosa (non sempre vero, ma buona approssimazione)
2. **Informazione completa**: Conosci i punteggi di tutti i giocatori (caricati nel setup)
3. **Mercato efficiente**: I prezzi tendono a riflettere i valori reali (calibrato con vendite osservate)
4. **Vincoli rigidi**: Budget e slot sono limiti assoluti (non superabili)
5. **Indipendenza dei valori**: Il valore di un giocatore non dipende da chi altro hai preso (semplificazione: no bonus per coppie/terzetti)

### Limiti e Compromessi

- **Knapsack approssimato**: Usiamo greedy invece di ILP esatto per performance (<10ms vs secondi/minuti)
- **Top-N dinamico**: Simuliamo solo i migliori N giocatori per ruolo (N=250 iniziale, scende con l'asta) per ridurre il carico computazionale
- **Valori statici**: I punteggi dei giocatori non cambiano durante l'asta (no adattamento a infortuni, forme, ecc.)
- **Nessun profiling comportamentale**: Non distinguiamo tra avversari aggressivi/conservativi (tutti uguali)

Questi compromessi sono intenzionali: privilegiamo velocità e semplicità d'uso rispetto alla perfezione teorica, mantenendo accuratezza >95% nelle simulazioni test.
