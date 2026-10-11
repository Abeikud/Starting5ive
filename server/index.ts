import { readFileSync } from 'node:fs';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/events.ts';
import {
  createMatch,
  draftPlayer,
  getMatchWinner,
  isRoundOver,
  startNextRound,
} from '../shared/match.ts';
import type { CoachId, MatchState, Player } from '../shared/types.ts';

const PORT = 3001;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: too easy to confuse with 1 and 0
const CODE_LENGTH = 4;
const HIDDEN_STATS = { ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0 };

const PLAYERS: Player[] = JSON.parse(
  readFileSync(new URL('./data/players.json', import.meta.url), 'utf8'),
);

interface Room {
  sockets: Record<CoachId, string | null>;
  match: MatchState | null;
}

interface SocketData {
  roomCode: string;
  coach: CoachId;
}

const rooms = new Map<string, Room>();

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  }
  return code;
}

function createRoomCode(): string {
  let code = randomCode();
  while (rooms.has(code)) {
    code = randomCode();
  }
  return code;
}

// Undrafted players are sent without stats so they can't be read in the browser.
function hideStats(match: MatchState): MatchState {
  return {
    ...match,
    pool: match.pool.map((player) => ({ ...player, stats: HIDDEN_STATS })),
  };
}

function isDrafted(match: MatchState, playerId: string): boolean {
  const drafted = [...Object.values(match.lineups.coach1), ...Object.values(match.lineups.coach2)];
  return drafted.some((player) => player?.id === playerId);
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  PORT,
  { cors: { origin: 'http://localhost:5173' } },
);

function sendMatch(code: string, match: MatchState) {
  io.to(code).emit('matchUpdate', hideStats(match));
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  function currentRoom(): Room | undefined {
    return rooms.get(socket.data.roomCode);
  }

  socket.on('createRoom', (reply) => {
    const code = createRoomCode();
    rooms.set(code, { sockets: { coach1: socket.id, coach2: null }, match: null });
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.coach = 'coach1';
    console.log(`Room ${code} created by ${socket.id}`);
    reply({ ok: true, code, coach: 'coach1' });
  });

  socket.on('joinRoom', (rawCode, reply) => {
    const code = rawCode.trim().toUpperCase();
    const room = rooms.get(code);
    if (room === undefined) {
      reply({ ok: false, error: 'Room not found' });
      return;
    }
    if (room.sockets.coach1 === socket.id) {
      reply({ ok: false, error: 'You are already in this room' });
      return;
    }
    if (room.sockets.coach2 !== null) {
      reply({ ok: false, error: 'Room is full' });
      return;
    }

    room.sockets.coach2 = socket.id;
    room.match = createMatch(PLAYERS);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.coach = 'coach2';
    console.log(`Room ${code} joined by ${socket.id}, match started`);
    reply({ ok: true, code, coach: 'coach2' });
    sendMatch(code, room.match);
  });

  socket.on('pick', (playerId) => {
    const room = currentRoom();
    const match = room?.match;
    if (room === undefined || match == null) {
      return;
    }
    if (match.currentTurn !== socket.data.coach || isRoundOver(match)) {
      return;
    }
    const player = match.pool.find((p) => p.id === playerId);
    if (player === undefined || isDrafted(match, playerId)) {
      return;
    }
    room.match = draftPlayer(match, player);
    sendMatch(socket.data.roomCode, room.match);
  });

  socket.on('nextRound', () => {
    const room = currentRoom();
    const match = room?.match;
    if (room === undefined || match == null) {
      return;
    }
    if (!isRoundOver(match) || getMatchWinner(match.roundWins) !== null) {
      return;
    }
    room.match = startNextRound(match, PLAYERS);
    sendMatch(socket.data.roomCode, room.match);
  });

  socket.on('playAgain', () => {
    const room = currentRoom();
    const match = room?.match;
    if (room === undefined || match == null || getMatchWinner(match.roundWins) === null) {
      return;
    }
    room.match = createMatch(PLAYERS);
    sendMatch(socket.data.roomCode, room.match);
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
  });
});

console.log(`Starting5ive server listening on port ${PORT} with ${PLAYERS.length} players`);
