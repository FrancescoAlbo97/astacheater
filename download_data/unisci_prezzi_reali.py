#!/usr/bin/env python3
"""
Unisce il listone reale (nome, ruolo, squadra, punteggio, titolarita) con i
prezzi medi REALMENTE PAGATI di pma_raw.csv: dove esiste un prezzo reale nel
segmento scelto, sostituisce il punteggio con quel prezzo (che PUO' superare
100, di proposito: qui rappresenta crediti spesi, non piu' qualita' 0-100).
La titolarita' resta sempre quella del listone reale, invariata (e' gia'
nel formato 0-1 richiesto).

Dove un giocatore del listone non ha un prezzo osservato nel segmento (troppe
poche aste, §README), resta il suo punteggio originale — cosi' il file e'
completo e caricabile senza buchi.

USO
    python3 unisci_prezzi_reali.py [--segmento 10sq_500]
"""
from __future__ import annotations
import argparse, csv, re, unicodedata


def ascii_only(s: str) -> str:
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()


def surname_token(nome: str) -> str:
    """Primo token del nome, ripulito: stessa convenzione usata per gli altri
    incroci di questa sessione (i nomi del listone sono 'Cognome Iniziale',
    quelli di pma_raw.csv sono 'COGNOME  Nome' con doppio spazio)."""
    first = ascii_only(nome).strip().split()[0] if nome.strip() else ""
    return re.sub(r"[^a-z]", "", first.lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--segmento", default="10sq_500", choices=["8sq_350", "10sq_350", "8sq_500", "10sq_500"])
    ap.add_argument("--listone", default="listone_2026_27.csv")
    ap.add_argument("--pma", default="pma_raw.csv")
    ap.add_argument("--out", default="listone_prezzi_reali.csv")
    a = ap.parse_args()

    with open(a.listone, newline="", encoding="utf-8") as f:
        listone = list(csv.DictReader(f))

    with open(a.pma, newline="", encoding="utf-8") as f:
        pma = list(csv.DictReader(f))

    # indice pma per (cognome, ruolo): puo' avere piu' voci con lo stesso cognome
    # (es. due Martinez) - si tiene la lista, si sceglie in base al ruolo, e se
    # anche il ruolo coincide su piu' righe si scarta l'incrocio come ambiguo.
    pma_by_key = {}
    for r in pma:
        prezzo_raw = r.get("prezzo_" + a.segmento)
        if not prezzo_raw:
            continue
        key = (surname_token(r["nome"]), r["ruolo"])
        pma_by_key.setdefault(key, []).append(float(prezzo_raw))

    righe_out = []
    matched = 0
    ambiguous = 0
    for row in listone:
        key = (surname_token(row["nome"]), row["ruolo"])
        prezzi = pma_by_key.get(key)
        punteggio = row["punteggio"]
        if prezzi is not None:
            if len(prezzi) == 1:
                punteggio = str(round(prezzi[0], 2))
                matched += 1
            else:
                # stesso cognome+ruolo compare più volte nel segmento: non è chiaro quale
                # sia il giocatore giusto, si tiene il punteggio originale invece di
                # indovinare un incrocio sbagliato.
                ambiguous += 1
        righe_out.append(
            {
                "nome": row["nome"],
                "ruolo": row["ruolo"],
                "squadra": row["squadra"],
                "punteggio": punteggio,
                "titolarita": row["titolarita"],
            }
        )

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["nome", "ruolo", "squadra", "punteggio", "titolarita"], lineterminator="\n")
        w.writeheader()
        w.writerows(righe_out)

    over100 = sum(1 for r in righe_out if float(r["punteggio"]) > 100)
    print(f"listone: {len(listone)} giocatori")
    print(f"incrociati con un prezzo reale ({a.segmento}): {matched}")
    print(f"incroci ambigui (stesso cognome+ruolo, lasciato il punteggio originale): {ambiguous}")
    print(f"rimasti col punteggio originale (nessun prezzo osservato per quel giocatore): {len(listone) - matched - ambiguous}")
    print(f"righe col punteggio (ora prezzo) sopra 100: {over100}")
    print(f"scritto: {a.out}")


if __name__ == "__main__":
    main()
