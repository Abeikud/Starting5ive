# Starting5ive

A two-player online basketball draft game. Two coaches take turns drafting real NBA player-seasons into a starting five plus a 6th man, without seeing anyone's stats. When both lineups are full, the lineup with the better combined stats wins the round. First coach to **3 round wins** takes the match.

Built with **React + TypeScript + Vite** in the browser and a **Node + Socket.IO** server. Player data comes from Basketball-Reference (via Kaggle).

> A detailed, dated record of every change and the reasoning behind it is in [`docs/claude-log.md`](docs/claude-log.md).

---

## Contents

1. [Quick start](#quick-start)
2. [How to play](#how-to-play)
3. [Game rules](#game-rules)
4. [How the app works](#how-the-app-works)
5. [Project structure](#project-structure)
6. [Player data](#player-data)
7. [Multiplayer on the same Wi-Fi](#multiplayer-on-the-same-wi-fi)
8. [Taking it online (playing over the internet)](#taking-it-online-playing-over-the-internet)
9. [Troubleshooting](#troubleshooting)
10. [Commands](#commands)
11. [Known gaps and roadmap](#known-gaps-and-roadmap)
12. [Project history](#project-history)

---

## Quick start

You need **Node.js 24 or newer** (the server and scripts run `.ts` files directly, which needs Node 24).

```bash
npm install          # first time only, or after pulling new code
```

Then run **two things at the same time, in two terminals**:

| Terminal 1: game server | Terminal 2: website |
|---|---|
| `npm run server` | `npm run dev` |
| Wait for `Starting5ive server listening on port 3001 with 22104 players` | Wait for `Local: http://localhost:5173/` |

Open **http://localhost:5173** in **two browser windows** (one per coach) and follow [How to play](#how-to-play).

To stop either one, press **Ctrl+C** in its terminal. You don't need to restart after editing code: the server restarts itself on save, and the website updates instantly.

---

## How to play

1. **Window 1:** click **Play as Guest**, then **Create Game**. A 4-letter room code appears (e.g. `PXCB`).
2. **Window 2:** click **Play as Guest**, type the code, then click **Join Game**. Lowercase and extra spaces are fine.
3. The match starts in both windows. The left column shows `Room PXCB · You are Coach 1` (or 2), the score, and **whose pick it is**. The court half of the coach to pick has a gold outline.
4. On your turn, click a card in the **Draft Pool** (bottom left). The player drops into a slot on your half of the court, and the turn passes to your opponent.
   - Use the filter button next to **DRAFT POOL** to show only PG, SG, SF, PF or C.
5. When both lineups are full, the round winner is shown. Either coach clicks **Next Round** for a fresh pool.
6. First to 3 round wins sees **"Coach X wins the match!"**. **Play Again** starts a new match in the same room.
7. **Leave Game** takes you back to the start screen.

**Log In** is a placeholder; it doesn't do anything yet.

---

## Game rules

| Rule | Detail |
|---|---|
| **Pool** | Each round, 40 random player-seasons are dealt: **8 per position** (PG, SG, SF, PF, C), from every NBA season since 1973–74 |
| **First pick** | A coin flip at the start of every round |
| **Turns** | Coaches alternate after every successful pick |
| **Slots** | Each coach has 6: PG, SG, SF, PF, C and a 6th man |
| **Where a pick goes** | Automatically: the open slot matching the player's position; if that's taken, the 6th man slot; if both are full, the pick is refused |
| **Hidden stats** | Cards show only name, season, team and position. Stats stay hidden until the player is drafted |
| **Player score** | points + rebounds + assists + steals + blocks per game |
| **Lineup score** | the sum of all 6 players' scores (the 6th man counts the same as a starter) |
| **Round winner** | the higher lineup score. A tie gives nobody a point; you just play the next round |
| **Match winner** | first to **3** round wins |

Season years use the year the season **ended**: 2015–16 is shown as **2016**.

---

## How the app works

### The big picture

```
 Coach 1's browser                SERVER (port 3001)              Coach 2's browser
 ─────────────────          ───────────────────────────           ─────────────────
 clicks a card  ── "pick X" ──▶  is it their turn?
                                 is X in the pool, not drafted?
                                 draftPlayer(match, X)
     ◀──────── matchUpdate ──────────────┴──────── matchUpdate ───────▶
 redraws court                                                   redraws court
```

- **The server is the source of truth.** It stores every match, deals the pool, flips the coin, and checks every action. Browsers never change the match themselves; they send requests and display whatever the server sends back.
- **Invalid requests are ignored.** For example: picking out of turn, picking someone already drafted, or clicking Next Round twice. This also prevents cheating by editing the page.
- **Stats are hidden by the server.** Undrafted players are sent with all stats set to 0, so they can't be read with the browser's inspect tool. Drafted players carry their real stats, because the browser needs them to show who won the round.

### Socket.IO in three ideas

The browser and server stay connected through **Socket.IO**, a library built on WebSockets: an open, two-way connection, so the server can push updates instantly.

1. **Connections:** each browser connects once and gets a `socket` with a unique id.
2. **Events:** named messages in either direction. `socket.emit('pick', id)` sends; `socket.on('matchUpdate', ...)` listens.
3. **Rooms:** the server groups the two coaches of a match into a room named after the code, and sends updates to just that room.

The events (defined once in [`shared/events.ts`](shared/events.ts), so TypeScript checks both sides):

| Event | Direction | Purpose |
|---|---|---|
| `createRoom` | browser → server | Make a room. Reply: the code + "you are coach1" |
| `joinRoom(code)` | browser → server | Join a room. Reply: "you are coach2", or an error (`Room not found`, `Room is full`, `You are already in this room`) |
| `pick(playerId)` | browser → server | Draft a player |
| `nextRound` | browser → server | Start the next round (only after a round ends) |
| `playAgain` | browser → server | New match in the same room (only after someone wins) |
| `matchUpdate(match)` | server → both browsers | The full current match; sent when the match starts and after every valid action |

### The screens

`App.tsx` chooses what to show on the right side, in this order:

1. **A match exists:** the court.
2. **In a room, waiting:** the room code to share, "Waiting for opponent to join…", and Cancel.
3. **Clicked Play as Guest:** Create Game, or a room-code box with Join Game.
4. **Otherwise:** Log In / or / Play as Guest.

The left column holds the title, room info, scoreboard, status messages and buttons on top, and the draft pool (only during a match) on the bottom.

### The court

- The lines are an **SVG** drawing in [`CourtLines.tsx`](src/components/CourtLines.tsx). It uses `viewBox="0 0 94 50"`, so 1 unit = 1 foot and real NBA measurements are used directly (e.g. the 23.75 ft three-point arc). The right half is the left half mirrored.
- The wood floor is a CSS `repeating-linear-gradient`; `aspect-ratio: 94 / 50` keeps real proportions at any size.
- Slots are placed by percentage in [`Court.tsx`](src/components/Court.tsx) (C and PF on the blocks, SG and SF on the wings, PG at the top of the key), mirrored for Coach 2.
- Colours are CSS variables at the top of [`src/index.css`](src/index.css): dark navy page, basketball orange accent, gold for turn and winners, blue for Coach 1, red for Coach 2.

---

## Project structure

```
Starting5ive/
├── shared/                 Game logic used by BOTH browser and server
│   ├── types.ts            Player, Lineup, MatchState, CoachId…
│   ├── match.ts            createMatch, dealDraftPool, draftPlayer, startNextRound, getMatchWinner…
│   ├── scoring.ts          playerScore, lineupScore, compareLineups
│   └── events.ts           Socket.IO event list + RoomResult type
├── server/
│   ├── index.ts            Socket.IO game server: rooms, validation, hidden stats
│   └── data/players.json   22,104 player-seasons (generated, do not edit by hand)
├── src/                    Browser app (React)
│   ├── main.tsx            Entry point
│   ├── App.tsx             Screens, state, sends events, listens for matchUpdate
│   ├── socket.ts           The single connection to the server
│   ├── components/
│   │   ├── DraftPool.tsx   Scrollable pool + position filter
│   │   ├── PlayerCard.tsx  One card (no stats shown)
│   │   ├── Court.tsx       Court halves, slots, benches
│   │   └── CourtLines.tsx  SVG court markings
│   ├── App.css             Layout and component styles
│   └── index.css           Colour variables, page, buttons
├── scripts/
│   └── build-players.ts    CSV → server/data/players.json
├── docs/claude-log.md      Detailed change log
├── vite.config.ts          Vite settings (network access enabled)
└── Player-per-game.csv     Raw Kaggle data (input to the build script)
```

**Why `shared/`?** The browser and the server both need the same rules (types, scoring, round logic). Keeping them in one place means they can't drift apart. Imports inside `shared/` end in `.ts` (e.g. `'./types.ts'`) because Node, unlike Vite, doesn't guess file extensions.

---

## Player data

- **Source:** Kaggle "NBA Stats (1947-present)" by Sumitro Datta (Basketball-Reference data), file `Player Per Game.csv`, saved in the project root as `Player-per-game.csv`.
- **Converted by** `npm run build:players`, which writes [`server/data/players.json`](server/data/players.json).
- **What the script keeps:**
  - NBA only (ABA/BAA rows dropped).
  - Seasons from **1974** on, the first season with steals and blocks recorded.
  - Traded players: the combined full-season row, with teams joined like `PHO/WAS`.
  - One row with no position (Hayden Gray, 2026) is skipped, and the script prints a warning about it.
- **Ids** are Basketball-Reference's id + year, e.g. `curryst01-2016`, so players with the same surname never clash.
- **To update the data:** download a newer CSV, save it as `Player-per-game.csv` in the project root, and run `npm run build:players`.

No games/minutes filter is applied yet, so most random picks are role players; stars are rare.

---

## Multiplayer on the same Wi-Fi

Another computer, phone or tablet **on the same network** can play against you.

### How to do it

1. Start both terminals as usual (`npm run server` and `npm run dev`).
2. `npm run dev` prints two addresses:
   ```
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://192.168.2.240:5173/
   ```
3. **You** open the `Local` address. **Your friend** opens the **`Network`** address on their device.
4. One of you creates a game; the other joins with the code.
5. If macOS asks whether to allow **Node** to accept incoming connections, click **Allow**.

Your network address can change (router restart, different Wi-Fi). Just use whatever `Network:` shows each time; nothing needs editing.

### What we changed to make this work

Originally everything pointed at `localhost`, which means "this computer". On a friend's laptop, `localhost` is *their* laptop, where no server is running. Three changes fixed it:

| File | Change | Why |
|---|---|---|
| [`src/socket.ts`](src/socket.ts) | Server address is built from the page's own address: `` `${window.location.protocol}//${window.location.hostname}:3001` `` | A page opened at `192.168.2.240:5173` now connects to the server at `192.168.2.240:3001`, the same computer |
| [`server/index.ts`](server/index.ts) | CORS origin changed from `'http://localhost:5173'` to `/^http:\/\/[^/]+:5173$/` | Browsers block a page from connecting to a different address unless the server allows it. This allows any address on port 5173 |
| [`vite.config.ts`](vite.config.ts) | `server: { host: true }` | Vite only accepts visitors from your own computer by default; this opens it to your network |

**Be aware:** while it's running, anyone on the same Wi-Fi can open the game. Fine at home; think twice on public Wi-Fi.

---

## Taking it online (playing over the internet)

The same-Wi-Fi setup only works on your network and only while your computer is on. To play with friends anywhere, there are two routes.

### Option A: temporary tunnel (quick test)

Tools like **ngrok** or **Cloudflare Tunnel** give your running app a public web address that forwards to your computer.

- **Good for:** a one-off game with a friend elsewhere, no hosting setup.
- **Downsides:** only works while your computer and both terminals are running; the address changes each time on free plans; with the website and server on separate ports you'd need two tunnels (or first make the server serve the website, see below).

### Option B: deploy it properly (recommended, roadmap step 7)

Host the game on a service so it runs 24/7 at a permanent address.

1. **Make the server serve the website too.** `npm run build` produces the finished site in `dist/`. The server can hand out those files as well as running Socket.IO, so there's **one address and one port** for everything.
   - The page then connects to the server at its own address, with no port number needed.
2. **Make settings come from the environment, not hard-coded values:**
   - `PORT`: hosting services choose the port and pass it in as `process.env.PORT`.
   - CORS: lock it to your real site address (it's unnecessary if the server serves the site itself).
   - `src/socket.ts`: when served from the same address, simply connect to the page's own origin.
3. **Pick a host that supports always-on servers with WebSockets:** Render, Railway or Fly.io (all have free or cheap tiers).
   - Serverless platforms like Vercel's functions won't work: they can't keep connections open.
   - Free servers often "sleep" when unused and take a few seconds to wake up.
4. **Use HTTPS.** Hosts provide it automatically. Because `socket.ts` reuses the page's protocol, it switches to secure connections (`https:`/`wss:`) on its own.
5. **Before inviting strangers, finish steps 5 and 6** (below), so players see when it's their turn and aren't left stuck when an opponent disconnects.

### Later: accounts and saved data

Real **Log In**, saved records and match history need a database and an auth service. A good fit is **Supabase** (Auth + Postgres) alongside the Socket.IO server: the server checks the player's Supabase login when they connect. Rooms would also move from server memory into a database so they survive restarts.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| **"Could not reach the server"** on Create/Join | The game server isn't running | Start it: `npm run server` |
| **`Failed running 'server/index.ts'. Waiting for file changes before restarting`** | That line is only a summary; the real error is printed just above it. Usually `EADDRINUSE: address already in use :::3001` | Another copy of the server is already running. Press Ctrl+C in the other terminal. To find what's holding the port: `lsof -i :3001`, then stop that process |
| **`Port 5173 is in use`** | Another `npm run dev` is still running | Stop it with Ctrl+C in its terminal |
| **"Room not found"** | Wrong code, or the server restarted (rooms only live in memory) | Check the code, or create a new game |
| **"Room is full"** | Two coaches are already in that room | Create a new game |
| **Friend's device can't load the page** | Not on the same network, firewall, or using the `Local` address | Use the `Network:` address; same Wi-Fi; click **Allow** on the macOS firewall prompt (or allow Node in System Settings → Network → Firewall) |
| **Friend's page loads but can't create/join** | Server not running, or blocked by the firewall | Check terminal 1; allow Node through the firewall |
| **Clicking a card does nothing** | It's not your turn, the round is over, or the matching slot and 6th man are both full | Check "Coach X's pick" at the top left |
| **Page blank or broken after pulling new code** | Missing packages | `npm install`, then start both again |
| **Editor shows errors in `scripts/` or `server/`** (e.g. `Cannot find name 'node:fs'`) | The folder isn't included in a tsconfig | Folders must be listed in `tsconfig.node.json` → `include`. Then run "TypeScript: Restart TS Server" (Cmd+Shift+P) |
| **`npm run build:players` can't find the CSV** | File missing or misnamed | Save it as `Player-per-game.csv` in the project root |

---

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install packages (first time, or after pulling) |
| `npm run server` | Start the game server on port 3001; restarts on save (`node --watch`) |
| `npm run dev` | Start the website on port 5173 (local + network address) |
| `npm run build` | Type-check everything, then build the website into `dist/` |
| `npm run lint` | Check code style with ESLint |
| `npm run build:players` | Regenerate `server/data/players.json` from the CSV |
| `npm run preview` | Preview the built website |

---

## Known gaps and roadmap

Multiplayer roadmap:

| Step | Status |
|---|---|
| 1. Move game logic into `shared/` | ✅ Done |
| 2. Basic Socket.IO server | ✅ Done |
| 3. Rooms with codes | ✅ Done |
| 4. Connect the game page to the server | ✅ Done |
| (extra) Play on the same Wi-Fi | ✅ Done |
| 5. "Which coach am I": grey out the pool when it isn't your turn, label your side "You" | To do |
| 6. Disconnects: tell the opponent when someone leaves, rejoin after a refresh, delete empty rooms | To do |
| 7. Deploy online | To do |
| 8. Accounts, saved records, matchmaking | Later |

Other known gaps:

- **Log In** does nothing yet.
- **Leave Game** only resets your own screen; the opponent isn't told and the room stays on the server.
- Rooms are lost when the server restarts.
- The filter menu doesn't close when you click elsewhere on the page.
- No logo yet; the centre circle is ready for one (put an image in `src/assets/`).
- Stats of **drafted** players can still be seen with the browser's inspect tool (undrafted ones can't).

---

## Project history

| Date | Milestone |
|---|---|
| 29 Sep 2026 | Project created (React + TypeScript + Vite) |
| 30 Sep | Core types, lineup scoring, round-win logic |
| 1 Oct | Sample player data, PlayerCard component |
| 6 Oct | Draft pool, click-to-draft, best-of-3 rounds; real data from Kaggle (22,104 seasons) with random 8-per-position pools |
| 11 Oct | Hardwood SVG court, dark arena theme, position filter, landing page; multiplayer steps 1–4 (shared logic, Socket.IO server, rooms, online play) |
| 15 Oct | Playable from other devices on the same Wi-Fi |

Every change, with line-by-line explanations, is in [`docs/claude-log.md`](docs/claude-log.md).
