import numpy as np
from numpy import ndarray

from constants import AVAILABLE_SLOT_VALUE


class Coach:
    def __init__(self, budget: int, n_slots: int) -> None:
        self.initial_budget = budget
        self.budget = budget
        self.players = np.array([-1]*n_slots)
        self.available_slots = n_slots
        self.n_slots = n_slots
        self.last_idx = 0

    def purchase_player(self, score: float, price: int):
        i: int = np.searchsorted(self.players, score, side='right')
        self.players = np.insert(self.players, i, score)[1:]
        self.budget -= price
        self.last_idx = i-1
        self.available_slots -= 1

    def cancel_purchase(self, cost: int):
        players = np.append(self.players[:self.last_idx], self.players[self.last_idx+1:])
        self.players = np.append(AVAILABLE_SLOT_VALUE, players)
        self.budget += cost
        self.available_slots += 1

    def get_state(self) -> ndarray:
        return np.append(self.players, float(self.budget) / self.initial_budget)

    def can_buy(self, price: int):
        return self.budget - self.available_slots + 1 >= price and self.has_available_slot()

    def has_available_slot(self):
        return self.available_slots != 0

