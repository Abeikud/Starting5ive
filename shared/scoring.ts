import type { CoachId, Lineup, Player } from './types.ts';

export function playerScore(player: Player): number {
  const { ppg, rpg, apg, spg, bpg } = player.stats;
  return ppg + rpg + apg + spg + bpg;
}

export function lineupScore(lineup: Lineup): number {
  let total = 0;
  for (const player of Object.values(lineup)) {
    if (player !== null) {
      total += playerScore(player);
    }
  }
  return total;
}

export function compareLineups(lineups: Record<CoachId, Lineup>): CoachId | 'tie' {
  const coach1Score = lineupScore(lineups.coach1);
  const coach2Score = lineupScore(lineups.coach2);

  if (coach1Score > coach2Score) {
    return 'coach1';
  }
  if (coach2Score > coach1Score) {
    return 'coach2';
  }
  return 'tie';
}
