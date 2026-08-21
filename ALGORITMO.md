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
