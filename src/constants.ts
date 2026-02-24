import { Round, Match } from './types';

const generateRounds = (): Round[] => {
  const rounds: Round[] = [];
  const starters = Array.from({ length: 12 }, (_, i) => i + 1);
  
  // S = {2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}
  const f = (x: number, k: number) => {
    return ((x - 2 + k) % 11) + 2;
  };

  for (let k = 0; k < 11; k++) {
    const roundMatches: Match[] = [
      {
        id: `${k + 1}-1`,
        court: 1,
        teamA: [1, f(10, k)],
        teamB: [f(2, k), f(3, k)],
        scoreA: 0,
        scoreB: 0,
        actualPlayers: {}
      },
      {
        id: `${k + 1}-2`,
        court: 2,
        teamA: [f(4, k), f(6, k)],
        teamB: [f(5, k), f(9, k)],
        scoreA: 0,
        scoreB: 0,
        actualPlayers: {}
      },
      {
        id: `${k + 1}-3`,
        court: 3,
        teamA: [f(7, k), f(12, k)],
        teamB: [f(8, k), f(11, k)],
        scoreA: 0,
        scoreB: 0,
        actualPlayers: {}
      }
    ];

    // Initialize actualPlayers with default starter names
    roundMatches.forEach(match => {
      [...match.teamA, ...match.teamB].forEach(id => {
        match.actualPlayers[id] = `Giocatore ${id}`;
      });
    });

    rounds.push({
      number: k + 1,
      matches: roundMatches,
      completed: false
    });
  }
  return rounds;
};

export const INITIAL_ROUNDS: Round[] = generateRounds();

export const INITIAL_PLAYERS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `Giocatore ${i + 1}`,
  role: 'Titolare',
}));
