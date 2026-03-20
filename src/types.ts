export enum PlayerRole {
  TITOLARE = 'Titolare',
}

export interface Player {
  id: number;
  name: string;
  role: PlayerRole;
}

export interface Match {
  id: string;
  court: number;
  teamA: number[]; // IDs of players in Team A
  teamB: number[]; // IDs of players in Team B
  scoreA: number;
  scoreB: number;
}

export interface Round {
  number: number;
  matches: Match[];
  completed: boolean;
}

export interface LeaderboardEntry {
  name: string;
  totalPoints: number;
  matchesPlayed: number;
  wins?: number;
  losses?: number;
  avgPoints?: number;
  bestPartner?: string;
  nemesis?: string;
  trend?: ('W' | 'L')[];
  pointDiff?: number;
  lastDayWinRate?: number;
  maxTournamentMatches?: number;
  normPoints?: number;
  normDiff?: number;
  pointsConceded?: number;
  totalPointsMade?: number;
  daysPlayed?: number;
  isBomber?: boolean;
  isMuro?: boolean;
  isVeterano?: boolean;
  isInvincibile?: boolean;
}
