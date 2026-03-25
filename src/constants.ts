import { Round, Match, Player, PlayerRole } from './types';

export const generatePlayers = (numCourts: number): Player[] => {
  return Array.from({ length: numCourts * 4 }, (_, i) => ({
    id: i + 1,
    name: `Giocatore ${i + 1}`,
    role: PlayerRole.TITOLARE,
  }));
};

export const generateRounds = (numCourts: number): Round[] => {
  const numPlayers = numCourts * 4;
  const rounds: Round[] = [];
  
  // For 12 players, we use the original specific algorithm
  if (numPlayers === 12) {
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
        },
        {
          id: `${k + 1}-2`,
          court: 2,
          teamA: [f(4, k), f(6, k)],
          teamB: [f(5, k), f(9, k)],
          scoreA: 0,
          scoreB: 0,
        },
        {
          id: `${k + 1}-3`,
          court: 3,
          teamA: [f(7, k), f(12, k)],
          teamB: [f(8, k), f(11, k)],
          scoreA: 0,
          scoreB: 0,
        }
      ];

      rounds.push({
        number: k + 1,
        matches: roundMatches,
        completed: false
      });
    }
    return rounds;
  }

  // General algorithm for other multiples of 4
  // We'll use a simple rotation method
  const numRounds = numPlayers - 1;
  const f = (x: number, k: number) => {
    return ((x - 2 + k) % (numPlayers - 1)) + 2;
  };

  for (let k = 0; k < numRounds; k++) {
    const playersInRound = [1];
    for (let i = 2; i <= numPlayers; i++) {
      playersInRound.push(f(i, k));
    }

    const roundMatches: Match[] = [];
    for (let c = 0; c < numCourts; c++) {
      const baseIdx = c * 4;
      roundMatches.push({
        id: `${k + 1}-${c + 1}`,
        court: c + 1,
        teamA: [playersInRound[baseIdx], playersInRound[baseIdx + 1]],
        teamB: [playersInRound[baseIdx + 2], playersInRound[baseIdx + 3]],
        scoreA: 0,
        scoreB: 0,
      });
    }

    rounds.push({
      number: k + 1,
      matches: roundMatches,
      completed: false
    });
  }
  
  return rounds;
};

export const INITIAL_ROUNDS: Round[] = generateRounds(3);
export const INITIAL_PLAYERS: Player[] = generatePlayers(3);
