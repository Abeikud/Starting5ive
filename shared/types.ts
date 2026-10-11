export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C'| '6Man';

export interface Player {
  id: string;
  team: string;
  name: string;
  year: number;
  positions: Position[];
  stats: PlayerStats;
}
export interface PlayerStats {
  ppg: number;   // points per game
  rpg: number;   // rebounds per game
  apg: number;   // assists per game
  spg: number;   // steals per game
  bpg: number;   // blocks per game
}


export type Lineup = Record<Position, Player | null>;

export type CoachId = 'coach1' | 'coach2';

export interface MatchState {
  lineups: Record<CoachId, Lineup>;
  currentTurn: CoachId;
  roundWins: Record<CoachId, number>;
  pool: Player[];
}
