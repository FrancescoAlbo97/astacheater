# Scarica PMA — Fantacalcio-Online

Scarica la tabella **Stima Prezzi Asta** di Fantacalcio-Online (prezzi medi
realmente pagati nelle aste della piattaforma) e la converte per FantAsta.

## Installazione ed uso

```bash
pip install requests beautifulsoup4 lxml pandas
python3 scarica_pma.py
```

Se il sito ha cambiato struttura e l'estrazione fallisce:

```bash
python3 scarica_pma.py --diagnose
```

Non scrive nulla e stampa cosa ha trovato nella pagina (tabelle, JSON
incorporati, possibili endpoint API). Mandami quell'output e sistemo il parser.

In alternativa, se preferisci non far fare la richiesta allo script: apri la
pagina nel browser, salvala come HTML e passala direttamente.

```bash
python3 scarica_pma.py --html pagina_salvata.html
```

## Segmento

Default `10/500` = leghe da 9-11 squadre con budget 440-560 crediti, cioè la tua.
Gli altri disponibili: `8/350`, `10/350`, `8/500`.

```bash
python3 scarica_pma.py --segmento 10/350
```

## File prodotti

| file | contenuto | a cosa serve |
|---|---|---|
| `pma_raw.csv` | tutto: nome, ruolo, squadra, quotazione, media voto, presenze e **tutte e quattro** le colonne di prezzo | analisi in un foglio di calcolo, e fit del modello di prezzo |
| `pma_template_prezzo.csv` | formato template, `punteggio` = prezzo medio del segmento | quello che hai chiesto — **per analizzare, non per caricare** |
| `pma_template_score.csv` | formato template, `punteggio` = 0-100 | questo si carica nell'app |

La colonna `titolarita` resta vuota in entrambi i template, come richiesto.

## Perché due template e non uno

Il campo `punteggio` dell'applicazione è la **qualità 0-100**, che il motore
converte in fantamedia attraverso le curve `fm(s)` del readme. Un prezzo medio
vive su un'altra scala e supera 100 per i giocatori di fascia alta: caricato
così, produce `p*` privi di senso.

`pma_template_score.csv` converte il prezzo in punteggio passando per il rango
dentro il ruolo e **invertendo la curva del motore**, quindi la scala risultante
è quella che l'app si aspetta.

Attenzione a cosa significa quel file: è una lista in cui la qualità di un
giocatore *è* il suo prezzo di mercato. Serve per vedere come si comporta il
motore quando la tua valutazione coincide con quella del mercato — e la risposta
attesa è che `p*` finisca vicino a `p̂` su tutti i giocatori, cioè che il
vantaggio si annulli. È un test utile, non una lista da usare in asta.

## Note

- Lo script fa **una sola richiesta** alla pagina, con `User-Agent` da browser e
  tre tentativi con attesa crescente. Non c'è nessun ciclo di scraping.
- I giocatori etichettati "Nuovo" non hanno storico d'asta: nei due template
  vengono saltati, in `pma_raw.csv` restano con il prezzo vuoto.
- I nomi vengono traslitterati in ASCII e il terminatore di riga è LF, come il
  template dell'app.
