import torch
import torch.nn as nn
import torch.nn.functional as F

from constants import *


class Model(nn.Module):
    def __init__(self, n_coaches: int, n_players: int, n_slots: int):
        super(Model, self).__init__()
        self.n_coaches = n_coaches
        self.n_players = n_players
        self.n_slots = n_slots
        general_input_size: int = n_players + n_coaches * (n_slots + 1)
        general_output_size: int = int(n_coaches * (n_slots + 1) * 0.5)
        coach_input_size: int = n_coaches * (n_slots + 1)
        coach_output_size: int = int((n_slots + 1) * 0.5)
        '''
        self.general = nn.Sequential(
            nn.Linear(general_input_size, general_output_size),
            nn.LeakyReLU(0.1, inplace=True)
        )
        self.coach = nn.Sequential(
            nn.Linear(coach_input_size, coach_output_size),
            nn.LeakyReLU(0.1, inplace=True)
        )
        self.output = nn.Sequential(
            nn.Linear(general_output_size + (1 + coach_output_size) * n_coaches, out_features=1),
            nn.Sigmoid()
        )
        '''
        self.old = nn.Sequential(
            nn.Linear(40, 16),
            nn.LeakyReLU(0.1, inplace=True),
            nn.Linear(16, 1),
            nn.Sigmoid()
        )
        

    def forward(self, players_score, coaches):
        '''
        t1 = torch.tensor(coaches).float() 
        t2 = t1.clone().detach().requires_grad_(True)
        t1 = torch.unsqueeze(t1, dim=1)
        for i in range(1, self.n_coaches):
            a = torch.cat((t1[i].repeat(i, 1), t1[0], t1[i].repeat(self.n_coaches - 1 - i, 1)))
            t2 = torch.cat((t2, a), dim=0)
        t2 = t2.reshape(-1, self.n_coaches, self.n_slots).permute(1, 0, 2).reshape(4, -1)
        coaches_assess = torch.flatten(self.coach(t2))
        budgets = torch.squeeze(t1)[:, self.n_slots]
        general = torch.cat((torch.tensor(players_score), torch.flatten(t1)))
        general = self.general(general)
        x = self.output(torch.cat((coaches_assess, general, budgets)))
        '''
        tm = torch.tensor(players_score)
        t1 = torch.tensor(coaches).float() 
        x = torch.cat((tm, torch.flatten(t1)))
        x = self.old(x)
        return x
