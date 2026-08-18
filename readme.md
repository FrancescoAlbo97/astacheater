# FantAsta — assistente decisionale per l'asta del fantacalcio

Specifica di implementazione completa. Questo documento è pensato per essere dato in input a
Claude Code come unica fonte di verità: contiene obiettivo, matematica, architettura, schemi dati,
piano di lavoro per fasi, test e criteri di accettazione numerici.

**Lingua del codice:** identificatori e commenti in inglese, testi della UI in italiano.

**Stato del progetto:** tutte le 13 fasi di §12 sono state completate e collaudate (242 test
automatici). Il file eseguibile finale è `dist/fantasta.html`. Le sezioni sottostanti restano la
specifica tecnica di riferimento per chi estende o rivede il codice; questa guida in cima serve a
chi deve solo installarlo e usarlo.

---

## Guida pratica: installazione, sviluppo, build, uso

### Prerequisiti

- **Node.js 18+** (consigliato 22, quello usato in sviluppo) e `npm`.
- Nessun altro requisito: zero dipendenze di sistema, zero servizi esterni, zero account.

### Installazione

```bash
npm install
```

### Sviluppo (con ricompilazione automatica)

```bash
npm run dev
```

Apri l'indirizzo che compare in console (di solito `http://localhost:5173/`). Utile per modificare
il codice, non per l'asta vera (serve una build).

### Build — il file che userai davvero all'asta

```bash
npm run build
```

Esegue il typecheck, compila e produce **`dist/fantasta.html`**: un unico file HTML, zero
dipendenze esterne, zero rete a runtime. Aprilo due volte prima del giorno dell'asta — da un
browser desktop e **dal telefono che userai in asta** — per essere sicuro che si apra e sia
leggibile. Non serve alcun server: funziona anche con `file://` e offline.

```bash
npm run preview   # per vedere la build già compilata in locale, senza aprire il file direttamente
```

### Test e verifica

```bash
npm run typecheck     # controllo dei tipi TypeScript, strict
npm test               # tutti i test automatici (unit + property-based sugli invarianti)
npm run test:watch     # test in modalità interattiva durante lo sviluppo
```

### Testare la UI senza rifare un'asta intera a mano

`npm test` copre il motore (`src/core`, `src/sim`) senza bisogno di un browser, ma per controllare
una schermata REALE — un cambiamento visivo, una nuova funzione, un sospetto — cliccare un'asta
intera da zero (Setup → carica listone → assegna decine di score → registra vendita per vendita) è
troppo lento per essere un metodo di lavoro quotidiano. Due strumenti coprono questo buco:

```bash
npm run fixtures   # rigenera src/fixtures/*.json: 4 istantanee di un'asta realistica (00-vuota,
                    # 01-iniziale, 02-meta, 03-quasi-finita), giocata in millisecondi dallo stesso
                    # simulatore della Prova a secco (scripts/make-fixtures.ts) sul listone vero.
npm run dev         # poi apri http://localhost:5173/?fixture=02-meta (o un altro nome) — carica
                    # quella fixture invece dello stato salvato. Solo in `npm run dev`
                    # (`import.meta.env.DEV`): il file finale che va all'asta vera non la contiene.
npm run test:e2e    # con il dev server già avviato: apre ogni fixture in Chromium (Playwright),
                    # visita tutte le schermate, segnala eventuali errori di console e salva uno
                    # screenshot per ognuna in e2e-screenshots/ (non versionato) — un controllo
                    # visivo completo in circa 15 secondi, invece di ricostruire un'asta a mano.
```

Le fixture sono generate dal simulatore self-play (`auction-sim.ts`), non dal motore esatto della UI
(`engine.ts`): usale per controllare che tutto RENDERIZZI correttamente e non vada in errore, non
per giudicare la qualità delle decisioni al loro interno — i due usano politiche di offerta
volutamente diverse per motivi di prestazioni (§6.6/§6.7), quindi rigiocarle nel Report asta mostrerà
fisiologicamente alcuni "sovrapprezzo" che una persona reale, guidata dallo stesso motore esatto in
entrambi i momenti, non vedrebbe.

Un bug reale è stato trovato proprio così durante lo sviluppo di questi strumenti (non con un'asta
a mano): valutare un candidato per un ruolo già completamente pieno restituiva un "offri fino a"
positivo invece di "non serve", perché il calcolo del valore ipotetico "se lo comprassi" veniva
confuso con uno scambio silenzioso con il proprio peggior giocatore già posseduto in quel ruolo.
Corretto in `plan-dp.ts` (`computeRolePlan`), con test di regressione in `test/plan-dp.test.ts` e
`test/max-bid.test.ts`.

### Strumenti da riga di comando (simulatore, calibrazione, validazione)

Per chi vuole affinare i parametri o rifare le verifiche di §9–§10 prima di un'asta importante:

```bash
npx tsx src/sim/cli.ts bench 200        # statistiche di realismo su 200 aste simulate (§9.5)
npx tsx src/sim/cli.ts validate 100     # motore vs politiche naive, ablazione appaiata (§10.1–10.3)
npx tsx src/sim/cli.ts calibrate 500 8  # ricalibrazione self-play dei parametri di prezzo (§9.4),
                                         # aggiorna data/defaults.json — richiede qualche minuto,
                                         # non è indispensabile: il programma funziona anche con i
                                         # parametri di default già inclusi
```

### Uso dell'app

Cinque schermate, da configurare **in ordine** la prima volta:

1. **Setup lega** — manager, budget, slot per ruolo, moduli ammessi, propensione al rischio.
2. **Lista giocatori** — carica il listone incluso (o importa un CSV `nome,ruolo,squadra` più,
   opzionalmente, `punteggio,titolarita` per pre-caricare le valutazioni), assegna uno score 0–100
   a ogni giocatore che ti interessa. Un pulsante scarica un template CSV già formattato.
3. **Asta (live)** — da usare durante l'asta vera: cerchi il giocatore estratto, il programma dice
   subito fino a quanto conviene offrire, il prezzo atteso, il tetto esatto degli avversari; registri
   l'acquisto in due tocchi più un numero; undo sempre disponibile. Uno slider per-decisione permette
   di scavalcare temporaneamente il rischio di lega su un singolo giocatore.
4. **Prova a secco** — da usare prima dell'asta vera, per tarare gli score: simula 200 aste sulla
   tua lista reale e ti mostra la rosa attesa, segnalando i ruoli sbilanciati.
5. **Report asta** — rigioca la TUA asta reale (non una simulazione) e confronta ogni acquisto con
   quello che il motore consigliava un istante prima: quanto hai speso, quante volte hai superato il
   tuo stesso tetto, quali occasioni potevi permetterti e sono finite a un avversario.

**Guida completa passo per passo, in italiano semplice, con spiegazione di ogni numero mostrato a
schermo:** vedi **[`MANUALE.md`](MANUALE.md)**. È il documento pensato per chi userà l'app
all'asta, non serve leggere la specifica tecnica qui sotto per usarla.

### Backup dei dati

Lo stato si salva da solo nel browser (`localStorage`) ad ogni azione, ma non è l'unica garanzia:
usa **Esporta** (in alto a destra nell'app) per scaricare un JSON con l'intero stato ogni tanto
durante l'asta vera, e **Importa** per ricaricarlo. Dettagli in `MANUALE.md` §4.

### Prima di un'asta vera: checklist minima

1. Aggiorna il listone (il CSV incluso è di agosto 2026, a mercato aperto — va rinfrescato a
   ridosso della tua asta).
2. Assegna gli score ai giocatori che ti interessano (bastano i primi 40–50 per ruolo).
3. Lancia la **Prova a secco** un paio di volte sulla lista definitiva.
4. Verifica un export JSON manuale, per sapere già come si fa sotto pressione.

Checklist completa e ragionata in `MANUALE.md` §5 (è anche integrata come pannello nella schermata
Setup lega dell'app).

### Limiti noti

Il modello di valore-rosa spiega l'84% della variabilità osservata contro il 97% teorico di §6.2/A9
— i numeri assoluti restano buone stime, non verità esatte al fantapunto. Il simulatore interno di
auto-taratura (non la Prova a secco, che usa la tua lista reale) lascia ancora troppi crediti
inutilizzati agli avversari sintetici. Nessuno dei due punti richiede un'azione da parte tua;
dettagli in `MANUALE.md` §7.

---

## 0. Come usare questo documento

Il resto di questo file (§1 in poi) è la **specifica tecnica** originale usata per costruire il
progetto: obiettivo, matematica, architettura, schemi dati, piano a fasi, criteri di accettazione.
Resta la fonte di verità per chi estende o rivede il motore — non serve leggerla per usare l'app
(per quello vedi `MANUALE.md` o la guida pratica qui sopra).

Le fasi in §12 sono da eseguire **in ordine**. Ogni fase ha una *Definition of Done* verificabile:
non passare alla fase successiva se i test della fase corrente non passano. La fase 6
(calibrazione self-play) produce parametri che le fasi precedenti usano come default: è previsto
che alla fine della fase 6 si tornino ad aggiornare i file di configurazione.

Le sezioni §1–§11 sono la specifica. §13 elenca insidie note: leggerle **prima** di scrivere codice.

---

## 1. Obiettivo

Durante un'asta del fantacalcio a rialzo a voce, con estrazione casuale dei giocatori e non per
ruoli, l'applicazione deve dire in ogni momento:

1. **Fino a quanto conviene offrire** per il giocatore appena estratto (`p*`), con banda di
   confidenza.
2. **Quanto probabilmente costerà** (`p̂`), cioè cosa serve realmente per vincerlo.
3. **Quanto possono al massimo offrire gli avversari** (`C`), che è un dato *esatto* e non stimato.

Input dell'utente: uno score `0–100` per giocatore, dentro il proprio ruolo. Nessun dato di
mercato esterno. Tutti i prezzi di mercato vengono **stimati e ricalibrati durante l'asta** dagli
acquisti osservati.

Deve funzionare **offline, da un singolo file HTML**, su laptop e su telefono, senza installare
nulla e senza rete.

### Cosa NON è l'obiettivo

Non è "riuscire a comprare i giocatori che mi ero segnato". Un motore corretto **abbandona i
propri obiettivi** quando il prezzo supera `p*` e riallocare altrove è un successo, non un
fallimento. Qualunque metrica che premi il completamento di una lista prefissata va rifiutata:
premierebbe l'errore classico di strapagare per completare il piano. La metrica corretta è il
valore finale della rosa misurato nella scala di valore dell'utente (§10).

---

## 2. Parametri della lega (default; devono restare configurabili)

| Parametro | Valore |
|---|---|
| Numero di partecipanti `M` | 10 |
| Budget iniziale `B` | 500 crediti |
| Rosa | 3 P, 8 D, 8 C, 6 A = **25 slot** |
| Slot totali della lega | 250 |
| Crediti totali della lega | 5.000 |
| Prezzo minimo | 1 credito, incrementi interi |
| Modulo primario | 4-3-3 |
| Moduli ammessi | 4-3-3, 3-4-3, 3-5-2, 4-4-2, 4-5-1, 5-3-2, 5-4-1 |
| Formato asta | rialzo a voce, estrazione casuale dal listone completo, non per ruoli |
| Regole aggiuntive | nessuna |

**Invarianti da asserire nel codice** (test di regressione, §12 F1):

- `Σ_ρ slot_ρ × M = 250`
- `B × M = 5000`
- somma dei pesi di slot su tutti i ruoli = **11.00** (undici giocatori schierati per giornata)

---

## 3. I quattro principi da cui deriva tutto

Vanno capiti prima di implementare, perché ogni formula è una conseguenza di uno di questi.

**P1 — Il prezzo massimo è costo opportunità, non valutazione.**
`p*` non dipende da quanto valutano il giocatore gli altri. Dipende solo dal valore che ha per me
e da cosa potrei comprare altrimenti con gli stessi crediti e lo stesso slot. La valutazione degli
avversari entra da un canale diverso e va tenuta separata: determina `p̂`, il prezzo che devo
pagare. **`p*` e `p̂` sono due numeri distinti e vanno mostrati entrambi, sempre.**

**P2 — Il tetto avversari è aritmetica esatta, non una stima.**
Ogni manager deve riempire tutti gli slot e ogni giocatore costa almeno 1. Quindi il massimo
spendibile su un singolo giocatore è calcolabile con certezza. È il vincolo più redditizio
dell'intero sistema, diventa stringente nella seconda metà dell'asta e costa zero a calcolare.

**P3 — La conservazione del denaro ancora i prezzi senza dati esterni.**
Verranno assegnati esattamente `Σ_m k_m` giocatori per esattamente `Σ_m b_m` crediti. Questa
identità fissa il *livello* delle previsioni di prezzo anche a zero osservazioni, e si stringe
progressivamente man mano che i crediti si prosciugano. È la ragione per cui partire dai soli
score dell'utente è praticabile.

**P4 — Il valore di un giocatore dipende dalla probabilità che giochi.**
Vedere §6.1 e §13.1: ignorare questo punto rende il modello *matematicamente mal posto*. Non è una
rifinitura.

---

## 4. Architettura e stack

```
Sorgenti in TypeScript, moduli ES.
Un unico motore (src/core) condiviso fra browser e Node: nessuna duplicazione di logica.
```

| Ruolo | Scelta | Note |
|---|---|---|
| Linguaggio | **TypeScript** strict | `noUncheckedIndexedAccess: true` |
| Build | **Vite** + `vite-plugin-singlefile` | output: un unico `dist/fantasta.html` autoconsistente |
| UI | **React** + CSS puro | nessuna libreria di componenti, nessun CDN a runtime |
| Test | **Vitest** | unit + property-based su invarianti |
| Simulatore | **CLI Node** via `tsx` | deve girare fuori dal browser per fare 5.000+ aste |
| Calcolo pesante | **Web Worker** | il Monte Carlo non deve mai bloccare la UI |
| Persistenza | event log in memoria + `localStorage` (in `try/catch`) + export/import JSON | mai dipendere solo da `localStorage` |
| Numerico | `Float64Array` / `Int32Array` per le tabelle DP | evitare array di array nei loop caldi |

**Vincoli non negoziabili:**

- Zero richieste di rete a runtime. Nessun font remoto, nessun CDN, nessuna analitica.
- Nessuna dipendenza runtime oltre React. Nessun solver LP esterno: la DP di §6.5 è esatta e
  sufficiente.
- Il file finale deve funzionare aperto con `file://` e da un telefono.

---

## 5. Struttura dei file

```
fantasta/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  README.md                      ← questo documento
  data/
    listone.json                 ← elenco giocatori Serie A (§8.1)
    defaults.json                ← parametri calibrati (output della fase 6)
  src/
    core/
      types.ts                   ← tutti i tipi condivisi
      config.ts                  ← parametri lega, curve, pesi slot
      value-model.ts             ← §6.1  score → (fantamedia, titolarità) → valore
      lineup-sim.ts              ← §6.2  valore esatto di una rosa (verità di riferimento)
      value-surrogate.ts         ← §6.2  pesi di slot fittati contro lineup-sim
      price-model.ts             ← §6.3  prior + ancoraggio + stimatore online
      ceiling.ts                 ← §6.4  tetto avversari (esatto)
      plan-dp.ts                 ← §6.5  DP piano ottimo
      max-bid.ts                 ← §6.6  p* per bisezione
      rollout.ts                 ← §6.7  Monte Carlo
      risk.ts                    ← §6.8  obiettivo e avversione/propensione al rischio
      state.ts                   ← §7    event sourcing, riduttore, undo
      index.ts
    sim/
      generator.ts               ← §9.1  liste sintetiche: consenso latente + rumore
      archetypes.ts              ← §9.2  archetipi di avversario
      auction-sim.ts             ← §9.3  motore di simulazione dell'asta
      selfplay-calibrate.ts      ← §9.4  ciclo a punto fisso sul modello di prezzo
      oracle.ts                  ← §10.2 miglior rosa comprabile ex post
      metrics.ts                 ← §10   metriche e grafici di calibrazione
      cli.ts                     ← entry point Node
    ui/
      App.tsx
      screens/SetupLeague.tsx
      screens/PlayerList.tsx     ← inserimento/modifica score
      screens/Auction.tsx        ← schermata live
      screens/DryRun.tsx         ← prova a secco / taratura score
      components/*.tsx
      styles.css
    workers/
      rollout.worker.ts
  test/
    invariants.test.ts
    value-model.test.ts
    price-model.test.ts
    ceiling.test.ts
    plan-dp.test.ts
    max-bid.test.ts
    state.test.ts
    sim.test.ts
```

---

## 6. Modelli matematici

### Notazione

| Simbolo | Significato |
|---|---|
| `R = {P, D, C, A}` | ruoli |
| `M` | numero di manager; `m = 0` sono io |
| `b_m` | crediti residui del manager `m` |
| `r_m[ρ]` | slot residui del manager `m` nel ruolo `ρ` |
| `k_m = Σ_ρ r_m[ρ]` | slot residui totali del manager `m` |
| `c_m = b_m − (k_m − 1)` | **massimo spendibile su un singolo giocatore** dal manager `m` |
| `P` | pool dei giocatori non ancora estratti |
| `s_j ∈ [0,100]` | score assegnato dall'utente al giocatore `j`, dentro il suo ruolo |
| `v_j` | valore del giocatore `j` in punti attesi stagionali |
| `p̂_j` | prezzo previsto per `j` |
| `w_ρ,t` | peso dello `t`-esimo slot del ruolo `ρ` |
| `Φ(b, r, P)` | valore della migliore rosa realizzabile con budget `b`, slot `r`, pool `P` |
| `λ = ∂Φ/∂b` | valore marginale di un credito, in punti |

---

### 6.1 Modello di valore

Lo score `0–100` va scomposto in **due** quantità, perché una sola non basta (§13.1):

```
fm_ρ(s) = fmMin_ρ + (fmMax_ρ − fmMin_ρ) · (s/100)^γ_ρ      fantamedia attesa quando gioca
pt_ρ(s) = ptMin_ρ + (ptMax_ρ − ptMin_ρ) · (s/100)^δ_ρ      probabilità di essere schierabile
v_j     = 38 · pt_ρ(s_j) · fm_ρ(s_j)                        punti attesi stagionali
```

Parametri di default (tutti esposti come slider nella UI, tutti ricalibrati nella fase 6):

| ρ | fmMin | fmMax | γ | ptMin | ptMax | δ |
|---|---|---|---|---|---|---|
| P | 4.8 | 6.8 | 1.8 | 0.05 | 0.95 | 1.0 |
| D | 5.0 | 7.2 | 1.7 | 0.08 | 0.92 | 1.3 |
| C | 5.0 | 8.2 | 2.0 | 0.08 | 0.92 | 1.3 |
| A | 5.0 | 9.2 | 2.4 | 0.08 | 0.92 | 1.4 |

Valori risultanti (per riferimento nei test):

```
score:      20     40     60     75     85     95
v_P:        43     81    125    165    195    228
v_D:        36     70    115    159    193    231
v_C:        36     70    120    170    211    260
v_A:        33     65    116    173    223    285
```

**Override opzionale per giocatore:** campo `ptOverride` per i casi in cui la titolarità non segue
lo score (giocatore forte in squadra che ruota molto, rientro da infortunio). Va usato raramente;
la UI deve renderlo poco invadente.

**Istruzione da mostrare all'utente nella schermata di inserimento:** lo score misura *quanto è
forte quando gioca*, non quanto gioca. La titolarità la deduce il modello; se il caso è anomalo,
si usa l'override.

---

### 6.2 Valore di una rosa: simulatore esatto + surrogato additivo

Il valore di una rosa **non** è la somma dei valori dei suoi giocatori: solo 11 scendono in campo
ogni giornata, e chi non gioca viene sostituito dalla panchina, che a sua volta può non giocare.

**Verità di riferimento — `lineup-sim.ts`.**

```
valoreRosa(rosa, moduliAmmessi, N = 2000):
  totale = 0
  ripeti N volte:
    per ogni giocatore j: disponibile_j ~ Bernoulli(pt_j)
    scegli fra i moduli ammessi la formazione legale che massimizza Σ fm dei disponibili schierati
    se un ruolo non ha abbastanza disponibili: applica penalità "senza voto" (default 4.0 fantapunti)
    totale += punti della giornata
  ritorna 38 · totale / N
```

Questa funzione è corretta ma non decomponibile, quindi non usabile dentro la DP.

**Surrogato additivo — `value-surrogate.ts`.**

```
Φ_rosa ≈ Σ_ρ Σ_t  w_ρ,t · v_(t-esimo giocatore del ruolo ρ ordinato per v decrescente)
```

Pesi di default:

| ρ | pesi (ordine decrescente di valore) | somma |
|---|---|---|
| P | 0.87, 0.11, 0.02 | 1.00 |
| D | 0.95, 0.92, 0.88, 0.78, 0.15, 0.07, 0.03, 0.02 | 3.80 |
| C | 0.94, 0.90, 0.82, 0.40, 0.18, 0.09, 0.05, 0.02 | 3.40 |
| A | 0.93, 0.88, 0.72, 0.17, 0.07, 0.03 | 2.80 |
|  | **totale** | **11.00** |

**Invariante:** `Σ_ρ Σ_t w_ρ,t = 11`, e `Σ_t w_ρ,t` = numero medio di titolari attesi nel ruolo `ρ`
sul mix di moduli. Se si cambiano i moduli ammessi, i pesi vanno rideterminati e la somma deve
restare 11.

**Fitting dei pesi (fase 4).** Generare 3.000 rose casuali di composizione valida, valutarle con
`lineup-sim`, e fittare i `w_ρ,t` ai minimi quadrati vincolati (monotoni decrescenti dentro il
ruolo, somma totale = 11). **Riportare l'R² del fit.** Requisito di accettazione: R² ≥ 0.97. Se è
sotto, il surrogato additivo non è adeguato e va segnalato prima di costruirci sopra la DP.

> **Addendum (post-F13, pesi di slot configurabili):** i pesi della tabella sopra sono ora anche un
> parametro personale (Setup lega, §11), non solo un default fisso — per adattare la FORMA dentro un
> ruolo al proprio modo di giocare (es. due portieri "titolari" comparabili invece di uno solo netto
> con riserve scontate quasi a zero). `normalizeSlotWeights` (`src/core/config.ts`) mantiene sempre
> `w_ρ` della lunghezza giusta (`slots[ρ]`) e la UI riordina automaticamente in decrescente, ma **non
> impone più il vincolo `Σ = 11`**: personalizzando i pesi, quell'invariante (calibrato per il mix di
> moduli di default) può non valere più, per scelta esplicita dell'utente. Resta il default di
> fabbrica se non toccato. Verificato che questo non rompe la DP per nessuna combinazione di pesi
> personali validi (`test/engine.test.ts`, incluso un test property-based).

---

### 6.3 Modello di prezzo

Tre livelli: prior parametrico, ancoraggio esatto, aggiornamento online.

#### 6.3.1 Prior

```
B_j = A_ρ · exp( θ_ρ · s_j / 100 )
```

`θ_ρ` si calibra dal rapporto fra prezzo del top e prezzo marginale:

```
θ_ρ = 100 · ln(p_top / p_marg) / (s_top − s_marg)
```

Default (da `p_marg = 1`): `θ_P = 7.1`, `θ_D = 8.1`, `θ_C = 9.0`, `θ_A = 10.1`.

Quote iniziali di budget per ruolo: `P 5%`, `D 15%`, `C 30%`, `A 50%`, cioè prezzi medi impliciti di
`8.3 / 9.4 / 18.8 / 41.7` crediti. **Questi prior sono provvisori: la fase 6 li sostituisce con i
valori del punto fisso di self-play.**

#### 6.3.2 Ancoraggio (vale anche a zero osservazioni)

```
K   = Σ_m k_m                      giocatori che verranno ancora acquistati
Ctot= Σ_m b_m                      crediti ancora in circolazione
D_ρ = Σ_m r_m[ρ]                   giocatori del ruolo ρ che verranno ancora acquistati
```

Procedura `renormalize()`, da rieseguire **dopo ogni acquisto registrato**:

```
1. calcola i B_j grezzi dalla curva per tutti i j ∈ P
2. per ogni ruolo ρ: buySet_ρ = i D_ρ giocatori di ruolo ρ in P con B più alto
   (gli altri hanno p̂ = 1 e probabilità di acquisto < 1)
3. massa_ρ = Σ_{j ∈ buySet_ρ} B_j ;  massaTot = Σ_ρ massa_ρ
4. fattore = (Ctot − riserva) / massaTot        con riserva = 0.015 · Ctot
5. p̂_j = max(1, round(B_j · fattore))  per j ∈ buySet ;  p̂_j = 1 altrimenti
6. ripeti 3–5 tre volte (il troncamento a 1 sposta massa e va riassorbito)
7. asserisci  | Σ_{buySet} p̂ − (Ctot − riserva) |  ≤  0.02 · Ctot
```

#### 6.3.3 Aggiornamento online

Ogni acquisto registrato è un'osservazione `(ρ, s, prezzo)`. Per ruolo, regressione **robusta e
pesata** di `log(prezzo)` su `s`:

- **prior come ridge:** penalizza lo scostamento da `(log A_ρ, θ_ρ)` iniziali con peso equivalente a
  `n0 = 15` osservazioni. Il peso dei dati è `n / (n + n0)`.
- **perdita di Huber** (δ = 1.0 in scala log) o troncamento del 10% dei residui estremi: un singolo
  sovrapprezzo folle non deve ruotare la curva. **Obbligatorio**, è la causa di fallimento più
  comune di questo tipo di stimatore.
- **decadimento esponenziale** con emivita 40 osservazioni: l'inflazione della lega può derivare
  durante l'asta.
- ruoli con `n_ρ < 5` usano il prior globale riscalato, non la propria regressione.

> **Addendum (post-F13, bug reale corretto):** su un campione piccolo con score osservati
> concentrati in una fascia stretta (es. 6 vendite di portieri tutte fra 86 e 95), la pendenza
> grezza della regressione può uscire negativa per puro rumore campionario — economicamente privo
> di senso, dato che θ_ρ è definito sopra come sempre ≥ 0. Pendenza e intercetta sono correlate
> quando lo score varia poco nel campione: un'intercetta compensatoria può esplodere e sopravvivere
> al ridge verso il prior, producendo prezzi previsti che DECRESCONO con lo score una volta
> extrapolati fuori dalla fascia osservata (misurato su un'asta reale: 313 crediti per score 95, 106
> per score 50 — il contrario di quanto il modello dovrebbe fare). Corretto in
> `src/core/price-model.ts`: se la pendenza grezza è negativa, si riporta a 0 (nessuna relazione
> affidabile in quel campione) e si ricalcola l'intercetta come media pesata coerente, invece di
> lasciare l'estrapolazione distorta. Dettagli e numeri reali in MANUALE.md §7.

Fattore di inflazione globale, comodo da mostrare a schermo:

```
κ = Σ_venduti prezzo / Σ_venduti B_prior
```

#### 6.3.4 Cappatura per domanda residua

```
p̂_j ← min( p̂_j , C²_j + 1 )
```

dove `C²_j` è il **secondo** tetto più alto fra gli avversari con slot libero in quel ruolo (§6.4):
in un'asta a rialzo il prezzo è fissato dal secondo offerente, non dal primo.

#### 6.3.5 Confidenza

Esporre sempre: `n_ρ` (osservazioni per ruolo), errore standard di `θ_ρ`, e un'etichetta
`bassa / media / alta` con soglie `n_ρ < 8 / < 25 / ≥ 25`. La banda su `p̂` si allarga di
conseguenza. Nei primi 15–20 giocatori estratti il modello gira sui prior: la UI **deve** dirlo
esplicitamente.

---

### 6.4 Tetto avversari (esatto)

```
c_m  = b_m − (k_m − 1)
Elig_ρ = { m ≠ 0 : r_m[ρ] > 0 }                 avversari con slot libero nel ruolo ρ
C¹_j = max  { c_m : m ∈ Elig_ρj }               (0 se l'insieme è vuoto)
C²_j = secondo massimo dello stesso insieme     (0 se ha meno di 2 elementi)
c_0  = b_0 − (k_0 − 1)                          il mio massimo su un singolo giocatore
```

Conseguenze da esporre nella UI:

- **Offerta operativa massima** = `min( p*_j , C¹_j + 1 , c_0 )`.
  Non serve mai offrire più di `C¹_j + 1`: nessuno può rilanciare oltre `C¹_j`.
- Se `C¹_j = 0` → **il giocatore è tuo a 1 credito, garantito**. Evidenziarlo in modo vistoso: sono
  le occasioni più redditizie dell'asta.
- Prezzo atteso ≈ `min( p̂_j , C²_j + 1 )`.
- Mostrare *chi* è il detentore di `C¹` (nome, crediti, slot residui nel ruolo): serve a decidere a
  voce, in tempo reale.

Casi limite da testare: un solo avversario eleggibile; nessuno eleggibile; avversario con
`k_m = 1` (`c_m = b_m`, può spendere tutto); pareggi fra `c_m`.

---

### 6.5 Piano ottimo: programmazione dinamica esatta

Il problema si risolve **in modo esatto**, senza solver esterni. Il motivo: dato che i pesi di slot
dentro un ruolo sono decrescenti e fissi, la rosa ottima assegna sempre i giocatori scelti in
ordine di valore decrescente sui pesi decrescenti. Quindi il problema si decompone per ruolo.

**Per ruolo `ρ`:**

```
candidati = giocatori di ρ in P, PIÙ i giocatori di ρ già miei (forzati, prezzo 0),
            PIÙ un "filler" sintetico: prezzo 1, v = v_ρ(score del 20° percentile del pool),
            disponibile in quantità illimitata

potatura:  scartare i candidati dominati (esiste k con v_k ≥ v_j e p̂_k ≤ p̂_j).
           riduce tipicamente a 30–50 candidati per ruolo.

ordinare i candidati per v decrescente
f[t][β] = valore massimo scegliendo t giocatori con spesa esatta β
f[0][0] = 0, resto −∞
per ogni candidato (v, p) in ordine di v decrescente:
    per t da slot_ρ−1 giù a 0:
        per β da budget−p giù a 0:
            f[t+1][β+p] = max( f[t+1][β+p] , f[t][β] + w_ρ,t+1 · v )
g_ρ[β] = envelope monotona crescente di f[slot_ρ][·]
```

Nota sui giocatori già acquistati: includerli come **forzati a prezzo 0** e richiedere di scegliere
esattamente `slot_ρ` (totali, non residui) giocatori risolve automaticamente e correttamente
l'assegnazione dei pesi. Non trattarli come slot semplicemente rimossi: si sbaglierebbero i pesi.

**Ricombinazione dei ruoli:**

```
h_0[0] = 0
per ρ in {P, D, C, A}:  h_{k+1}[β] = max_{β' ≤ β} ( h_k[β − β'] + g_ρ[β'] )
Φ(b, r, P) = h_4[b]
```

**Complessità con i numeri reali della lega** (verificata):

| passo | operazioni |
|---|---|
| DP ruolo P | 50 × 3 × 501 ≈ 75k |
| DP ruolo D | 50 × 8 × 501 ≈ 200k |
| DP ruolo C | 50 × 8 × 501 ≈ 200k |
| DP ruolo A | 50 × 6 × 501 ≈ 150k |
| ricombinazione | 4 × 501 × 501 ≈ 1.0M |

Totale pochi millisecondi in JS con array tipizzati. **Nessuna approssimazione necessaria.**

**Comportamento atteso di `λ`** (verificato numericamente con i parametri di default):

```
budget 150 → λ ≈ 2.85 punti/credito
budget 250 → λ ≈ 1.89
budget 350 → λ ≈ 1.39
budget 500 → λ ≈ 1.03
```

`λ` decresce in modo regolare e resta ben positiva a budget pieno: il budget vincola per tutto
l'arco dell'asta. **Requisito di sanità: `λ(500) ∈ [0.8, 1.4]`.** Un valore intorno a 0.5 indica
quasi certamente il bug di §13.1, e si traduce in offerte massime raddoppiate. `λ ≈ 1` dà anche una
regola mnemonica utile da mostrare in UI: **1 credito ≈ 1 fantapunto di stagione**.

---

### 6.6 Prezzo massimo `p*` per bisezione

```
Φ_lose  = Φ( b_0 , r_0 , P ∖ {i} )                  i è perso, esce dal pool
Φ_win(p)= Φ con la DP del ruolo ρ_i in cui i è forzato incluso al prezzo p
          (p entra nel budget del ruolo: la ricombinazione resta su b_0)

p* = max { p ∈ ℕ , 1 ≤ p ≤ c_0 : Φ_win(p) ≥ Φ_lose }
```

`Φ_win` è concava non crescente in `p`, quindi il set è un intervallo e la bisezione è corretta.
~10 risoluzioni della DP, ≈50 ms. Se `Φ_win(1) < Φ_lose`, allora `p* = 0`: **il giocatore non
migliora la rosa nemmeno gratis** (occupa uno slot meglio usato). Mostrarlo come "non serve".

Forzatura di `i`: DP del ruolo con un bit di stato aggiuntivo "`i` già preso". Raddoppia gli stati,
resta trascurabile.

**Approssimazione al primo ordine** — da mostrare in UI come *spiegazione*, non da usare per
produrre il numero:

```
p* ≈ ( w_ρi,t · v_i − μ_ρi ) / λ
```

con `μ_ρ` valore ombra di uno slot del ruolo. Serve a rispondere in UI alla domanda "perché questo
numero", e come politica base rapida dentro i rollout (§6.7).

---

### 6.7 Monte Carlo

Il modello deterministico assume che il piano B sia disponibile al prezzo previsto. Non è vero: il
piano B lo può soffiare qualcun altro. L'effetto sistematico è renderti **troppo prudente** e
esporti al rischio peggiore, cioè arrivare in fondo con slot da riempire e solo scarti disponibili.

```
rollout(statoCorrente, decisione):
  ordine = permutazione uniforme del pool residuo
  per ogni giocatore estratto:
    per ogni avversario m con slot libero nel ruolo:
        willingness_m = p̂_j · moltiplicatoreArchetipo_m · exp(N(0, σ))   troncata a c_m
    prezzo   = secondo massimo delle willingness + 1
    io offro secondo la politica base (p* approssimato dai duali, §6.6)
    aggiorna budget e slot di tutti
  ritorna valore finale della mia rosa con il surrogato additivo (§6.2)
```

- `σ` (rumore sul prezzo) da calibrare nella fase 6 sui residui della regressione.
- Politica base: duali ricalcolati ogni 20 estrazioni o quando il budget cala di oltre il 10%.
  Ricalcolare la DP a ogni passo di ogni rollout è troppo lento; questo compromesso è necessario.
- `R = 2000` rollout. Griglia di 8 valori di `p`, si valuta la differenza fra vincere a `p` e
  perdere, si interpola l'incrocio.
- Output: `p*` mediano più percentili 10 e 90.
- Gira in Web Worker, budget di tempo **< 3 s**. In un'asta reale hai 30–60 s fra un giocatore e
  l'altro: è tempo abbondante, ma la UI deve mostrare il numero deterministico **entro 100 ms** e
  poi raffinarlo quando arriva il rollout.

---

### 6.8 Obiettivo e rischio

Massimizzare i punti attesi è *risk-neutral*, ma in una lega a 10 arrivare secondi vale poco: la
funzione di utilità reale è convessa nella coda, e questo giustifica cercare varianza (i "top"
valgono più del loro contributo medio).

Implementare come parametro esplicito, `risk` ∈ `[−1, +1]`, default `+0.15`:

```
obiettivo = E[punti] + risk · η · SD[punti]
```

`SD[punti]` viene da `lineup-sim` (calcolare anche la deviazione standard, non solo la media). `η`
si tara in fase 6 in modo che `risk = +1` corrisponda circa a massimizzare `P(vittoria)` in una
simulazione di campionato a 10.

Dentro la DP il termine di varianza non è additivo. Approssimazione ammessa: applicare
`risk` come **maggiorazione della convessità della curva di valore** (`γ_ρ ← γ_ρ · (1 + 0.4·risk)`),
verificando in fase 6 che riproduca la stessa graduatoria di decisioni del criterio esatto sul
simulatore. Documentare lo scarto misurato.

> **Addendum (post-F13):** lo "scarto misurato" richiesto sopra è stato effettivamente quantificato
> — vedi MANUALE.md §7. È stata anche implementata e misurata un'approssimazione additiva
> alternativa, più letterale rispetto alla formula di questa sezione:
> `v_adj = v + risk · η · fm(s)·√(38·pt(s)·(1−pt(s)))` (`riskAdjustedPlayerValue`/`seasonSdProxy` in
> `src/core/value-model.ts`), che aggiunge un bonus/malus proporzionale alla varianza Bernoulliana
> del singolo candidato invece di distorcere l'intera curva. Non ha superato la soglia di
> affidabilità fissata prima della misura (dettagli e numeri in MANUALE.md §7): resta nel codice,
> testata, ma NON è quella attiva di default — γ resta l'approssimazione in uso.

> **Addendum (post-F13, peso per ruolo):** aggiunto un secondo parametro personale, indipendente da
> `risk` e con lo stesso principio (tocca solo il proprio valore/DP, mai il modello di prezzo):
> `roleWeights: Record<Role, number>` (Setup lega, default 1 per tutti = nessuna differenza),
> applicato come `v' = playerValue(...) · roleWeights[ruolo]` (`roleWeightedPlayerValue` in
> `src/core/value-model.ts`). A differenza del rischio, non distorce la curva punteggio→valore — è
> un moltiplicatore diretto e indipendente dallo score. Effetto verificato NON uniforme all'interno
> del ruolo pesato (dettagli e numeri in MANUALE.md §7): alza "offri fino a" per i migliori candidati
> del ruolo, ma può abbassarlo per quelli mediocri, perché la DP rivaluta anche le alternative dello
> stesso ruolo con lo stesso peso — comportamento coerente con l'ottimizzazione, non un difetto.

---

## 7. Stato ed event sourcing

**Requisito:** lo stato dell'asta è un **log append-only di eventi**; ogni stato derivato è una
funzione pura del log. Questo rende l'undo banale e corretto, e rende impossibile la classe di bug
peggiore in un'app usata sotto pressione (stato incoerente dopo una correzione).

```ts
type AuctionEvent =
  | { t: 'league.setup';   config: LeagueConfig }
  | { t: 'players.load';   players: Player[] }
  | { t: 'player.score';   playerId: string; score: number; ptOverride?: number }
  | { t: 'sale';           playerId: string; managerId: string; price: number }
  | { t: 'unsold';         playerId: string }
  | { t: 'manual.override';playerId: string; maxBid: number; note?: string }
  | { t: 'undo' }                      // annulla l'ultimo evento non-undo
  | { t: 'note';           text: string }
```

`reduce(log) → AuctionState` deve essere **pura e deterministica**. L'undo rigenera lo stato dal
log troncato: **non** applicare mutazioni inverse.

Ricalcolo dei modelli dopo ogni `sale`: rifittare la regressione di prezzo, rieseguire
`renormalize()`, invalidare la cache della DP.

**Persistenza:** salvataggio automatico del log su `localStorage` dentro `try/catch` (può essere
indisponibile), più pulsanti espliciti **Esporta stato (JSON)** e **Importa stato**. L'export deve
funzionare sempre: è l'unica garanzia se il browser viene chiuso.

---

## 8. Schemi dati

### 8.1 `data/listone.json`

```json
{
  "season": "2026/27",
  "updatedAt": "2026-08-20",
  "source": "descrizione della fonte",
  "players": [
    { "id": "srl-lautaro-martinez", "name": "Lautaro Martinez", "team": "Inter", "role": "A" }
  ]
}
```

`role` ∈ `P | D | C | A`. `id` slug stabile.

**Reperimento e manutenzione.** Il listone va recuperato e verificato a mano una volta, e
**rinfrescato nei giorni precedenti l'asta**: al momento della stesura il mercato estivo è aperto e
le squadre cambiano. Per questo:

- il listone è un file dati, **mai** dati incastonati nel codice;
- la UI deve permettere di **aggiungere, rimuovere, rinominare e cambiare squadra/ruolo** a un
  giocatore, e di importare un CSV `nome,ruolo,squadra` che fa merge sul listone esistente
  preservando gli score già assegnati (match per `id`, fallback su nome normalizzato);
- se un giocatore estratto in asta non è in lista, deve essere inseribile **in 5 secondi** dalla
  schermata di asta, con score assegnato al volo.

### 8.2 Configurazione lega

```json
{
  "managers": [ { "id": "me", "name": "Francesco", "isMe": true }, { "id": "m2", "name": "..." } ],
  "budget": 500,
  "slots": { "P": 3, "D": 8, "C": 8, "A": 6 },
  "formations": ["4-3-3","3-4-3","3-5-2","4-4-2","4-5-1","5-3-2","5-4-1"],
  "primaryFormation": "4-3-3",
  "minPrice": 1,
  "risk": 0.15
}
```

### 8.3 Parametri calibrati (`data/defaults.json`)

Output della fase 6: `fmMin/fmMax/γ`, `ptMin/ptMax/δ`, pesi `w_ρ,t` con R² del fit, `θ_ρ`,
`A_ρ`, quote di budget per ruolo, `σ` del rumore di prezzo, `η` del termine di rischio, `n0` del
ridge. Ogni valore accompagnato da come è stato ottenuto.

---

## 9. Simulatore, archetipi, calibrazione self-play

Il simulatore non è solo collaudo: **produce i prior del modello di prezzo**. Va costruito prima
del Monte Carlo.

### 9.1 Generatore di scenari

Se gli score dei 10 manager sono estratti in modo indipendente, le liste si sovrappongono poco, la
competizione è finta e i prezzi crollano. Se sono identici, la competizione è irrealisticamente
massima. Modello latente:

```
consenso_j          ~ distribuzione realistica degli score per ruolo
score_m(j)          = ρ · consenso_j + sqrt(1 − ρ²) · rumore_m(j) , riscalato su [0,100]
```

`ρ` è un parametro dello scenario. **Non scegliere un valore di `ρ`:** far variare `ρ ∈ {0.5, 0.65,
0.8, 0.9, 0.95}` e verificare che il motore vinca su **tutto** l'intervallo. Un motore che funziona
solo a `ρ = 0.8` ha imparato il simulatore, non l'asta.

Distribuzione degli score per ruolo del pool: `s_i = 100 · (1 − (i/n)^0.65)` per `i = 0..n−1`, con
`n_P = 60`, `n_D = 180`, `n_C = 190`, `n_A = 110` (~540 giocatori, di cui 250 verranno comprati).

**Errore sui miei score.** Testare anche il caso in cui *i miei* score sono sbagliati: `s_0` è una
versione rumorosa del valore vero. Il motore deve restare utile con rumore fino a ±10 punti di
score. Un motore che vince solo quando i suoi input sono perfetti non serve.

### 9.2 Archetipi di avversario

Il vantaggio del motore viene in buona parte dallo sfruttare irrazionalità reali. Implementare
almeno questi, ciascuno parametrizzato:

| Archetipo | Comportamento |
|---|---|
| `rational` | usa il motore stesso (per il self-play) |
| `earlyEnthusiast` | moltiplicatore 1.3–1.6 sui primi 40 giocatori estratti, poi resta senza crediti |
| `latePanicker` | moltiplicatore < 1 all'inizio, poi 2.0+ quando restano pochi slot e molti crediti |
| `fanboy` | sovrapprezzo del 40% sui giocatori di una squadra reale estratta a caso |
| `roleCapper` | rifiuta per principio di superare soglie fisse per ruolo (es. mai > 30 per un P) |
| `anchored` | usa una tabella di prezzi "dell'anno scorso" e non si adatta all'inflazione |
| `budgetSplitter` | quote di budget rigide per ruolo, spende fino a esaurimento quota |

Un mix di default (composizione realistica di lega) più mix estremi per i test di robustezza.

### 9.3 Motore di simulazione dell'asta

`auction-sim.ts` deve girare **la stessa** logica di asta usata nei rollout, con la stessa
risoluzione di prezzo (secondo prezzo + 1) e gli stessi vincoli `c_m`. Seed esplicito e
riproducibile: **nessun uso di `Math.random()` non seminato**, per permettere confronti appaiati.

Prestazioni target: 5.000 aste complete in < 3 minuti da CLI Node.

### 9.4 Calibrazione self-play a punto fisso

```
θ ← prior di §6.3.1
ripeti fino a convergenza (o 15 iterazioni):
    gira 2.000 aste con il motore in TUTTI i 10 posti, liste diverse, ρ campionato
    raccogli i prezzi realizzati
    rifitta θ (e le quote di budget per ruolo) sui prezzi realizzati
    misura || θ_nuovo − θ_vecchio ||
```

Il punto fisso è un modello di prezzo **coerente con il gioco razionale**. Serve a due cose:

1. sostituire i prior scelti a mano, che sono il punto più debole del sistema nei primi 15–20
   giocatori estratti;
2. **test di coerenza interna**: se dieci copie del motore producono prezzi sistematicamente
   diversi da quelli che il modello prevedeva, il modello è mal calibrato e va corretto.

Attenzione: il punto fisso del self-play puro descrive una lega di giocatori razionali. La lega
reale non lo è. Quindi calibrare i prior come **media pesata** fra il punto fisso di self-play e il
punto fisso di un self-play con il mix realistico di archetipi (peso suggerito 0.35 / 0.65),
e documentare la scelta.

### 9.5 Controlli di realismo dello scenario

Servono a validare **il simulatore**, non il motore:

| Indicatore | Banda accettabile |
|---|---|
| Quota di target ottenuti (top 15 della propria lista) | **30–50%** |
| Crediti non spesi a fine asta, per manager | 0–15 |
| Slot riempiti | 250 / 250, sempre |
| Quota di budget per ruolo, media di lega | entro ±8 pp dai prior |
| Prezzo del giocatore più caro della lega | 120–260 |
| Numero di giocatori venduti a 1 credito | 60–110 |

Se il tasso di target ottenuti è ~90% le liste non si sovrappongono abbastanza e il test non prova
niente. Se è ~5% i prezzi sono troppo piatti o gli avversari troppo aggressivi.

---

## 10. Validazione e criteri di accettazione

### 10.1 Ablazione appaiata

```
per seed in 1..5000:
    genera scenario(seed)
    esegui l'asta con il motore nel posto 0        → valore_motore  (misurato con gli score del posto 0)
    esegui LA STESSA asta (stesso seed, stesso ordine) con una politica naive nel posto 0
                                                   → valore_naive
ruota il motore su tutti i 10 posti per escludere effetti di posizione
```

Politiche naive di confronto (implementarle tutte e tre):

1. **`ratio`** — rilancia in ordine di `v_j / p̂_j` finché il budget lo consente.
2. **`fixedSplit`** — quote di budget rigide per ruolo, dentro il ruolo prende i migliori
   disponibili.
3. **`targetChaser`** — rilancia fino a `1.2 × p̂` sui 25 giocatori della propria lista obiettivo.
   È la politica che imita il comportamento umano tipico, ed è il confronto più significativo.

Il confronto appaiato sullo stesso seed abbatte la varianza: bastano poche migliaia di run invece
di centinaia di migliaia.

### 10.2 Benchmark oracolo

A fine simulazione tutti i prezzi realizzati sono noti. Si risolve il problema **offline** con la
stessa DP di §6.5 usando i prezzi realizzati: si ottiene la miglior rosa che era comprabile con 500
crediti a quei prezzi. È il tetto teorico.

```
quotaGapColmata = (valore_motore − valore_naive_migliore) / (valore_oracolo − valore_naive_migliore)
```

Numero fra 0 e 1, interpretabile direttamente. È **la** metrica principale del progetto.

### 10.3 Criteri di accettazione numerici

Il sistema è accettato quando, su 5.000 aste appaiate e su tutto lo sweep di `ρ`:

| # | Criterio | Soglia |
|---|---|---|
| A1 | `quotaGapColmata` contro la migliore politica naive | **≥ 0.50** |
| A2 | Vittoria contro `targetChaser` | in **≥ 70%** delle aste appaiate |
| A3 | Vittoria contro ciascuna naive | media positiva a **ogni** valore di `ρ` testato |
| A4 | Crisi di slot (slot residui in un ruolo > giocatori disponibili) | **0** occorrenze su 5.000 aste |
| A5 | Crediti non spesi dal motore, mediana | **≤ 8** |
| A6 | Calibrazione prezzi: residui medi per decile di score × fase d'asta | entro **±15%** in ogni cella |
| A7 | Robustezza al rumore sui miei score (±10 punti) | A1 resta **≥ 0.35** |
| A8 | Non sfruttabilità: 9 motori + 1 naive | la naive **non** deve battere la media dei motori |
| A9 | R² del surrogato additivo contro `lineup-sim` | **≥ 0.97** |
| A10 | Tempo: numero deterministico / rollout completo | **< 100 ms** / **< 3 s** |

Se A1 esce sotto 0.30, non è un problema di taratura: c'è un errore. Cercarlo in ordine in §13.1,
§13.3, §13.4.

### 10.4 Cruscotto diagnostico

Da produrre come report HTML dalla CLI. Sono queste le viste che fanno emergere i bug veri:

- **grafico di calibrazione**: prezzo realizzato vs previsto, per decile di score × fase d'asta
  (primi 60 / centrali / ultimi 60 estratti). I residui devono essere centrati sullo zero in ogni
  cella. Un errore sistematico sui top nella fase iniziale si vede qui e **solo** qui;
- distribuzione dei crediti non spesi;
- occorrenze di crisi di slot, con lo stato che le ha causate;
- quante volte ho vinto **esattamente a `p*`**: sono gli acquisti pericolosi, da rivedere ex post;
- rimpianto ex post per singolo acquisto (valore con il senno di sui prezzi realizzati);
- traiettoria di `λ` durante l'asta, media e quantili.

---

## 11. Interfaccia live

Se l'inserimento di un acquisto è lento, l'app non viene usata e tutta la matematica è inutile.
**Requisito: registrare un acquisto in due tap più un numero.**

### Schermate

1. **Setup lega** — manager, budget, slot, moduli, rischio.
2. **Lista giocatori** — listone caricato, filtri per ruolo/squadra, assegnazione score con
   tastiera, ordinamento, contatore di quanti ne hai scorati per ruolo, import CSV, aggiunta
   manuale.
3. **Asta (live)** — la schermata che conta.
4. **Prova a secco** — gira 200 aste simulate sulla tua lista reale e mostra che rosa ti aspetta:
   è lo strumento per **tarare gli score prima dell'asta**, e per capire se la lista è mal
   bilanciata.

### Schermata di asta — contenuto

Pannello centrale, giocatore corrente:

```
LAUTARO MARTINEZ   (A, Inter)   score 95
────────────────────────────────────────────────
OFFRI FINO A            118        banda 104 – 131
prezzo atteso            96
tetto avversari         141   ← Rossi (168 cr, 6 slot, 2 A liberi)
secondo tetto            95   ← Bianchi
────────────────────────────────────────────────
se lo prendi a 118 → rosa finale 2.184 pt
se lo lasci        → rosa finale 2.179 pt
λ = 1.12 pt/credito     (1 credito ≈ 1.1 fantapunti)
alternative dopo di lui: Vidal 74@31 · Osei 71@28 · Krul 69@22
⚠ ti restano 2 slot A e 5 attaccanti di fascia alta nel pool
modello prezzo: 34 osservazioni · confidenza alta · inflazione κ = 1.18
```

Elementi obbligatori:

- Numero deterministico entro 100 ms, banda Monte Carlo che compare dopo e non fa "saltare" il
  layout.
- Riga **"perché"** espandibile con la decomposizione al primo ordine (§6.6).
- **`p* = 0`** mostrato come "non serve" con spiegazione.
- **`C¹ = 0`** evidenziato in modo vistoso: "tuo a 1 credito, garantito".
- Registrazione dell'acquisto: seleziona il manager (griglia di 10 pulsanti grandi), digita il
  prezzo, invio. Scorciatoie da tastiera per tutto.
- **Undo** sempre visibile.
- Pulsante "non venduto".
- Override manuale del massimo, che resta registrato nel log.

Pannello avversari, sempre visibile: per ciascuno crediti residui, slot residui per ruolo, `c_m`,
e potenza di fuoco per ruolo. Ordinabile per `c_m`.

Pannello mia rosa: giocatori acquistati per ruolo con prezzo, slot mancanti, `c_0`, e il **piano
residuo** suggerito dalla DP (chi comprare e a che prezzo previsto).

Allarmi di scarsità per ruolo: per ogni ruolo, slot che mi mancano vs giocatori rimasti nel pool vs
slot che mancano agli avversari.

### Requisiti trasversali

- Leggibile su schermo di telefono; niente scroll orizzontale.
- Funziona con `file://`, zero rete.
- Nessun dialog modale bloccante durante l'asta.
- Tema scuro (le aste si fanno di sera).

---

## 12. Piano di lavoro per fasi

Ogni fase termina con la sua *Definition of Done*. Non procedere se non passa.

### F1 — Impianto, tipi, invarianti
Scaffolding Vite + TS + Vitest, `types.ts`, `config.ts`, build single-file funzionante.
**DoD:** `dist/fantasta.html` si apre da `file://` e mostra una pagina; i test sugli invarianti di
§2 passano (250 slot, 5000 crediti, somma pesi = 11).

### F2 — Listone
Recupero dell'elenco Serie A 2026/27, `data/listone.json`, import CSV con merge che preserva gli
score, aggiunta/modifica manuale.
**DoD:** listone caricato e navigabile; un CSV di test fa merge senza perdere score; aggiunta di un
giocatore inesistente in < 5 s di interazione.

### F3 — Modello di valore
`value-model.ts` con le curve di §6.1.
**DoD:** i valori di riferimento della tabella di §6.1 sono riprodotti entro ±1 punto; `v` è
monotona crescente in `s` per ogni ruolo (test property-based).

### F4 — Valore di rosa: simulatore e surrogato
`lineup-sim.ts`, poi `value-surrogate.ts` con fit dei pesi.
**DoD:** R² del surrogato contro il simulatore **≥ 0.97** su 3.000 rose casuali; pesi monotoni
decrescenti per ruolo; somma totale = 11.00; R² riportato in `defaults.json`.

### F5 — Modello di prezzo (prior) e tetto avversari
`price-model.ts` (§6.3.1–6.3.2), `ceiling.ts` (§6.4).
**DoD:** `renormalize()` soddisfa l'asserzione di §6.3.2 in 200 stati casuali; i casi limite del
tetto avversari di §6.4 sono tutti coperti da test; `C¹ = 0` viene riconosciuto correttamente.

### F6 — Motore decisionale
`plan-dp.ts` (§6.5), `max-bid.ts` (§6.6).
**DoD:** la DP coincide con una forza bruta su istanze piccole (≤ 12 giocatori, ≤ 3 slot per ruolo,
budget ≤ 40) su 500 istanze casuali; `Φ` monotona non decrescente in `b`; `λ` riproduce la
traiettoria di §6.5 entro ±10%; **`λ(500) ∈ [0.8, 1.4]`**; DP completa in < 20 ms; `p*` in < 100 ms.

### F7 — Simulatore, archetipi, self-play
`generator.ts`, `archetypes.ts`, `auction-sim.ts`, `selfplay-calibrate.ts`, CLI.
**DoD:** 5.000 aste in < 3 min; tutti i controlli di realismo di §9.5 nelle bande; il ciclo di
self-play converge in ≤ 15 iterazioni; `data/defaults.json` aggiornato con i parametri del punto
fisso e le curve prior sostituite.

### F8 — Aggiornamento online del modello di prezzo
Regressione robusta pesata di §6.3.3, cappatura di §6.3.4, indicatori di confidenza.
**DoD:** su aste simulate, l'errore medio assoluto su `p̂` scende in modo monotono con il numero di
osservazioni; un singolo prezzo anomalo (10× il previsto) sposta `θ_ρ` di **< 5%**; i residui di
calibrazione rispettano A6.

### F9 — Monte Carlo
`rollout.ts` + Web Worker.
**DoD:** rollout completo in < 3 s per 2.000 iterazioni; la banda contiene il prezzo realizzato nel
~80% dei casi su aste simulate; il motore con Monte Carlo batte il motore deterministico su 2.000
aste appaiate.

### F10 — Validazione ad ablazione
`oracle.ts`, `metrics.ts`, report HTML diagnostico.
**DoD:** **tutti** i criteri da A1 ad A9 di §10.3 soddisfatti, con il report allegato.

### F11 — Interfaccia live
Le quattro schermate di §11, event sourcing, undo, export/import.
**DoD:** partita simulata completa di 250 estrazioni inserita a mano senza errori di stato; undo
funzionante a qualunque profondità; export/import ripristina lo stato identico; A10 soddisfatto;
usabile su telefono.

### F12 — Prova a secco e taratura
Schermata di prova a secco sulla lista reale dell'utente; ciclo di taratura degli score.
**DoD:** la prova a secco gira in < 30 s in browser; produce la distribuzione della rosa attesa per
ruolo e la evidenzia se sbilanciata.

### F13 — Rifinitura pre-asta
Aggiornamento del listone a mercato chiuso, ricalibrazione dei parametri, due prove complete a
secco con la lista reale.
**DoD:** listone allineato alle rose reali alla data dell'asta (zero giocatori estratti mancanti
nelle due prove a secco); `defaults.json` rigenerato dopo l'aggiornamento del listone; due aste di
prova complete portate a termine senza interventi manuali sullo stato; export dello stato finale
verificato.

---

## 13. Insidie note — leggere prima di scrivere codice

### 13.1 La titolarità non è opzionale (errore che raddoppia tutte le offerte)

Se si definisce il valore come `v_j = 38 · fm_ρ(s_j)` **senza** il fattore `pt_ρ(s)`, la curva di
valore si comprime in modo drastico. Numeri verificati, ruolo A:

| | `v(score 20)` | `v(score 95)` | rapporto | `λ(b=500)` |
|---|---|---|---|---|
| con titolarità | 33 | 285 | **8.6 : 1** | **1.03** |
| senza titolarità | 193 | 331 | 1.7 : 1 | 0.47 |

Due conseguenze, entrambe gravi:

1. **`λ` è sottostimato di circa il 100%** (0.47 invece di 1.03). Poiché `p* ≈ (w·v − μ)/λ`, tutte
   le offerte massime risultano **circa raddoppiate**: il motore consiglia sistematicamente di
   strapagare. È l'errore peggiore possibile per uno strumento il cui unico scopo è dire fino a
   quanto salire.
2. Un riempi-slot da 1 credito appare valere il **73%** di un top di ruolo, invece del 12%. Ne
   consegue che il rischio di crisi di slot e il valore della profondità di panchina sono
   completamente mal prezzati.

La causa è concettuale: un giocatore da 1 credito **non è un giocatore da fantamedia 5.1, è un
giocatore che per metà stagione non scende in campo**. La fantamedia da sola non lo cattura.

Nota per onestà: la *composizione* della rosa ottima cambia poco fra i due modelli (le curve di
prezzo sono così convesse che dominano la scelta). L'errore non si vede guardando il piano, si vede
guardando `λ` e quindi `p*`. È esattamente per questo che è insidioso.

**Test di regressione obbligatori:**
- `λ(b = 500)` ∈ `[0.8, 1.4]` con i parametri di default;
- `v_A(95) / v_A(20) ≥ 5`.

Se il primo fallisce verso il basso, si è reintrodotto questo bug.

### 13.2 Non usare il completamento della lista come metrica
Vedi §1 e §9.5. Il tasso di target ottenuti serve a validare il **simulatore**, non il motore.

### 13.3 Pesi di slot e giocatori già acquistati
Trattare gli acquisti già fatti come "slot in meno" sbaglia l'assegnazione dei pesi. Vanno inclusi
nella DP come **forzati a prezzo 0** sul numero di slot **totale** del ruolo (§6.5).

### 13.4 Regressione di prezzo non robusta
Un singolo sovrapprezzo emotivo, in un'asta reale, è frequente. Senza perdita di Huber o
troncamento dei residui, ruota la curva e avvelena tutte le previsioni successive. Test F8.

### 13.5 Errori di uno sui tetti
`c_m = b_m − (k_m − 1)`, non `b_m − k_m`. Il massimo che serve offrire è `C¹ + 1`, non `C¹`. Il
prezzo atteso dipende dal **secondo** tetto, non dal primo. Coprire con test espliciti.

### 13.6 Undo con mutazioni inverse
Non farlo. Rigenerare lo stato dal log troncato (§7).

### 13.7 Dipendere solo da `localStorage`
Può essere indisponibile o azzerarsi. Export JSON esplicito sempre disponibile.

### 13.8 Sovrattaratura sul simulatore
Se il motore vince solo a un valore di `ρ` o con un mix specifico di archetipi, ha imparato il
simulatore. Lo sweep di §9.1 e il criterio A3 esistono per questo.

### 13.9 Latenza in asta
Il numero deve comparire entro 100 ms. Il rollout arriva dopo e raffina. Non far attendere l'utente
il Monte Carlo: in asta a voce non ci sono tre secondi da regalare quando gli altri stanno
rilanciando.

### 13.10 `Math.random()` non seminato
Rende impossibili i confronti appaiati, che sono il cuore della validazione. Un unico PRNG seminato
esplicito, passato per parametro.

### 13.11 Prior sensibili alla distribuzione del pool
La taratura di `A_ρ` dipende dalla distribuzione ipotizzata degli score nel pool. Cambiando quella
distribuzione i prezzi prior cambiano molto. È un motivo in più per far dipendere i prior definitivi
dal self-play (F7) e non da valori scelti a mano.

---

## 14. Glossario

| Termine | Significato |
|---|---|
| `p*` | prezzo massimo conveniente: soglia oltre la quale comprare peggiora la rosa finale |
| `p̂` | prezzo previsto di mercato per un giocatore |
| `C¹`, `C²` | primo e secondo tetto di spesa fra gli avversari eleggibili per quel ruolo |
| `c_m` | massimo che il manager `m` può spendere su un singolo giocatore |
| `λ` | valore marginale di un credito, in fantapunti stagionali |
| `μ_ρ` | valore ombra di uno slot del ruolo `ρ` |
| `Φ` | valore della migliore rosa realizzabile dallo stato corrente |
| surrogato additivo | approssimazione decomponibile del valore di rosa, usata dalla DP |
| filler | giocatore fungibile da 1 credito, modellato come risorsa illimitata |
| crisi di slot | stato in cui gli slot residui in un ruolo superano i giocatori disponibili |
| quota di gap colmata | `(motore − naive) / (oracolo − naive)`, metrica principale |
| self-play | simulazione con il motore in tutti i posti, usata per calibrare i prezzi a punto fisso |