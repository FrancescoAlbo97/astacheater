import numpy as np


def generate_players_score(n_players: int, seed: int):
    np.random.seed(seed)
    players_score = np.random.randint(100, size=n_players)
    return (players_score / sum(players_score)).tolist()