import random
import torch
import torch.optim as optim
import torch.nn as nn
from tqdm import tqdm
import os
import matplotlib.pyplot as plt

from coach import Coach
from constants import *
from model import Model
from solver import Solver


class Training:
    def __init__(self, n_episodes: int, budget: int, n_slots: int, n_coaches: int, players_score: list,
                 alpha: float = ALPHA, deca_alpha_factor: float = DECA_ALPHA_FACTOR, eps: float = EPSILON,
                 deca_eps_factor: float = DECA_EPSILON_FACTOR, lr: float = LEARNING_RATE, gamma: float = GAMMA):
        self.alpha = alpha
        self.deca_alpha_factor = deca_alpha_factor
        self.epsilon = eps
        self.deca_eps_factor = deca_eps_factor
        self.gamma = gamma
        self.n_episodes = n_episodes
        self.players_score = players_score[:]
        self.players_score_backup = players_score[:]
        self.n_slots = n_slots
        self.n_coaches = n_coaches
        self.global_rating = [0] * self.n_coaches
        self.budget = budget
        self.coaches = [Coach(self.budget, self.n_slots) for _ in range(self.n_coaches)]
        self.coaches_state = [0] * self.n_coaches
        self.network = Model(n_coaches, len(players_score), n_slots).train()
        self.optimizer = optim.Adam(self.network.parameters(), lr=lr)
        self.loss = nn.L1Loss()
        self.rating_acc = []

    def run(self) -> None:
        plotting_dict: dict = {'0.09': [], '0.07': [], '0.06': [], '0.05': [], '0.04': [], '0.03': [], '0.01': []}
        # with open(os.path.join(os.getcwd(), 'logs', 'log.txt'), 'w') as fp:
        for i in tqdm(range(self.n_episodes)):
            # creating copy of players score and shuffle sequence
            players_score = self.players_score_backup[:]
            random.shuffle(players_score)
            self.players_score = players_score
            # init coaches
            self.coaches = [Coach(self.budget, self.n_slots) for _ in range(self.n_coaches)]
            self._update_coaches_state()
            # plotting stuff
            rating = self._call_network()
            self.rating_acc.append(rating.detach().numpy()[0])
            if i and (i + 1) % N_RATING_ACC == 0:
                self._accumulate_result(i, plotting_dict)
                if (i + 1) % N_PLOTTING == 0:  # cosi plotta solo nei multipli di N_RATING_ACC*N_PLOTTING
                    self._plot_results(plotting_dict)
            # start new episode
            self._run_episode(i)
            # training for finish of episode
            self._update_coaches_state()  # TODO forse non serve
            rating = self._call_network()
            self.optimizer.zero_grad()
            loss = self.loss(rating, torch.zeros(1))
            loss.backward()
            self.optimizer.step()
            # update params
            self.epsilon *= self.deca_eps_factor
            self.alpha *= self.deca_alpha_factor
            # logs stuff
            # row: list = [i, self.coaches_state[0], self.coaches_state[1], self.coaches_state[2],self.coaches_state[3] ]
            # fp.write("%s\n" % row)

    def _call_network(self, coaches_state=None):
        if coaches_state is None:
            coaches_state = self.coaches_state
        return self.network(self.players_score, coaches_state)

    def _run_episode(self, episode: int):
        # creating the stack where pop players score
        players_stack: list = self.players_score[:]
        self.players_score.sort(reverse=True)
        while len(players_stack) != 0:
            # saving the old state
            self._update_coaches_state()
            old_coaches_state: list = self.coaches_state[:]
            old_players_state = self.players_score[:]
            # players_stack is random
            player_score: float = players_stack.pop()
            i: int = self.players_score.index(player_score)
            self.players_score.pop(i)
            self.players_score.insert(len(self.players_score), PLAYER_PURCHASED_VALUE)
            # auction start for a player
            price, coach_idx = self._get_price_and_buyer(player_score)
            if coach_idx != -1:
                # some coach win the auction
                self.coaches[coach_idx].purchase_player(player_score, price)
                self._update_coaches_state()
                self._double_training(coach_idx, old_coaches_state, old_players_state, price, player_score)
            self._update_coaches_state()  # TODO penso sia superfluo
            new_rating: float = self._call_network()
            with_revenue: bool = coach_idx == 0
            old_rating = self.network(old_players_state, old_coaches_state)
            self._train_network(old_rating, new_rating, price, player_score, with_revenue)

    def _double_training(self, buyer_idx: int, old_coaches_state, old_players_score, price: int, player_score: float) -> None:
        idx: int = buyer_idx if buyer_idx != 0 else random.randint(1, self.n_coaches - 1)
        coaches_state = self._get_coach_view_state(idx, old_coaches_state)
        old_rating = self.network(old_players_score, coaches_state)
        new_rating = self._call_network(self._get_coach_view_state(idx))
        with_revenue: bool = buyer_idx != 0
        self._train_network(old_rating, new_rating, price, player_score, with_revenue)

    def _get_coach_view_state(self, view_idx: int, old_coaches_state=None) -> list:
        # TODO vedere se con lo switch cambia qualcosa
        if old_coaches_state is None:
            old_coaches_state = self.coaches_state[:]
        _temp = old_coaches_state.pop(view_idx)
        old_coaches_state.insert(0, _temp)
        return old_coaches_state

    def _update_coaches_state(self) -> None:
        for i, coach in enumerate(self.coaches):
            self.coaches_state[i] = coach.get_state()

    def _train_network(self, old_rating, new_rating, price: int, player_score: float, with_revenue: bool) -> None:
        revenue: float = self._get_revenue(price, player_score) if with_revenue else 0
        label = old_rating + self.alpha * (revenue + self.gamma * new_rating - old_rating)
        self.optimizer.zero_grad()
        loss = self.loss(old_rating, label)
        loss.backward()
        self.optimizer.step()

    def _get_price_and_buyer(self, player_score: float, price: int = 0, coach_idx: int = -1):
        while price < self.budget - self.n_slots:
            price += 1
            last_coach_idx: int = self._find_best_buyer(player_score, price)
            if last_coach_idx == -1:
                # last_coach_idx -1 means nobody offers more,
                # so we have 2 possibilities: nobody want or the previous coach want
                self._update_global_rating(coach_idx, price, player_score)
                break
            coach_idx = last_coach_idx
        return price - 1, coach_idx

    def _update_global_rating(self, buyer_idx: int, price: int, player_score: float, with_revenue: bool = False) -> None:
        if buyer_idx != -1:
            self.coaches[buyer_idx].purchase_player(player_score, price - 1)
        self._update_coaches_state()
        for i in range(self.n_coaches):
            revenue: float = self._get_revenue(price, player_score) if i == buyer_idx and with_revenue else 0
            self.global_rating[i] = self._call_network(coaches_state=self._get_coach_view_state(i)) #+ revenue
        if buyer_idx != -1:
            self.coaches[buyer_idx].cancel_purchase(price - 1)

    def _get_available_coaches(self, price: int) -> list:
        available_coaches: list = []
        for i, coach in enumerate(self.coaches):
            if coach.can_buy(price):
                available_coaches.append(i)
        return available_coaches

    def _find_best_buyer(self, player_score: float, price: int) -> int:
        available_coaches: list = self._get_available_coaches(price)
        ratings: list = []
        for i in available_coaches:
            self.coaches[i].purchase_player(player_score, price)
            self._update_coaches_state()
            delta_rating: float = self._call_network(self._get_coach_view_state(i)) + self._get_revenue(price, player_score) - self.global_rating[i]
            if random.random() < self.epsilon:
                if random.random() < 0.5:
                    delta_rating = 2
                else:
                    delta_rating = -2
            if delta_rating >= 0:
                ratings.append((i, delta_rating))
            self.coaches[i].cancel_purchase(price)
            # self._update_coaches_state()
        try:
            random.shuffle(ratings)
            buyer_idx: int = max(ratings, key=lambda r: r[1])[0]
            self._update_global_rating(buyer_idx, price, player_score, with_revenue=True)
        except:
            return -1
        return buyer_idx

    def _get_revenue(self, price: int, player_score: float):
        # score = price/(self.n_coaches*self.budget)
        return player_score  # - score #valutare se ha senso usare il budget residuo

    def _accumulate_result(self, i: int, plotting_dict: dict):
        weights_path = os.path.join(os.getcwd(), 'weights', "asta" + str(i) + ".pth")
        torch.save(self.network.state_dict(), weights_path)
        dict_players_score = {str(i): player for i, player in enumerate(self.players_score)}
        solver = Solver(weights_path, ['c1', 'c2', 'c3', 'c4'], self.n_slots, dict_players_score,
                        self.budget)
        for k in plotting_dict.keys():
            plotting_dict[k].append(solver.calculate_price(float(k)))

    def _plot_results(self, plotting_dict: dict):
        plt.subplot(2, 1, 1)
        for k, v in plotting_dict.items():
            x = v
            plt.plot(x, label=k)
        plt.xlabel('offerta per i giocatori')
        # plt.title(' ')
        plt.legend()
        plt.subplot(2, 1, 2)
        x = self.rating_acc
        plt.plot(x)
        plt.show()
