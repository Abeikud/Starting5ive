import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const PORT = Number(process.env.PORT ?? 3001);
const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url));
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
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

// Serves the built website from dist/. Unknown paths get index.html.
async function serveWebsite(request: IncomingMessage, response: ServerResponse) {
  const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
  const filePath = normalize(DIST_DIR + (urlPath === '/' ? 'index.html' : urlPath));
  if (!filePath.startsWith(DIST_DIR)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    response.end(file);
  } catch {
    try {
      const index = await readFile(DIST_DIR + 'index.html');
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'] });
      response.end(index);
    } catch {
      response.writeHead(404).end('Website not built yet. Run npm run build.');
    }
  }
}

const httpServer = createServer(serveWebsite);

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  { cors: { origin: /^http:\/\/[^/]+:5173$/ } },
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

httpServer.listen(PORT, () => {
  console.log(`Starting5ive server listening on port ${PORT} with ${PLAYERS.length} players`);
});
