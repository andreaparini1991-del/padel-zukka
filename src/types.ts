export enum PlayerRole {
  TITOLARE = 'Titolare',
  SOSTITUTO = 'Sostituto',
}

export interface Player {
  id: number; // For starters, this is 1-12. For substitutes, it can be > 12 or a unique string.
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
  // Track who actually played in this match for each ID slot
  actualPlayers: { [originalId: number]: string }; // originalId -> playerName
}

export interface Round {
  number: number;
  matches: Match[];
  completed: boolean;
}

export interface LeaderboardEntry {
  name: string;
  role: PlayerRole;
  totalPoints: number;
  matchesPlayed: number;
}
