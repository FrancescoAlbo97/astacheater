from constants import *
from solver import Solver
from training import Training
from utils import generate_players_score
import os

players_score = generate_players_score(N_PLAYERS, seed=1)
training = Training(N_EPISODES, BUDGET, N_SLOTS, N_COACHES, TEST_PLAYERS_SCORE)
training.run()
