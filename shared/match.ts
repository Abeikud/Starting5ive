import { compareLineups } from './scoring.ts';
import type { CoachId, Lineup, MatchState, Player, Position } from './types.ts';

export const ROUNDS_TO_WIN = 3;
export const PLAYERS_PER_POSITION = 8;
const DRAFT_POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function createEmptyLineup(): Lineup {
  return { PG: null, SG: null, SF: null, PF: null, C: null, '6Man': null };
}

export function randomCoach(): CoachId {
  return Math.random() < 0.5 ? 'coach1' : 'coach2';
}

function pickRandom<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = 0; i < count && i < copy.length; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function dealDraftPool(allPlayers: Player[]): Player[] {
  return DRAFT_POSITIONS.flatMap((position) =>
    pickRandom(
      allPlayers.filter((player) => player.positions.includes(position)),
      PLAYERS_PER_POSITION,
    ),
  );
}

export function createMatch(allPlayers: Player[]): MatchState {
  return {
    lineups: { coach1: createEmptyLineup(), coach2: createEmptyLineup() },
    currentTurn: randomCoach(),
    roundWins: { coach1: 0, coach2: 0 },
    pool: dealDraftPool(allPlayers),
  };
}

export function startNextRound(match: MatchState, allPlayers: Player[]): MatchState {
  return {
    ...match,
    lineups: { coach1: createEmptyLineup(), coach2: createEmptyLineup() },
    currentTurn: randomCoach(),
    pool: dealDraftPool(allPlayers),
  };
}

export function isLineupFull(lineup: Lineup): boolean {
  return Object.values(lineup).every((player) => player !== null);
}

export function isRoundOver(match: MatchState): boolean {
  return isLineupFull(match.lineups.coach1) && isLineupFull(match.lineups.coach2);
}

export function otherCoach(coach: CoachId): CoachId {
  return coach === 'coach1' ? 'coach2' : 'coach1';
}

export function findOpenSlot(lineup: Lineup, player: Player): Position | null {
  for (const position of player.positions) {
    if (lineup[position] === null) {
      return position;
    }
  }
  if (lineup['6Man'] === null) {
    return '6Man';
  }
  return null;
}

export function draftPlayer(match: MatchState, player: Player): MatchState {
  const coach = match.currentTurn;
  const lineup = match.lineups[coach];
  const slot = findOpenSlot(lineup, player);
  if (slot === null) {
    return match;
  }
  const updated: MatchState = {
    ...match,
    lineups: { ...match.lineups, [coach]: { ...lineup, [slot]: player } },
    currentTurn: otherCoach(coach),
  };
  if (!isRoundOver(updated)) {
    return updated;
  }
  return {
    ...updated,
    roundWins: addRoundWin(updated.roundWins, compareLineups(updated.lineups)),
  };
}

export function addRoundWin(
  roundWins: Record<CoachId, number>,
  winner: CoachId | 'tie',
): Record<CoachId, number> {
  if (winner === 'tie') {
    return roundWins;
  }
  return { ...roundWins, [winner]: roundWins[winner] + 1 };
}

export function getMatchWinner(roundWins: Record<CoachId, number>): CoachId | null {
  if (roundWins.coach1 >= ROUNDS_TO_WIN) {
    return 'coach1';
  }
  if (roundWins.coach2 >= ROUNDS_TO_WIN) {
    return 'coach2';
  }
  return null;
}
