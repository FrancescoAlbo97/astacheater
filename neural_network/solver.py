import string
from coach import Coach
import torch

from model import Model


class Solver:

    def __init__(self, weights_path: string, coaches: list, n_slots: int, players_score: dict, budget: int) -> None:
        self.players_score = players_score
        self.n_players = len(list(players_score.values()))
        self.my_name = coaches[0]
        self.n_coaches = len(coaches)
        self.n_slots = n_slots
        self.budget = budget
        self.coaches = {c: Coach(self.budget, self.n_slots) for c in coaches}
        network = Model(self.n_coaches, self.n_players, n_slots)
        network.load_state_dict(torch.load(weights_path, map_location=torch.device("cpu")))
        network.eval()
        self.network = network
        _temp: list = list(self.players_score.values())
        _temp.sort(reverse=True)
        self.ordered_players_score = _temp
        self.coaches_state = [0]*self.n_coaches

    def _call_network(self, coaches_state=None):
        if coaches_state is None:
            coaches_state = self.coaches_state
        return self.network(self.ordered_players_score, coaches_state)

    def _update_coaches_state(self) -> None:
        for i, coach in enumerate(self.coaches.values()):
            self.coaches_state[i] = coach.get_state()

    def calculate_price(self, player_score: float) -> int:
        price: int = 0
        
        for price in range(self.coaches[self.my_name].budget):
            if price > 1:
                buyer: int = list(self.coaches.keys())[1]
                self.new_purchase(buyer, player_score, price-1)
            self._update_coaches_state()
            old_rating = self._call_network()
            if price > 1:
                self._cancel_purchase(price, player_score, buyer)
                self._update_coaches_state()
            self.new_purchase(self.my_name, player_score, price)
            self._update_coaches_state()
            new_rating = self._call_network()
            self._cancel_purchase(price, player_score, self.my_name)
            if old_rating > player_score + new_rating:
                return price - 1
        return price

    def new_purchase(self, coach_name: string, player_score: float, price: int) -> float:
        # TODO ottimizzare
        for k, v in self.players_score.items():
            if v == player_score:
                self.players_score[k] = -1
                break
        self.coaches[coach_name].purchase_player(player_score, price)

    def _cancel_purchase(self, price: int, player_score: float, coach_name: string) -> None:
        # TODO ottimizzare
        for k, v in self.players_score.items():
            if v == -1:
                self.players_score[k] = player_score
        self.coaches[coach_name].cancel_purchase(price)


'''
    def calculate_price_from_player_name(self, player_name: string) -> int:
        price: int = 0
        self._update_state()
        old_rating = self.network(self.state)
        for price in range(self.coaches[self.my_name].budget):
            player_score: float = self.new_purchase(self.my_name, player_name, price)
            self._update_state()
            new_rating = self.network(self.state)
            self._cancel_purchase(player_name, price, player_score)
            if old_rating > player_score + new_rating:
                return price - 1
        return price
'''
