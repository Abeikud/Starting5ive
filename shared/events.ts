import type { CoachId, MatchState } from './types.ts';

export type RoomResult =
  | { ok: true; code: string; coach: CoachId }
  | { ok: false; error: string };

// Events the browser sends to the server.
export interface ClientToServerEvents {
  createRoom: (reply: (result: RoomResult) => void) => void;
  joinRoom: (code: string, reply: (result: RoomResult) => void) => void;
  pick: (playerId: string) => void;
  nextRound: () => void;
  playAgain: () => void;
}

// Events the server sends to the browser.
export interface ServerToClientEvents {
  matchUpdate: (match: MatchState) => void;
}
