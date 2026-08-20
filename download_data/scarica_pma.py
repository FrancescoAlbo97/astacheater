#!/usr/bin/env python3
"""
Scarica la tabella "Stima Prezzi Asta" di Fantacalcio-Online e la converte
nei formati utili a FantAsta.

    https://www.fantacalcio-online.com/it/asta-fantacalcio-stima-prezzi

Sono i prezzi MEDI REALMENTE PAGATI nelle aste ospitate sulla piattaforma,
bucketati per numero di squadre e budget. Un giocatore appare solo se e' stato
comprato in almeno 3 aste diverse del segmento.

USO
    pip install requests beautifulsoup4 lxml pandas
    python3 scarica_pma.py                 # scarica e produce i 3 file
    python3 scarica_pma.py --diagnose      # non scrive nulla: dice cosa trova
                                           # nella pagina (utile se cambia il DOM)
    python3 scarica_pma.py --segmento 10/350

FILE PRODOTTI
    pma_raw.csv                 tutto quello che c'e' nella pagina
    pma_template_prezzo.csv     formato template, punteggio = prezzo medio
    pma_template_score.csv      formato template, punteggio = 0-100 (caricabile)

ATTENZIONE SUL SECONDO FILE
    Il campo `punteggio` dell'app e' la qualita' 0-100, non un prezzo: il motore
    la converte in fantamedia con le curve fm(s) del readme. Un prezzo (che
    arriva oltre 100 e vive su un'altra scala) produce p* privi di senso.
    pma_template_prezzo.csv serve per ANALIZZARE i dati in un foglio di calcolo.
    Per CARICARE nell'app si usa pma_template_score.csv.
"""
from __future__ import annotations
import argparse, csv, io, json, re, sys, time, unicodedata

URL = "https://www.fantacalcio-online.com/it/asta-fantacalcio-stima-prezzi"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/127.0 Safari/537.36")

# segmenti della tabella: (etichetta, parole che devono comparire nell'header)
SEGMENTI = {
    "8/350":  ("8",  "350"),
    "10/350": ("10", "350"),
    "8/500":  ("8",  "500"),
    "10/500": ("10", "500"),
}

# curve del readme, per convertire un prezzo in punteggio 0-100 (§6.1)
GAMMA = {"P": 1.8, "D": 1.7, "C": 2.0, "A": 2.4}
S_MIN, S_MAX = 12, 95


def ascii_only(s: str) -> str:
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()


def num(x):
    """'99,18' -> 99.18 ; '' / '-' / 'Nuovo' -> None"""
    if x is None:
        return None
    s = str(x).strip().replace("\xa0", " ")
    s = re.sub(r"[^\d,.\-]", "", s)
    if not s or s in {"-", ".", ","}:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")     # 1.234,56
    else:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def fix_media_voto(x):
    """La colonna 'M.V.' usa la virgola come decimale nell'HTML sorgente (es. "6,41"), ma
    pandas.read_html la interpreta male anche senza decimal="," esplicito: elimina la virgola
    invece di convertirla, producendo 641.0 al posto di 6.41 (verificato leggendo la cella HTML
    grezza). Una media voto reale sta sempre in un intervallo ristretto (circa 3-10): un valore
    fuori da li' e' quasi certamente il sintomo di questo bug, non un voto vero, e si corregge
    dividendo per 100."""
    v = num(x)
    if v is not None and v > 15:
        v = v / 100
    return v


def scarica(url=URL, tentativi=3):
    import requests
    ses = requests.Session()
    ses.headers.update({"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9"})
    ultimo = None
    for i in range(tentativi):
        try:
            r = ses.get(url, timeout=30)
            r.raise_for_status()
            return r.text
        except Exception as e:                        # noqa: BLE001
            ultimo = e
            time.sleep(2 * (i + 1))                   # backoff, senza martellare
    raise SystemExit(f"download fallito dopo {tentativi} tentativi: {ultimo}")


# --------------------------------------------------------------------------- #
# ESTRAZIONE. Due strade, perche' non sappiamo come la pagina serve i dati:
#   A) tabella HTML  -> pandas.read_html / BeautifulSoup
#   B) JSON incorporato nella pagina (__NEXT_DATA__, var players = [...], ecc.)
# --------------------------------------------------------------------------- #
def da_tabella(html):
    import pandas as pd
    try:
        # NON passare decimal=","/thousands=".": le colonne di prezzo sulla pagina usano gia' il
        # punto come separatore decimale nativo (es. "129.36"). Con thousands="." pandas legge il
        # punto come separatore delle migliaia e lo elimina, trasformando "129.36" in 12936 — un
        # fattore 100 di troppo su ogni prezzo (bug reale trovato scaricando i dati: Martinez
        # Lautaro risultava "12936" invece di 129.36). La colonna "M.V." usa invece la virgola
        # ("6,41"): pandas non la interpreta correttamente in nessun caso provato (con o senza
        # decimal=","), la si corregge a parte piu' sotto — non e' comunque una colonna di prezzo.
        tabelle = pd.read_html(io.StringIO(html))
    except ValueError:
        return None, "nessuna tabella HTML trovata"
    if not tabelle:
        return None, "nessuna tabella HTML trovata"
    # la tabella buona e' la piu' grande che contenga una colonna 'quot'
    tabelle.sort(key=lambda t: -(t.shape[0] * t.shape[1]))
    for t in tabelle:
        col = [str(c).lower() for c in t.columns]
        if any("quot" in c for c in col) or t.shape[0] > 100:
            return t, f"tabella HTML {t.shape[0]}x{t.shape[1]}"
    return tabelle[0], f"tabella HTML (ripiego) {tabelle[0].shape}"


def da_json(html):
    """Cerca blob JSON con una lista di oggetti che sembrano giocatori."""
    trovati = []
    for m in re.finditer(r"(\[\s*\{.{200,}?\}\s*\])", html, re.S):
        blob = m.group(1)
        try:
            d = json.loads(blob)
        except Exception:                             # noqa: BLE001
            continue
        if isinstance(d, list) and d and isinstance(d[0], dict) and len(d) > 50:
            trovati.append(d)
    if not trovati:
        return None, "nessun JSON con lista di giocatori"
    trovati.sort(key=len, reverse=True)
    import pandas as pd
    return pd.DataFrame(trovati[0]), f"JSON incorporato, {len(trovati[0])} righe"


def individua_colonne(df, seg_words):
    """Mappa le colonne per contenuto dell'header, non per posizione: se il sito
    riordina le colonne lo script continua a funzionare."""
    mapping = {}
    for c in df.columns:
        h = ascii_only(str(c)).lower()
        if not mapping.get("nome") and re.search(r"calciat|giocat|nome|player", h):
            mapping["nome"] = c
        if not mapping.get("ruolo") and re.fullmatch(r"r|ruolo|pos|posizione", h.strip()):
            mapping["ruolo"] = c
        if not mapping.get("squadra") and re.search(r"squadr|team|sq\b", h):
            mapping["squadra"] = c
        if not mapping.get("quot") and re.search(r"quot|\bkap\.?\b", h):
            mapping["quot"] = c
        if not mapping.get("mv") and re.search(r"m\.?v\.?\b|media ?voto", h):
            # "\bmv\b" non intercettava mai l'header reale "M.V." (il punto rompe il confine di
            # parola fra 'm' e 'v'): bug reale trovato scaricando la pagina, "mv" mancava sempre
            # dalle colonne individuate anche se la colonna era presente.
            mapping["mv"] = c
        if not mapping.get("pres") and re.search(r"pres|pv\b|partite", h):
            mapping["pres"] = c
    # colonne di prezzo: header che contiene sia il numero di squadre sia il budget
    prezzi = {}
    for et, (sq, bud) in SEGMENTI.items():
        for c in df.columns:
            h = ascii_only(str(c)).lower()
            if sq in h and bud in h:
                prezzi[et] = c
                break
    mapping["_prezzi"] = prezzi
    return mapping


def normalizza_ruolo(v):
    s = ascii_only(str(v)).strip().upper()
    if not s:
        return None
    if s[0] in "PDCA":
        return s[0]
    return {"POR": "P", "DIF": "D", "CEN": "C", "ATT": "A"}.get(s[:3])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--segmento", default="10/500", choices=list(SEGMENTI),
                    help="quale colonna di prezzo usare (default 10 squadre / 500 crediti)")
    ap.add_argument("--diagnose", action="store_true",
                    help="non scrive file: riporta cosa trova nella pagina")
    ap.add_argument("--html", help="usa un file HTML salvato invece di scaricare")
    a = ap.parse_args()

    html = open(a.html, encoding="utf-8").read() if a.html else scarica()
    print(f"pagina: {len(html)} caratteri")

    df, come = da_tabella(html)
    if df is None or df.shape[0] < 50:
        df2, come2 = da_json(html)
        if df2 is not None and (df is None or df2.shape[0] > df.shape[0]):
            df, come = df2, come2
    if df is None:
        print("ESTRAZIONE FALLITA. Contenuto utile per capire come e' servita la pagina:")
        for pat, et in ((r"__NEXT_DATA__", "Next.js"), (r"window\.__", "stato JS"),
                        (r"/api/", "endpoint API"), (r"<table", "tabella HTML")):
            print(f"   {et:14s} {'presente' if re.search(pat, html) else 'assente'}")
        for m in list(re.finditer(r'["\'](/[a-z0-9\-/_]*api[a-z0-9\-/_]*)["\']', html))[:8]:
            print("   possibile endpoint:", m.group(1))
        sys.exit(1)
    print("estratto da:", come)

    col = individua_colonne(df, SEGMENTI[a.segmento])
    print("colonne individuate:", {k: str(v) for k, v in col.items() if k != "_prezzi"})
    print("colonne di prezzo:", {k: str(v) for k, v in col["_prezzi"].items()})
    if a.segmento not in col["_prezzi"]:
        print(f"ATTENZIONE: la colonna del segmento {a.segmento} non e' stata trovata.")
        print("Header disponibili:", [str(c) for c in df.columns])
        sys.exit(2)

    righe = []
    for _, r in df.iterrows():
        nome = ascii_only(r.get(col.get("nome"), "")).strip()
        ruolo = normalizza_ruolo(r.get(col.get("ruolo"), ""))
        squadra = ascii_only(r.get(col.get("squadra"), "")).strip()
        if not nome or not ruolo or nome.lower() in {"nan", "calciatore"}:
            continue
        rec = {"nome": nome, "ruolo": ruolo, "squadra": squadra,
               "quotazione": num(r.get(col.get("quot"))),
               "media_voto": fix_media_voto(r.get(col.get("mv"))),
               "presenze": num(r.get(col.get("pres")))}
        for et, c in col["_prezzi"].items():
            rec["prezzo_" + et.replace("/", "sq_")] = num(r.get(c))
        rec["_valore"] = rec.get("prezzo_" + a.segmento.replace("/", "sq_"))
        righe.append(rec)
    print(f"righe valide: {len(righe)}   con prezzo nel segmento {a.segmento}: "
          f"{sum(1 for x in righe if x['_valore'] is not None)}")

    if a.diagnose:
        print("\nesempio prime 5 righe:")
        for x in righe[:5]:
            print("  ", x)
        return

    campi = [k for k in righe[0] if not k.startswith("_")]
    with open("pma_raw.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campi, lineterminator="\n")
        w.writeheader()
        for x in righe:
            w.writerow({k: ("" if x[k] is None else x[k]) for k in campi})

    # 1) come richiesto: il prezzo medio finisce nella colonna punteggio
    with open("pma_template_prezzo.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["nome", "ruolo", "squadra", "punteggio", "titolarita"])
        for x in righe:
            if x["_valore"] is None:
                continue
            w.writerow([x["nome"], x["ruolo"], x["squadra"], int(round(x["_valore"])), ""])

    # 2) versione caricabile: prezzo -> rango nel ruolo -> punteggio 0-100
    #    invertendo la curva fm(s) del readme, cosi' la scala e' quella del motore
    with open("pma_template_score.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["nome", "ruolo", "squadra", "punteggio", "titolarita"])
        for ru in "PDCA":
            g = [x for x in righe if x["ruolo"] == ru and x["_valore"] is not None]
            g.sort(key=lambda x: -x["_valore"])
            n = len(g) or 1
            for i, x in enumerate(g):
                t = 1.0 - i / n                       # 1 = il piu' caro del ruolo
                s = S_MIN + (S_MAX - S_MIN) * (t ** (1.0 / GAMMA[ru]))
                w.writerow([x["nome"], ru, x["squadra"], int(round(s)), ""])

    print("\nscritti: pma_raw.csv, pma_template_prezzo.csv, pma_template_score.csv")
    for ru in "PDCA":
        v = sorted((x["_valore"] for x in righe
                    if x["ruolo"] == ru and x["_valore"] is not None), reverse=True)
        if v:
            print(f"   {ru}: n={len(v):3d}  max {v[0]:6.1f}  mediana {v[len(v)//2]:5.1f}  "
                  f"min {v[-1]:5.1f}  somma {sum(v):7.0f}")


if __name__ == "__main__":
    main()