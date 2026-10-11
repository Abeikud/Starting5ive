import { readFileSync, writeFileSync } from 'node:fs';
import type { Player, Position } from '../shared/types.ts';

const INPUT_FILE = new URL('../Player-per-game.csv', import.meta.url);
const OUTPUT_FILE = new URL('../server/data/players.json', import.meta.url);
const FIRST_SEASON = 1974; // first season the NBA recorded steals and blocks
const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

const [headerLine, ...dataLines] = readFileSync(INPUT_FILE, 'utf8').trim().split('\n');
const headers = headerLine.split(',');

const rows = dataLines.map((line) => {
  const values = line.split(',');
  const row: Record<string, string> = {};
  headers.forEach((header, i) => {
    row[header] = values[i];
  });
  return row;
});

const playersById = new Map<string, Player>();

for (const row of rows) {
  const year = Number(row.season);
  if (row.lg !== 'NBA' || year < FIRST_SEASON) {
    continue;
  }

  const id = `${row.player_id}-${year}`;
  const existing = playersById.get(id);
  if (existing !== undefined) {
    existing.team = existing.team.endsWith('TM') ? row.team : `${existing.team}/${row.team}`;
    continue;
  }

  const position = row.pos as Position;
  if (!POSITIONS.includes(position)) {
    console.warn(`Skipping ${row.player} ${year}: no position (${row.pos})`);
    continue;
  }

  playersById.set(id, {
    id,
    name: row.player,
    team: row.team,
    year,
    positions: [position],
    stats: {
      ppg: Number(row.pts_per_game),
      rpg: Number(row.trb_per_game),
      apg: Number(row.ast_per_game),
      spg: Number(row.stl_per_game),
      bpg: Number(row.blk_per_game),
    },
  });
}

const players = [...playersById.values()];
const json = `[\n${players.map((player) => JSON.stringify(player)).join(',\n')}\n]\n`;
writeFileSync(OUTPUT_FILE, json);
console.log(`Wrote ${players.length} player-seasons to server/data/players.json`);
