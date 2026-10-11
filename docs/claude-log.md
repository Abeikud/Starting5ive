# Claude change log

## 2026-09-30 — Core game types

**Prompt:** "coach id is fine when youre dfeinging the types i need explanation"

**Files changed:** `src/types.ts` (new)

**Explanation:**

- `export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';`
  A union of string literals: a `Position` can only be one of these five exact strings. `export` lets other files import it. Typos like `'Pg'` become compile errors.

- `export interface Player { ... }`
  Describes the shape of one season-specific NBA player (e.g. "2013 Kevin Durant"). Every `Player` object must have all four properties with these types.
  - `id: string;` — a unique key (e.g. `'durant-2013'`). Needed because the same person appears in multiple seasons, and React needs stable keys when rendering lists.
  - `name: string;` — the display name.
  - `season: number;` — the season year; a number so it can be sorted and compared.
  - `positions: Position[];` — an array of positions the player can fill (some players played more than one). Using `Position[]` instead of `string[]` means only valid positions are allowed.

- `export type Lineup = Record<Position, Player | null>;`
  `Record<Keys, Value>` builds an object type with one property per key. This means `{ PG: Player | null; SG: ...; SF: ...; PF: ...; C: ... }`. `Player | null` means each slot holds a player or `null` when empty (start of the draft). Because the keys come from `Position`, a lineup can never be missing a slot or have an extra one.

- `export type CoachId = 'coach1' | 'coach2';`
  Identifies which of the two human players something belongs to. Named "coach" so it isn't confused with an NBA `Player`.

- `export interface MatchState { ... }`
  Everything needed to describe a match in progress.
  - `lineups: Record<CoachId, Lineup>;` — one lineup per coach: `{ coach1: Lineup; coach2: Lineup }`.
  - `currentTurn: CoachId;` — whose pick it is right now.
  - `roundWins: Record<CoachId, number>;` — rounds won by each coach; first to 3 wins the match.

**Not yet included:** player stats/ratings. Deferred until we decide how lineups are compared.

## 2026-09-30 — Stats, team, and 6th man (edited by user)

**Prompt:** "keep option a but record option b in log"

**Files changed:** `src/types.ts` (edited by the user directly; no code changes by Claude in this entry)

**What changed in `src/types.ts`:**

- `export interface PlayerStats { ppg; rpg; apg; spg; bpg }`
  New interface grouping a player's per-game numbers (points, rebounds, assists, steals, blocks). Kept separate from identity fields so comparison logic can work with just the numbers.
- `Player` gained `team: string;` and `stats: PlayerStats;` — a nested object, accessed as `player.stats.ppg`.
- `Player.season` was renamed to `year`. Convention still to decide: whether `2013` means the 2012–13 or 2013–14 season (NBA usually uses the year the season ends).
- `Position` gained `'6Man'`: `'PG' | 'SG' | 'SF' | 'PF' | 'C' | '6Man'`. Because `Lineup = Record<Position, Player | null>`, every lineup now automatically has a sixth slot, and `MatchState` picks this up with no further changes.

**Rule decided:** any player can be drafted as the 6th man, regardless of their position.

**Decision: Option A (kept)** — `'6Man'` lives in `Position`.

**Option B (considered, not applied)** — keep `Position` for real basketball positions only, and add a separate type for board slots:

```ts
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type LineupSlot = Position | '6Man';
export type Lineup = Record<LineupSlot, Player | null>;
```

Why it was considered: `Position` is also used by `Player.positions`, so with Option A player data like `positions: ['6Man']` type-checks even though 6th man is a roster spot, not a position a player plays. Option B would make that a compile error while still giving `Lineup` six slots. Worth revisiting when writing player data or the "which slots can this player go in" logic.

## 2026-09-30 — Lineup scoring and comparison

**Prompt:** "for now just add the stats and compoare"

**Files changed:** `src/scoring.ts` (new)

**Rule implemented:** a player's score is ppg + rpg + apg + spg + bpg. A lineup's score is the sum of its players' scores (all six slots, including 6th man, count equally; empty slots count as 0). Higher lineup score wins the round; equal scores are a tie.

**Explanation:**

- `import type { CoachId, Lineup, Player } from './types';`
  Brings in the types from `types.ts`. `import type` tells TypeScript these are only types (erased at compile time), which this project's tsconfig (`verbatimModuleSyntax`) requires for type-only imports.

- `export function playerScore(player: Player): number {`
  A function that takes one `Player` and returns a `number`. The `: number` after the parentheses is the return type.
  - `const { ppg, rpg, apg, spg, bpg } = player.stats;` — destructuring: pulls the five stats out of `player.stats` into separate variables, so we don't have to write `player.stats.` five times.
  - `return ppg + rpg + apg + spg + bpg;` — adds them into one score.

- `export function lineupScore(lineup: Lineup): number {`
  Totals the scores of every player in a lineup.
  - `let total = 0;` — running total; `let` (not `const`) because it changes.
  - `for (const player of Object.values(lineup)) {` — `Object.values` gives an array of the lineup's values (the six `Player | null` slots); `for...of` loops over them.
  - `if (player !== null) {` — skips empty slots. Inside this block TypeScript knows `player` is a `Player` (called "narrowing"), so `playerScore(player)` is allowed.
  - `total += playerScore(player);` — adds this player's score to the total.
  - `return total;` — the lineup's final score.

- `export function compareLineups(lineups: Record<CoachId, Lineup>): CoachId | 'tie' {`
  Takes both coaches' lineups (the same shape as `MatchState.lineups`) and returns the winner's `CoachId`, or `'tie'`. The return type `CoachId | 'tie'` means the result can only be `'coach1'`, `'coach2'`, or `'tie'`.
  - `const coach1Score = lineupScore(lineups.coach1);` / `const coach2Score = ...` — score each lineup once and store it.
  - `if (coach1Score > coach2Score) { return 'coach1'; }` — coach 1 wins.
  - `if (coach2Score > coach1Score) { return 'coach2'; }` — coach 2 wins.
  - `return 'tie';` — only reached if neither is higher, i.e. they're equal.

**Open question:** what happens to `roundWins` on a tie (replay the round, or no one scores)? Not handled yet — that belongs in the match logic, not in scoring.

## 2026-09-30 — Round win tracking

**Prompt:** "you just redo the round with a diff draft"

**Files changed:** `src/match.ts` (new)

**Rule implemented:** a round winner gets +1 round win. A tie gives no one a point; the round is replayed with a fresh draft (starting the new draft is handled later in the match flow, not here). First coach to 3 round wins takes the match.

**Explanation:**

- `import type { CoachId } from './types';`
  Only `CoachId` is needed here; `import type` because it's type-only (`verbatimModuleSyntax`).

- `export const ROUNDS_TO_WIN = 3;`
  A named constant instead of writing `3` in several places. If the rule changes (e.g. first to 4), there's one line to edit. Uppercase name is the common convention for fixed config values.

- `export function addRoundWin(roundWins: Record<CoachId, number>, winner: CoachId | 'tie'): Record<CoachId, number> {`
  Takes the current score and the round result (exactly what `compareLineups` returns), and returns the updated score.
  - `if (winner === 'tie') { return roundWins; }` — tie: score unchanged. Returning the same object is fine since nothing changed.
  - `return { ...roundWins, [winner]: roundWins[winner] + 1 };` — builds a **new** object rather than modifying the old one (React state must be replaced, not mutated, for React to notice the change).
    - `...roundWins` (spread) copies all existing keys: `coach1: x, coach2: y`.
    - `[winner]:` is a computed key — the key name comes from the variable `winner`, so it's `coach1` or `coach2`. Because it comes after the spread, it overwrites that coach's copied value.
    - `roundWins[winner] + 1` — that coach's old count plus one. Inside this line TypeScript knows `winner` is a `CoachId` (the `'tie'` case already returned — narrowing), so `roundWins[winner]` is allowed.

- `export function getMatchWinner(roundWins: Record<CoachId, number>): CoachId | null {`
  Checks whether the match is over. Returns the winning coach, or `null` meaning "no winner yet, keep playing".
  - `if (roundWins.coach1 >= ROUNDS_TO_WIN) { return 'coach1'; }` — coach 1 has reached 3.
  - `if (roundWins.coach2 >= ROUNDS_TO_WIN) { return 'coach2'; }` — coach 2 has reached 3.
  - `return null;` — neither has.
  - `>=` rather than `===` is a small safety net: if a count ever went past 3 by mistake, it still counts as a win.

**How the pieces connect:** `compareLineups(lineups)` → `addRoundWin(roundWins, result)` → `getMatchWinner(newRoundWins)`.

## 2026-10-01 — Sample player data

**Prompt:** "in my Player ts generate 15 other player seasons filling in those attributes"

**Files changed:** `src/data/Player.ts` (user created the file with the import, the `PLAYER` array and the Curry entry; Claude added 15 entries and normalised spacing/formatting of the Curry entry — its data is unchanged)

**Conventions used:**
- `year` = the year the season **ended** (2016 = 2015–16 season), matching Basketball-Reference.
- `id` = lowercase surname + `-` + year, e.g. `'westbrook-2017'`. Unique even when the same player has several seasons.
- `team` = that season's team abbreviation (e.g. `'NOH'` for the 2008 New Orleans Hornets).
- `positions` = main position(s) that season; dual-position players get two (Harden `['SG', 'PG']`, LeBron `['SF', 'PF']`, Duncan `['PF', 'C']`).

**Players added (by position):**
- PG: Westbrook 2017, Chris Paul 2008, Magic Johnson 1987 (plus existing Curry 2016)
- SG: Harden 2019, Kobe Bryant 2006, Dwyane Wade 2009
- SF: Durant 2014, LeBron James 2013, Kawhi Leonard 2016
- PF: Giannis Antetokounmpo 2020, Tim Duncan 2002, Dirk Nowitzki 2007
- C: Shaquille O'Neal 2000, Nikola Jokić 2022, Hakeem Olajuwon 1994

**Explanation:** each entry is one object literal checked against the `Player` interface, with the same field-by-field meaning as the Curry entry (`id`, `name`, `team`, `year`, `positions`, `stats`). Two syntax details:
- `name: "Shaquille O'Neal"` uses double quotes because the name contains an apostrophe; with single quotes the `'` would end the string early.
- Every object ends with `},` — the comma separates array items. A comma after the last item (a trailing comma) is allowed and keeps diffs clean when adding players.

**Caveat:** stats were written from memory (per-game PTS/TRB/AST/STL/BLK for that regular season). Verify against Basketball-Reference before relying on them.

## 2026-10-01 — PlayerCard component

**Prompt:** "okay lets build the react component of the player card"

**Files changed:** `src/components/PlayerCard.tsx` (user had started it with the import line and an unfinished `interface;`; Claude completed it — import line kept as written)

**Explanation:**

- `import type { Player } from "../types";`
  Brings in the `Player` type. `..` goes up from `src/components/` to `src/`.

- `interface PlayerCardProps { player: Player; }`
  The component's props (inputs): it must be given exactly one `player` of type `Player`. TypeScript checks every `<PlayerCard ... />` usage against this — a missing, misspelled or wrongly-typed prop is a compile error.

- `export function PlayerCard({ player }: PlayerCardProps) {`
  A React component is a function that returns what to show. Capitalised name so React treats it as a component, not an HTML tag. React passes all props as one object; `{ player }` destructures `player` out of it. `export` so other files (DraftPool, App) can import it.

- `return ( ... );`
  Returns JSX (HTML-like syntax in `.tsx` files). The parentheses just let it span multiple lines.

- `<div className="player-card">`
  Wrapper for the card. `className` is JSX's version of HTML `class` (`class` is a reserved word in JavaScript). Gives CSS a hook for styling later.

- `<h3>{player.name}</h3>`
  Player's name as a heading. `{ }` switches from JSX into TypeScript to insert a value.

- `<p>{player.year} · {player.team}</p>`
  e.g. "2017 · OKC" — plain text and `{ }` values can be mixed.

- `<p>{player.positions.join(' / ')}</p>`
  `positions` is an array; `.join(' / ')` combines it into one string, e.g. `['SG', 'PG']` → "SG / PG".

- `<ul>` … `<li>PPG: {player.stats.ppg}</li>` … `</ul>`
  Unordered list with one `<li>` per stat (PPG, RPG, APG, SPG, BPG), reading from the nested `stats` object.

- `id` is intentionally not displayed — it's for the code (React keys, removing drafted players), not the user.

**Not yet done:** `App.tsx` is empty, so the app won't run until it renders something (e.g. one `PlayerCard`).

## 2026-10-06 — Scrollable draft pool on the left of the game page

**Prompt:** "for the mvpo the number of tdiff player dat we have is enugh. justs o you know well be having 8 players from each positon. now i want to focus on the draft pool component i want to have a scrollable component on one side the left side of the game page"

**Decision noted:** the current 16 players are enough for the MVP. The full game will have 8 players per position (40 total).

**Files changed:** `src/components/DraftPool.tsx` (user had written the two imports; Claude added the component), `src/App.tsx`, `src/App.css`, `src/index.css`

**Explanation — `DraftPool.tsx`:**

- `export function DraftPool() {` — a component with no props for now. It reads `PLAYER` directly. Once drafting removes players, it will take a `players` prop from `App` instead.
- `<aside className="draft-pool">` — `<aside>` is the HTML tag for a side panel next to the main content. The class lets the CSS place it on the left.
- `<h2>Draft Pool</h2>` — panel heading. It sits outside the scrolling area so it stays visible.
- `<div className="draft-pool-list">` — the box that scrolls. Only this part scrolls, not the whole page.
- `{PLAYER.map((player) => ( ... ))}` — `.map` runs once per player and returns a new array (here, an array of JSX elements), which React renders as a list.
- `<PlayerCard key={player.id} player={player} />` — React needs a unique, stable `key` for every list item so it can tell items apart when the list changes (for example, when a player is drafted and removed). `id` is unique, so it's used as the key. `player={player}` passes the data in as the prop that `PlayerCard` expects.

**Explanation — `App.tsx`:**

- `import "./App.css";` — loads the stylesheet. Vite bundles CSS that is imported like this.
- `import { DraftPool } from "./components/DraftPool";` — named import, because `DraftPool` uses `export function`.
- `<div className="game-page">` — the whole page; it holds the two columns.
- `<DraftPool />` — first child, so it becomes the left column.
- `<main className="game-area"><h1>Starting5ive</h1></main>` — right column. `<main>` marks the page's main content. It's a placeholder for the lineups and match UI.
- Removed the `PLAYER` / `PlayerCard` imports and the single test card, because `DraftPool` now renders all the cards.

**Explanation — `App.css`:**

- `.game-page { display: flex; height: 100vh; }` — flexbox puts the children side by side (left to right). `100vh` = 100% of the window height, which gives the panel a fixed height to scroll within.
- `.draft-pool { width: 300px; flex-shrink: 0; ... }` — fixed-width left column. `flex-shrink: 0` stops it from getting squeezed narrower on small screens.
- `display: flex; flex-direction: column;` (on `.draft-pool`) — stacks the heading and list vertically so the list can fill the remaining height.
- `border-right: 1px solid #ccc;` — a divider line between the pool and the game area.
- `.draft-pool h2 { margin: 0; padding: 12px 16px; }` — removes the default heading margin and adds even spacing.
- `.draft-pool-list { flex: 1; overflow-y: auto; ... }` — `flex: 1` makes the list take all the height left under the heading. `overflow-y: auto` shows a vertical scrollbar only when the cards don't fit. Without a limited height, the list would just grow and nothing would scroll. That's why the height chain `100vh` → column → `flex: 1` matters.
- `padding: 0 16px 16px;` — spacing around the cards (top 0, sides 16px, bottom 16px).
- `.game-area { flex: 1; padding: 16px; }` — the right column takes all the remaining width.

**Explanation — `index.css`:**

- `body { margin: 0; }` — browsers add an 8px margin to `<body>` by default. Combined with `100vh`, that makes the page 16px taller than the window and adds a second, page-level scrollbar. This removes it.

## 2026-10-06 — Match state with a random first pick

**Prompt:** "first player should be randomized"

**Interpreted as:** the coach who picks first is chosen at random when a match is created. (Whether to re-randomize each round is not decided yet.)

**Files changed:** `src/match.ts`, `src/App.tsx`

**Explanation — `match.ts`:**

- `import type { CoachId, Lineup, MatchState } from './types';` — adds `Lineup` and `MatchState` to the existing type import, because the new functions return them.
- `export function createEmptyLineup(): Lineup {` / `return { PG: null, ..., '6Man': null };` — a lineup with all six slots empty. `'6Man'` needs quotes because a JavaScript property name can't start with a digit unless it's written as a string. It's a function (not a shared constant) so every call returns a **new** object; the two coaches must never share one lineup object, or filling one would fill both.
- `export function randomCoach(): CoachId {` / `return Math.random() < 0.5 ? 'coach1' : 'coach2';` — `Math.random()` returns a number from 0 up to (but not including) 1. Below 0.5 is half the range, so each coach has a 50% chance. `? :` is the ternary operator: `condition ? valueIfTrue : valueIfFalse`.
- `export function createMatch(): MatchState {` — builds the starting state for a new match:
  - `lineups: { coach1: createEmptyLineup(), coach2: createEmptyLineup() },` — two separate empty lineups.
  - `currentTurn: randomCoach(),` — the random first pick.
  - `roundWins: { coach1: 0, coach2: 0 },` — both start at zero.

**Explanation — `App.tsx`:**

- `import { useState } from "react";` — the React hook that gives a component memory between redraws.
- `import { createMatch } from "./match";` / `import type { MatchState } from "./types";` — the setup function, and the type (type-only import because of `verbatimModuleSyntax`).
- `const [match] = useState<MatchState>(createMatch);`
  - `useState` returns a pair `[value, setter]`; array destructuring takes the first item and names it `match`. The setter (`setMatch`) is left out for now: the project's settings treat unused variables as errors, so it will be added in the click-to-draft step where it's used.
  - `<MatchState>` tells TypeScript what type the state holds.
  - `createMatch` is passed **without** `()`. React then calls it only once, on the first render. Writing `createMatch()` would call it on every redraw (re-rolling the coin each time and throwing the result away) — this is called a "lazy initializer".
- `<p>{match.currentTurn === 'coach1' ? 'Coach 1' : 'Coach 2'} picks first</p>` — a temporary display showing who won the coin flip, so you can see it change on page refresh.

## 2026-10-06 — Start Game button triggers the random first pick

**Prompt:** "basically you should only see who starts first after both players join the game but for now you should pick who starts first after player cliks start game"

**Decision noted:** the final version reveals who starts once both players have joined. For now, a Start Game button stands in for "both joined".

**Files changed:** `src/App.tsx`

**Explanation:**

- `const [match, setMatch] = useState<MatchState | null>(null);`
  - `MatchState | null` — the state is either a match or `null`, meaning "no game started yet".
  - `(null)` — the starting value, so the page loads with no match and no coin flip.
  - `setMatch` is now included because the button uses it.
- `function handleStartGame() { setMatch(createMatch()); }`
  - A click handler defined inside `App`. Naming convention: `handle` + event. Here `createMatch()` **is** called with `()` because we want a new match (and a coin flip) at the moment of the click; `setMatch` stores it and makes React redraw.
- `{match === null ? ( ... ) : ( ... )}` — a ternary inside JSX: show one thing or the other.
  - `<button onClick={handleStartGame}>Start Game</button>` — shown while there's no match. `onClick={handleStartGame}` passes the function itself (no `()`), so React calls it when the button is clicked. Writing `handleStartGame()` would run it immediately during rendering.
  - `<p>... picks first</p>` — shown once a match exists. In this branch TypeScript knows `match` isn't `null` (narrowing), so `match.currentTurn` is allowed.

**Later:** when there's a real "join" step, replace the button's trigger with "both players joined" — `createMatch()` itself doesn't change.

## 2026-10-06 — Click to draft into two lineups on the court

**Prompt:** "lets get the lineup concept . make a lineup concepts in which when i click a player card from draft pool it refelcts. on each side "sicne theres going to be a court" make  5 one side plus  one extra on each side"

**Slot rule chosen (temporary, user hadn't picked slot-first vs player-first):** a clicked player goes into the first open slot matching one of their positions; if none, the 6th man slot; if that's full too, the click does nothing. Turns alternate after every successful pick.

**Files changed:** `src/match.ts`, `src/components/PlayerCard.tsx`, `src/components/DraftPool.tsx`, `src/components/TeamLineup.tsx` (new), `src/App.tsx`, `src/App.css`

**Explanation — `match.ts`:**

- Import now also brings in `Player` and `Position`, used by the new functions.
- `export function otherCoach(coach: CoachId): CoachId` — returns the opposite coach; used to switch turns.
- `export function findOpenSlot(lineup: Lineup, player: Player): Position | null` — decides where a player goes.
  - `for (const position of player.positions)` — tries each of the player's positions in order (Harden `['SG', 'PG']` tries SG first).
  - `if (lineup[position] === null) { return position; }` — first empty matching slot wins.
  - `if (lineup['6Man'] === null) { return '6Man'; }` — fallback: any player can be 6th man.
  - `return null;` — nowhere to put them.
- `export function draftPlayer(match: MatchState, player: Player): MatchState` — returns the match after the current coach picks `player`.
  - `const coach = match.currentTurn;` / `const lineup = match.lineups[coach];` — whose pick it is, and their lineup.
  - `const slot = findOpenSlot(lineup, player);` / `if (slot === null) { return match; }` — no room: return the match unchanged (React sees the same object and doesn't redraw).
  - `return { ...match, lineups: { ...match.lineups, [coach]: { ...lineup, [slot]: player } }, currentTurn: otherCoach(coach) };` — builds new objects at every level that changes (match → lineups → this coach's lineup) and copies everything else with `...` spread. `[coach]` and `[slot]` are computed keys. Nothing is mutated, so React notices the change.

**Explanation — `PlayerCard.tsx`:**

- `onClick?: () => void;` — new optional prop. `?` means it can be left out (so the card still works where it isn't clickable). `() => void` is the type of a function that takes no arguments and returns nothing.
- `({ player, onClick }: PlayerCardProps)` — destructure the new prop too.
- `<div className="player-card" onClick={onClick}>` — runs the function when the card is clicked. If `onClick` is `undefined`, React simply attaches nothing.

**Explanation — `DraftPool.tsx`:**

- Removed `import { PLAYER }` and added `import type { Player }` — the pool no longer decides which players to show; `App` does.
- `interface DraftPoolProps { players: Player[]; onPick: (player: Player) => void; }` — the list to show, and a function to call with the clicked player.
- `players.map(...)` — loops over the passed-in list instead of `PLAYER`.
- `onClick={() => onPick(player)}` — an arrow function that remembers which `player` this card is for. It's needed because `PlayerCard`'s `onClick` takes no arguments, but `onPick` needs to know which player was clicked.

**Explanation — `TeamLineup.tsx` (new):**

- `const STARTER_SLOTS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];` — the five on-court slots in display order. Defined outside the component so it's created once, not on every render. `'6Man'` is deliberately left out; it's shown separately on the bench.
- `interface TeamLineupProps { title; lineup; isTurn }` — the heading ("Coach 1"), that coach's lineup, and whether it's their pick.
- `<section className={isTurn ? "team-lineup active" : "team-lineup"}>` — adds the `active` class when it's this coach's turn, so CSS can highlight it.
- `<div className="court-half">` + `STARTER_SLOTS.map((slot) => <LineupSlot key={slot} label={slot} player={lineup[slot]} />)` — one slot per starter position; the slot name is unique so it works as `key`.
- `<div className="bench"><LineupSlot label="6th Man" player={lineup['6Man']} /></div>` — the extra slot, outside the court.
- `function LineupSlot({ label, player }: LineupSlotProps)` — a small helper component, not exported because only `TeamLineup` uses it.
  - `{player === null ? "—" : player.name}` — a dash for an empty slot, otherwise the player's name.

**Explanation — `App.tsx`:**

- New imports: `TeamLineup`, `PLAYER` (the full list now lives here), `draftPlayer`, and the `Player` type.
- `const draftedPlayers = match === null ? [] : [...Object.values(match.lineups.coach1), ...Object.values(match.lineups.coach2)];` — every slot value from both lineups in one array (includes `null`s for empty slots). Before the game starts there are none.
- `const availablePlayers = PLAYER.filter((player) => !draftedPlayers.some((drafted) => drafted?.id === player.id));` — keeps only players not already in a lineup.
  - `.filter` keeps items where the function returns `true`.
  - `.some` returns `true` if any drafted entry matches; `!` flips it.
  - `drafted?.id` — optional chaining: if `drafted` is `null`, gives `undefined` instead of crashing.
  - This is **derived** from `match`, not stored in its own state — so it can never get out of sync with the lineups.
- `function handlePick(player: Player)` — `if (match === null) { return; }` ignores clicks before Start Game; otherwise `setMatch(draftPlayer(match, player));` stores the updated match.
- `<DraftPool players={availablePlayers} onPick={handlePick} />` — passes the filtered list and the handler down.
- `<> ... </>` — a Fragment: groups several elements without adding an extra `<div>` (a ternary branch must be a single element).
- `<p>...'s pick</p>` — whose turn it is now (replaces "picks first").
- `<div className="court">` with two `<TeamLineup ... />` — one per coach, each given its lineup and `isTurn`.

**Explanation — `App.css`:**

- `.player-card { cursor: pointer; }` — hand cursor, so cards look clickable.
- `.court { display: flex; gap: 16px; }` — the two sides next to each other with a gap.
- `.team-lineup { flex: 1; padding; border: 2px solid transparent; border-radius }` — each side takes half the width. The transparent border reserves space so the layout doesn't jump when the highlight appears.
- `.team-lineup.active { border-color: #e67e22; }` — orange outline on the side whose turn it is (both classes must be present).
- `.court-half { display: flex; flex-direction: column; gap: 8px; padding; background: #d9a66b; border-radius }` — stacks the five slots vertically on a hardwood-coloured background (placeholder for the court graphic).
- `.bench { margin-top: 12px; }` — separates the 6th man from the court.
- `.lineup-slot { display: flex; gap; padding; background: #fff; border; border-radius }` — a white box per slot, label and name side by side.
- `.slot-label { font-weight: bold; min-width: 56px; }` — bold position label; fixed minimum width so names line up.

**Known limitations:** a coach can get stuck if only one slot is open and no remaining player fits it (only the 6th man accepts anyone). Also no "round over" yet when both lineups are full — next steps.

## 2026-10-06 — Show the round winner when both lineups are full

**Prompt:** "okay now when both lineups are full it doesnt do anything i want you to call the compare lineus  to be able to give us the winner"

**Files changed:** `src/match.ts`, `src/App.tsx`

**Scope:** shows the winner and both scores. Does **not** yet add the win to `roundWins` or start a new draft — that's the next step.

**Explanation — `match.ts`:**

- `export function isLineupFull(lineup: Lineup): boolean {` / `return Object.values(lineup).every((player) => player !== null);`
  `Object.values` gives the six slot values; `.every` returns `true` only if the check passes for all of them — i.e. no empty slots.
- `export function isRoundOver(match: MatchState): boolean {` / `return isLineupFull(match.lineups.coach1) && isLineupFull(match.lineups.coach2);`
  The round ends when both lineups are full. `&&` = both must be true.

**Explanation — `App.tsx`:**

- `import { createMatch, draftPlayer, isRoundOver } from "./match";` — adds `isRoundOver`.
- `import { compareLineups, lineupScore } from "./scoring";` — the existing scoring functions: who won, and each lineup's total.
- `import type { CoachId, ... }` — `CoachId` is needed for the new helper's parameter.
- `function coachName(coach: CoachId): string { return coach === 'coach1' ? 'Coach 1' : 'Coach 2'; }`
  Turns `'coach1'` into the display text "Coach 1". Defined outside `App` because it doesn't use state, so it isn't recreated every render. Replaces the inline ternary used before.
- `const roundWinner = match !== null && isRoundOver(match) ? compareLineups(match.lineups) : null;`
  - If a match exists and the round is over, `compareLineups` returns `'coach1'`, `'coach2'` or `'tie'`; otherwise `null` ("still drafting").
  - `match !== null &&` comes first so `isRoundOver` is only called with a real match (TypeScript narrowing; JavaScript stops evaluating `&&` at the first `false`).
  - Derived from `match` on each render rather than stored in state — it can't get out of sync, and needs no extra `setMatch` call.
- `{roundWinner === null ? (<p>{coachName(match.currentTurn)}'s pick</p>) : (<div className="round-result"> ... </div>)}`
  While drafting, show whose pick it is; once the round is over, show the result instead.
  - `{roundWinner === 'tie' ? "It's a tie!" : `${coachName(roundWinner)} wins the round!`}` — in the second branch TypeScript knows `roundWinner` is a `CoachId` (the `'tie'` case was handled), so `coachName` accepts it. The backtick string is a template literal: `${...}` inserts a value.
  - `lineupScore(match.lineups.coach1).toFixed(1)` — each lineup's total. `.toFixed(1)` rounds to one decimal and returns a string; needed because adding decimals in JavaScript can produce results like `129.30000000000001`.
  - `{" "}` — an explicit space. JSX drops whitespace at line breaks, so without it the text would read "Coach 2:131.4".
- `isTurn={roundWinner === null && match.currentTurn === 'coach1'}` (and the same for coach 2) — no side is highlighted once the round is over, since nobody is picking.

**Note:** clicking a card after the round ends does nothing — `draftPlayer` finds no open slot and returns the match unchanged.

## 2026-10-06 — Round win tracker, totals removed

**Prompt:** "i need a round win checker also on the page after yoiu compare round and declare the winner of that round it should coach1: how many rounds theyve won    coahc2 h: how many rounds they won / i dobt need to see the torals the user doesnt need to see that"

**Decision noted:** players should not see lineup score totals — only who won.

**Files changed:** `src/match.ts`, `src/App.tsx`, `src/App.css`

**Explanation — `match.ts`:**

- `import { compareLineups } from './scoring';` — a normal (not `type`) import because it's a function used at runtime.
- In `draftPlayer`, the returned object is now stored first: `const updated: MatchState = { ...match, lineups: ..., currentTurn: ... };` — same contents as before, but kept in a variable so we can check it.
- `if (!isRoundOver(updated)) { return updated; }` — most picks: round still going, return as before.
- `return { ...updated, roundWins: addRoundWin(updated.roundWins, compareLineups(updated.lineups)) };` — the pick that fills the last slot: compare the lineups, add 1 to the winner (a tie adds nothing — `addRoundWin` already handles it), and return a new match with the updated `roundWins`.
- Why here and not in `App`: it runs exactly once, at the moment the round ends. Later clicks can't double-count because `draftPlayer` returns early (`slot === null`) when lineups are full.

**Explanation — `App.tsx`:**

- `import { compareLineups } from "./scoring";` — `lineupScore` removed, since totals are no longer shown. `compareLineups` is still used to show the round-winner message.
- `<div className="round-wins"><span>Coach 1: {match.roundWins.coach1}</span><span>Coach 2: {match.roundWins.coach2}</span></div>` — the round win tracker, read straight from the match state. Shown whenever a match exists (starts at 0–0) and updates as soon as a round ends.
- `{roundWinner === null ? (<p>...'s pick</p>) : (<h2>...wins the round!</h2>)}` — the result box with the totals line was reduced to just the winner heading; the `round-result` wrapper `<div>` is no longer needed.

**Explanation — `App.css`:**

- `.round-wins { display: flex; gap: 24px; font-weight: bold; }` — puts the two counts on one line with space between them, in bold.

## 2026-10-06 — Best to 3 rounds, pool resets each round, match winner

**Prompt:** "now lets get the game to 3 rounfds after every round reset draft pool. but this time theres no extra data so just use player dataa we have already till one coahc gets to 3 wins and display coach with 3 wins won"

**Defaults chosen (user didn't specify):** the next round starts when a **Next Round** button is clicked (so the round result stays visible); the first pick is re-randomized every round; ties are replayed with a fresh draft (as decided earlier) and give no point. A **Play Again** button was added after the match ends.

**Files changed:** `src/match.ts`, `src/App.tsx`

**Explanation — `match.ts`:**

- `export function startNextRound(match: MatchState): MatchState {` — returns the match ready for a new draft.
  - `...match,` — copies everything, which keeps `roundWins`.
  - `lineups: { coach1: createEmptyLineup(), coach2: createEmptyLineup() },` — empties both lineups. This is also what "resets" the draft pool: `availablePlayers` in `App` is "all players not in a lineup", so with empty lineups all 16 are back automatically.
  - `currentTurn: randomCoach(),` — a fresh coin flip for the first pick.

**Explanation — `App.tsx`:**

- Import adds `getMatchWinner` (already in `match.ts`, first to `ROUNDS_TO_WIN` = 3) and `startNextRound`.
- `const matchWinner = match === null ? null : getMatchWinner(match.roundWins);` — the coach with 3 wins, or `null` while the match is still going. Derived from state, like `roundWinner`.
- `function handleNextRound() { if (match === null) { return; } setMatch(startNextRound(match)); }` — click handler for the Next Round button. The `null` check is needed for TypeScript even though the button only appears during a match.
- The status area is now a three-way choice, written as a chained ternary (`a ? x : b ? y : z`):
  1. `matchWinner !== null` → `<h2>Coach X wins the match!</h2>` and `<button onClick={handleStartGame}>Play Again</button>`. Play Again reuses `handleStartGame`, which creates a brand-new match (0–0, empty lineups, new coin flip). Checked first, so the final round shows the match result instead of the round result.
  2. `roundWinner !== null` → the round result heading (unchanged) plus `<button onClick={handleNextRound}>Next Round</button>`.
  3. otherwise → `<p>Coach X's pick</p>` (still drafting).
  - `<> ... </>` groups the heading and button in each branch, since each branch must be one element.

**Known risk (still open):** with only 16 players, a coach can get stuck — e.g. their last open slot is SG and the other coach has taken Kobe, Wade and Harden. Clicks then do nothing and the round can't finish. Not fixed yet.

## 2026-10-06 — Real data from Basketball-Reference (Kaggle) + random 8-per-position pool

**Prompts:** "if the kaggle works better show me how to run that  and yes it should be random 8 players per posiiton  no filters yet" / "start from the seasons that recorded steals and blocks and the file is player-per-game.csv"

**Data source:** Kaggle "NBA Stats (1947-present)" by Sumitro Datta (Basketball-Reference data), file `Player Per Game.csv`, saved by the user as `Player-per-game.csv` in the project root.

**What the CSV looked like (checked before writing the script):** no quoted fields (safe to split on commas); `season` is already the end year (2015–16 = `2016`); every NBA row from 1974 has all five stats; every player has exactly one position per season; traded players have a combined `2TM`/`3TM` row listed **first**, followed by one row per team (verified for all 2,471 cases); one row (Hayden Gray 2026, 1 game) has position `NA`.

**Decisions:**
- Seasons from **1974** (1973–74, first season with steals and blocks), NBA only (ABA/BAA rows dropped). No minutes/games filters.
- `id` format changed from `curry-2016` to the Basketball-Reference id + year, e.g. `curryst01-2016`, because surnames collide across 22,000 seasons.
- The one row with no position is skipped (it can't go in any slot).
- Each match and each round deals a random **8 players per position** (40 total) from the full list.
- Side effect: the "coach gets stuck" problem is gone — every player has one position and the other coach can take at most 2 of any position, so at least 6 of each always remain.

**Files changed:** `scripts/build-players.ts` (new), `package.json`, `src/data/players.json` (new, generated — 22,104 player-seasons, 3.3 MB), `tsconfig.app.json`, `src/data/Player.ts`, `src/types.ts`, `src/match.ts`, `src/App.tsx`

**Explanation — `scripts/build-players.ts`** (run with `npm run build:players`; Node 24 runs `.ts` files directly by stripping the types):

- `import { readFileSync, writeFileSync } from 'node:fs';` — Node's file system functions. `node:` marks a built-in module.
- `import type { Player, Position } from '../src/types.ts';` — reuses the game's types so the output is guaranteed to match. Node needs the `.ts` extension written out.
- `const INPUT_FILE = new URL('../Player-per-game.csv', import.meta.url);` — `import.meta.url` is this script's own location, so the path works no matter which folder you run it from. Same for `OUTPUT_FILE`.
- `const FIRST_SEASON = 1974;` / `const POSITIONS: Position[] = [...]` — the cutoff and the five real positions (`'6Man'` isn't a position a player has).
- `const [headerLine, ...dataLines] = readFileSync(INPUT_FILE, 'utf8').trim().split('\n');` — reads the whole file as text, splits into lines; destructuring takes the first line as the header and the rest (`...`) as data.
- `const headers = headerLine.split(',');` — the column names.
- `const rows = dataLines.map((line) => { ... })` — turns each line into an object keyed by column name (`row.season`, `row.player`, ...), so the code reads by name instead of by column number.
  - `const row: Record<string, string> = {};` — an empty object whose keys and values are all strings.
  - `headers.forEach((header, i) => { row[header] = values[i]; });` — pairs each header with the value in the same position.
- `const playersById = new Map<string, Player>();` — a lookup table from id to player, used to spot the extra team rows of traded players. A `Map` keeps insertion order.
- `for (const row of rows) {` — one pass over every row:
  - `const year = Number(row.season);` — CSV values are text; `Number` converts.
  - `if (row.lg !== 'NBA' || year < FIRST_SEASON) { continue; }` — skip ABA/BAA and pre-1974 rows. `continue` jumps to the next row.
  - `const id = \`${row.player_id}-${year}\`;` — unique id per player-season.
  - `const existing = playersById.get(id); if (existing !== undefined) { ... continue; }` — this player-season was already added (from the combined row), so this row is one of their per-team rows. Its stats are ignored (the combined row already has full-season averages); only the team name is used:
    - `existing.team = existing.team.endsWith('TM') ? row.team : \`${existing.team}/${row.team}\`;` — the first team row replaces `"2TM"`; later ones are appended, giving e.g. `"PHO/WAS"`.
  - `const position = row.pos as Position;` / `if (!POSITIONS.includes(position)) { console.warn(...); continue; }` — skip rows whose position isn't one of the five (only `NA` in practice), and print which one so nothing is dropped silently. `as Position` tells TypeScript to treat the text as a `Position` so `includes` accepts it; the `includes` check is what actually makes it safe.
  - `playersById.set(id, { id, name: row.player, team: row.team, year, positions: [position], stats: { ppg: Number(row.pts_per_game), ... } });` — builds a `Player`. `id` and `year` use shorthand (`{ id }` = `{ id: id }`). The five stats come from the per-game columns (`trb` = total rebounds).
- `const players = [...playersById.values()];` — the Map's values as an array.
- `` const json = `[\n${players.map((player) => JSON.stringify(player)).join(',\n')}\n]\n`; `` — valid JSON with **one player per line**: compact like minified JSON, but still readable and diff-friendly.
- `writeFileSync(OUTPUT_FILE, json);` / `console.log(...)` — save and report the count.

**Explanation — `package.json`:**

- `"build:players": "node scripts/build-players.ts",` — `npm run build:players` regenerates `players.json` (e.g. after downloading a newer CSV).

**Explanation — `tsconfig.app.json`:**

- `"resolveJsonModule": true,` — lets TypeScript files `import` a `.json` file (Vite already supports it; this tells the type checker).

**Explanation — `src/data/Player.ts`** (the 16 hand-written players were replaced; all 16 are in the real data):

- `import players from './players.json';` — the generated data. Vite bundles it into the app.
- `export const PLAYER: Player[] = players as Player[];` — same export name as before, so nothing else had to change. `as Player[]` is needed because TypeScript reads JSON `positions` as plain `string[]`, not `Position[]`; the build script guarantees the values are valid.

**Explanation — `src/types.ts`:**

- `pool: Player[];` added to `MatchState` — the 40 players dealt for the current round. Stored in state because it's random: if it were recalculated on every render, the pool would change every click.

**Explanation — `src/match.ts`:**

- `export const PLAYERS_PER_POSITION = 8;` — named constant for the pool size per position.
- `const DRAFT_POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];` — the positions to deal from (not exported; only used here).
- `function pickRandom<T>(items: T[], count: number): T[] {` — returns `count` random items without repeats. `<T>` is a generic: it works for an array of anything and returns the same type.
  - `const copy = [...items];` — copy, so the original list isn't reordered.
  - `for (let i = 0; i < count && i < copy.length; i++) {` — only shuffles the first `count` places (a partial Fisher–Yates shuffle) — cheaper than shuffling all ~4,400 players of a position.
  - `const j = i + Math.floor(Math.random() * (copy.length - i));` — a random index from `i` to the end.
  - `[copy[i], copy[j]] = [copy[j], copy[i]];` — swap the two (destructuring assignment). Each position `i` gets a random player not already picked.
  - `return copy.slice(0, count);` — the first `count` items.
- `export function dealDraftPool(allPlayers: Player[]): Player[] {` — the 40-player pool.
  - `DRAFT_POSITIONS.flatMap((position) => pickRandom(allPlayers.filter((player) => player.positions.includes(position)), PLAYERS_PER_POSITION))` — for each position: filter to players at that position, pick 8 at random. `flatMap` joins the five arrays of 8 into one array of 40 (plain `map` would give an array of arrays).
- `createMatch(allPlayers: Player[])` — now takes the full list and adds `pool: dealDraftPool(allPlayers)`.
- `startNextRound(match: MatchState, allPlayers: Player[])` — also deals a fresh `pool` each round.
- The full list is passed in as a parameter (rather than imported here) so `match.ts` stays pure logic and could be tested with a small fake list.

**Explanation — `src/App.tsx`:**

- `const pool = match === null ? [] : match.pool;` — the dealt pool, or empty before Start Game.
- `const availablePlayers = pool.filter(...)` — was `PLAYER.filter(...)`; now filters the 40-player pool instead of every player.
- `setMatch(createMatch(PLAYER));` / `setMatch(startNextRound(match, PLAYER));` — pass the full list in.

**Verified:** `tsc -b` and `eslint .` pass; 3 test deals each gave 40 unique players, exactly 8 per position, different each time. Not yet clicked through in the browser.

## 2026-10-06 — Fix editor errors in build-players.ts

**Prompt:** "i see some errors in the build player ts"

**Files changed:** `tsconfig.node.json`

**The errors:** `Cannot find name 'node:fs'`, plus three "parameter implicitly has an 'any' type" errors (`line`, `header`, `i`).

**Cause:** `scripts/` wasn't included in any tsconfig, so VS Code checked the file with default settings that don't include Node's types. Without them TypeScript didn't know what `readFileSync` returns, so everything built from it (`line`, `header`, `i`) had no type either — one root error, three knock-on errors. The script itself always ran fine; this was only the type checker.

**Explanation:**

- `"include": ["vite.config.ts", "scripts"]` — adds the `scripts` folder to `tsconfig.node.json`, the config for code that runs in Node (not the browser). That config already has what the script needs: `"types": ["node"]` (knows `node:fs`), `"module": "nodenext"` (matches how Node runs the file), and `"allowImportingTsExtensions"` (allows `'../src/types.ts'`). The browser config, `tsconfig.app.json`, is the wrong home because it deliberately has no Node types.

**Bonus:** `npm run build` (`tsc -b`) now type-checks the script too, so mistakes in it are caught before running.

**Verified:** VS Code shows no errors in the file; `tsc -b` and `eslint .` pass.

## 2026-10-06 — Restart button with a fresh pool

**Prompt:** "I need a restart option. every restart also comes with a new set of pool"

**Interpreted as:** restart the whole match (0–0, new coin flip, new random pool). Not a "restart this round only" option.

**Files changed:** `src/App.tsx`

**Explanation:**

- `{matchWinner === null && <button onClick={handleStartGame}>Restart</button>}` — added inside the `round-wins` div, next to the two scores.
  - `condition && <element>` — common React pattern for "show only if": `&&` returns the element when the condition is true; when it's `false`, React renders nothing. Hidden after the match is won, because Play Again already does the same thing there.
  - `onClick={handleStartGame}` — reuses the Start Game handler (`setMatch(createMatch(PLAYER))`). `createMatch` already resets `roundWins` to 0–0, re-flips `currentTurn` with `randomCoach()`, and deals a new `pool` with `dealDraftPool(PLAYER)` — so no new logic was needed. The old lineups and pool are simply replaced.
  - No CSS change: `.round-wins` is already `display: flex` with a `gap`, so the button sits in line with the scores.

**Verified:** `tsc -b` and `eslint .` pass. Not clicked through in the browser.

## 2026-10-06 — Restart goes back to the landing page

**Prompt:** "restart should take you to the landing page"

**Interpreted as:** the landing page = the screen before a game starts (only the Start Game button), shown when `match` is `null`.

**Files changed:** `src/App.tsx`

**Explanation:**

- `function handleRestart() { setMatch(null); }` — new handler. Sets the match back to `null`, its value before any game. `App` already renders the landing screen when `match === null`, and `pool` becomes `[]`, so the draft pool empties too — no other code needed.
- `<button onClick={handleRestart}>Restart</button>` — was `onClick={handleStartGame}`, which jumped straight into a new match. Now it stops at the landing page; the next Start Game click calls `createMatch(PLAYER)`, which deals a new random pool, so "every restart gets a new pool" still holds.
- Unchanged: the button is still hidden once the match is won (`matchWinner === null &&`); Play Again still starts a new match directly.

**Verified:** `tsc -b` and `eslint .` pass. Not clicked through in the browser.

## 2026-10-11 — Draft pool at half height, card styling

**Prompt:** "I want to make the draft pool look better.  it should just take 50% of the vertical space on the. left and each player cad should be suy a porder for it top look like real cards. the cards shopuld have blue black backfround with white text"

**Files changed:** `src/App.css`

**Explanation — draft pool height:**

- `height: 50vh;` (added to `.draft-pool`) — `vh` = percent of the window height, so 50vh = half the screen. An explicit height overrides the default flex "stretch to full height". Scrolling still works because `.draft-pool-list` already has `flex: 1` (fill the remaining height under the heading) and `overflow-y: auto` (scroll when content is taller). The bottom-left of the page is now empty.

**Explanation — card styles (`.player-card` was only `cursor: pointer` before):**

- `margin-bottom: 12px;` — space between cards.
- `padding: 12px;` — space between the border and the text.
- `background: #0b1630;` — the blue-black background (very dark navy).
- `color: #fff;` — white text; children inherit it.
- `border: 2px solid #c0c8d8;` — a light silver frame, like a trading card's edge.
- `border-radius: 10px;` — rounded corners.
- `box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);` — soft shadow: 0 sideways, 2px down, 6px blur, 40%-opaque black. Makes the card look lifted.
- `.player-card:hover { border-color: #fff; }` — the frame turns white when the mouse is over a card, showing which one you're about to pick.
- `.player-card h3 { margin: 0 0 4px; }` — removes the browser's default gap above the name, keeps 4px below (top, left/right, bottom).
- `.player-card p { margin: 0 0 4px; font-size: 0.9rem; }` — same for the "year · team" and position lines; 90% text size so the name stands out.
- `.player-card ul { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; padding: 0; list-style: none; font-size: 0.85rem; }` — turns the stats from a bulleted column into compact wrapping rows: side by side, wrap when full, 4px between rows / 12px between items, no indent or bullets, slightly smaller text.
- Selectors like `.player-card h3` only target elements **inside** a card, so other headings are unaffected.

**Verified:** `vite build` succeeds. Its "chunk larger than 500 kB" warning comes from bundling the 3.3 MB `players.json`, not this change. Not checked visually in the browser.

## 2026-10-11 — Hide stats on player cards

**Prompt:** "so the cards should hide the stats everything else but the stats"

**Interpreted as:** cards show name, year · team and position — everything except the five stats. Stats stay in the data and are still used by scoring; coaches just draft without seeing them.

**Files changed:** `src/components/PlayerCard.tsx`, `src/App.css`

**Explanation — `PlayerCard.tsx`:**

- Removed the `<ul>` and its five `<li>` lines (`PPG: {player.stats.ppg}` … `BPG: {player.stats.bpg}`).
- Why remove instead of hiding with CSS (`display: none`): hidden elements are still in the page's HTML, so anyone could read the stats with the browser's inspect tool. Not rendering them at all keeps them off the page.
- The card still receives the full `player` (including `stats`); it just doesn't display them. `scoring.ts` reads stats from the player objects directly, so round results are unchanged.

**Explanation — `App.css`:**

- Removed the `.player-card ul { ... }` rule — it only styled the stats list, so with the list gone it no longer applies to anything.

**Verified:** `tsc -b` and `eslint .` pass. Not checked visually in the browser.

## 2026-10-11 — Draft pool in the bottom half, scrollbar hidden

**Prompt:** "okay i like ghow it looks but i want the draft pool toi start in the middle of the left pane and hide the scoll tracker"

**Clarified:** asked whether "start in the middle" meant the bottom half or vertically centred — user chose **bottom half** (pool's top edge at the middle of the screen).

**Files changed:** `src/App.css`

**Explanation — position:**

- `align-self: flex-end;` (added to `.draft-pool`) — `.game-page` is a `100vh` flex row; children sit at the top by default. `align-self` sets the vertical position of **one** child; `flex-end` = bottom. With `height: 50vh`, the pool's top edge lands exactly at the middle. The court area is unaffected; the pool's `border-right` divider now only spans the bottom half.

**Explanation — hidden scrollbar (scrolling still works because `overflow-y: auto` is kept):**

- `scrollbar-width: none;` (added to `.draft-pool-list`) — the standard CSS property to hide a scrollbar (Firefox, current Chrome/Edge, Safari 18.2+). Hides only the bar, not the scrolling.
- `.draft-pool-list::-webkit-scrollbar { display: none; }` — fallback for older Chrome/Safari that don't support `scrollbar-width`. `::-webkit-scrollbar` is a pseudo-element: it targets the scrollbar the browser draws, not an HTML element. Scoped to `.draft-pool-list` so other scrollbars are unaffected.
- Still scrollable with mouse wheel, trackpad or touch.

**Verified:** `vite build` succeeds. Not checked visually in the browser.

## 2026-10-11 — All controls moved to the left pane, court alone on the right

**Prompt:** "I want you to have every funtion on the right side except the court ui to be moved on top of the draftpool. sppt the starting5ive header+ coach wins trakcer, restart button everything should be on the left"

**Layout now:** left column = top half: header, Start Game, round-wins tracker + Restart, status (whose pick / round result + Next Round / match result + Play Again); bottom half: draft pool. Right side = court only (empty before a game starts).

**Files changed:** `src/App.tsx`, `src/App.css`

**Explanation — `App.tsx`** (no logic changed — only where elements sit):

- `<div className="left-pane">` — new wrapper for the left column, so the controls and the pool can be stacked by CSS. The page row now has two children: this and `<main>`.
- `<section className="game-controls">` — contains everything that used to be at the top of `<main>`: `<h1>`, the Start Game button, the `round-wins` div with Restart, and the status ternary. Contents identical, just moved and indented one level deeper. `<section>` = a self-contained part of the page.
- `<DraftPool ... />` — moved inside `left-pane`, after the controls, so it renders below them.
- `<main className="game-area">{match !== null && (<div className="court">...</div>)}</main>` — `<main>` now holds only the court. Previously it lived inside the `match === null ? ... : <>...</>` ternary with the scoreboard, so it now needs its own `&&` check (`match.lineups` doesn't exist before a game starts). The `<>...</>` fragment around it was removed because a single `<div>` needs no grouping.

**Explanation — `App.css`:**

- `.left-pane { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid #ccc; }` — new: the column. Width, no-shrink and divider moved here from `.draft-pool`; `flex-direction: column` stacks controls above the pool. No height needed — flex children of the `100vh` page row stretch to full height by default, so the divider runs the full height again.
- `.game-controls { flex: 1; overflow-y: auto; padding: 16px; }` — new: the top half. `flex: 1` takes whatever height the pool leaves (the other 50vh); `overflow-y: auto` lets it scroll rather than overlap the pool if content ever gets taller; padding matches the old right side.
- `.game-controls h1 { margin-top: 0; }` — removes the browser's default space above the heading.
- `.draft-pool` — now only `height: 50vh; display: flex; flex-direction: column;`. Removed `align-self: flex-end` (no longer needed: as the second child in a column under a `flex: 1` section it naturally sits in the bottom half) and `width`/`flex-shrink`/`border-right` (moved to `.left-pane`).
- `.round-wins` — added `flex-wrap: wrap;` (Restart can drop to a second line if the 300px column is too narrow) and `align-items: center;` (vertically lines the button up with the text; buttons are slightly taller).

**Note:** the editor briefly showed syntax errors between the two JSX edits (file was half-changed); final file is fine. Also fixed the court block's indentation.

**Verified:** `tsc -b`, `eslint .` and `vite build` pass. Not checked visually in the browser.

## 2026-10-11 — Hide the draft pool before the game starts

**Prompt:** "i dont want to see "Draft pool" before the game starts"

**Files changed:** `src/App.tsx`

**Explanation:**

- `{match !== null && <DraftPool players={availablePlayers} onPick={handlePick} />}` — was an unconditional `<DraftPool ... />`. Before a game, the pool is empty, so only its "Draft Pool" heading showed. Same "show only if" pattern as the court and Restart: when `match` is `null` the condition is `false` and React renders nothing, so the whole panel is gone. It appears on Start Game and disappears again on Restart (which sets `match` back to `null`).
- No CSS change needed: with the pool absent, `.game-controls` (`flex: 1`) simply fills the whole left column on the landing page.

**Verified:** `tsc -b` and `eslint .` pass. Not checked visually in the browser.

## 2026-10-11 — Hardwood court design

**Prompt:** "for now lets design the website now" — then chose style **Classic hardwood** and to start with the **Court**.

**Design:** one full court in NBA proportions (94 × 50 ft) — wood floor, white lines, centre circle, three-point arcs, free-throw circles, backboards and rims. Coach 1 = left half (blue key), Coach 2 = right half (red key, mirrored). Starters placed where they play (C/PF on the blocks, SG/SF on the wings, PG at the top of the key); filled slots are white badges, empty ones dashed and see-through. 6th man on a wooden bench under each half. Active turn = gold outline on that half.

**Files changed:** `src/components/CourtLines.tsx` (new), `src/components/Court.tsx` (new), `src/App.tsx`, `src/components/TeamLineup.tsx` (deleted), `src/App.css`

**Explanation — `CourtLines.tsx`** (SVG; `viewBox="0 0 94 50"` makes 1 unit = 1 foot, so real NBA measurements are used directly):

- `<svg className="court-lines" viewBox="0 0 94 50" aria-hidden="true">` — drawing area in feet, scaled to whatever size the court is; `aria-hidden` because it's decoration.
- `<rect x="0" y="0" width="94" height="50" />` — the boundary.
- `<line x1="47" y1="0" x2="47" y2="50" />` — the half-court line.
- `<circle cx="47" cy="25" r="6" />` — centre circle (6 ft radius).
- `<HalfCourtLines paintClass="paint-left" />` — the left end.
- `<g transform="translate(94 0) scale(-1 1)">` — a group that mirrors the left end onto the right: `scale(-1 1)` flips horizontally, `translate(94 0)` moves it back into view. One half is defined once and reused.
- `HalfCourtLines` (not exported):
  - `<rect className={paintClass} x="0" y="17" width="19" height="16" />` — the key: 16 ft wide, centred, 19 ft deep.
  - `<circle cx="19" cy="25" r="6" />` — free-throw circle.
  - `<path d="M 0 3 L 14.2 3 A 23.75 23.75 0 0 1 14.2 47 L 0 47" />` — three-point line: move to the corner (`M`), straight corner line (`L`), 23.75 ft arc (`A`; flags `0 0 1` = the short way round, bulging toward half court) to the other corner, straight back to the baseline. 14.2 is where a 23.75 ft circle around the basket meets the 3 ft corner line.
  - `<line className="backboard" ... />` — 6 ft backboard, 4 ft from the baseline.
  - `<circle className="rim" cx="5.25" cy="25" r="0.75" />` — 1.5 ft rim.
- No colours in the markup; CSS styles shapes by class.

**Explanation — `Court.tsx`:**

- `import type { CSSProperties } from "react";` — React's type for inline `style` objects.
- `type Side = 'left' | 'right';` — which half.
- `type StarterSlot = Exclude<Position, '6Man'>;` — `Exclude` removes members from a union: every position except 6th man. Derived from `Position`, so it stays in sync.
- `const STARTER_SLOTS: StarterSlot[]` — order the slots are created in.
- `const SLOT_POSITIONS: Record<StarterSlot, { x: number; y: number }>` — each starter's spot as percentages on the **left** half: `x` = % from the baseline toward half court, `y` = % down the court. `Record` forces an entry for all five. C `18/32`, PF `22/70`, SG `46/16`, SF `46/84`, PG `66/50`.
- `Court({ lineups, activeCoach })` — `activeCoach` is whose turn it is, or `null` when the round is over. Renders `.court-area` → `.court` (floor) containing `<CourtLines />` and two `<CourtHalf>`s (left = coach1, right = coach2, `isActive={activeCoach === ...}`), then `.benches` with a `<Bench>` per coach given that coach's `'6Man'`.
- `CourtHalf`:
  - ``className={`court-half ${side}${isActive ? ' active' : ''}`}`` — e.g. `"court-half left active"`; CSS uses `left`/`right` to place it and `active` for the gold outline.
  - `<span className="team-label">{title}</span>` — coach name in the corner.
  - `STARTER_SLOTS.map((slot) => { const { x, y } = SLOT_POSITIONS[slot]; return <LineupSlot ... />; })` — block body because it needs the lookup first.
  - ``style={{ left: `${side === 'left' ? x : 100 - x}%`, top: `${y}%` }}`` — positions the slot. On the right half `x` is flipped (`100 - x`) so the layout mirrors — one set of numbers for both halves.
- `Bench` — "Coach N bench" + a `LineupSlot` labelled "6th Man" (no `style`, so it's not positioned on the court).
- `LineupSlot` (moved from `TeamLineup.tsx`):
  - `style?: CSSProperties` — new optional prop: court slots pass a position, bench slots don't.
  - `className={player === null ? "lineup-slot empty" : "lineup-slot"}` — new `empty` class for styling unfilled slots.
  - `style={style}` — passed to the `<div>`; `undefined` adds nothing.
  - `<span className="slot-name">` — now has a class for styling.

**Explanation — `App.tsx`:**

- `import { Court } from "./components/Court";` — replaces the `TeamLineup` import.
- `<Court lineups={match.lineups} activeCoach={roundWinner === null ? match.currentTurn : null} />` — replaces the `.court` div and two `TeamLineup`s. Same highlight rule as the old `isTurn` props (current turn while drafting, nobody once the round is over), now computed once.

**`TeamLineup.tsx` deleted** — everything in it now lives in `Court.tsx` (`STARTER_SLOTS`, title → `team-label`, `isTurn` → `isActive`, bench, `LineupSlot`).

**Explanation — `App.css`** (old `.court`, `.team-lineup`, `.team-lineup.active`, `.court-half`, `.bench`, `.lineup-slot`, `.slot-label` rules replaced):

- `.court-area { max-width: 960px; margin: 0 auto; }` — caps the court size and centres it.
- `.court`:
  - `position: relative;` — reference box for the absolutely positioned lines, halves and slots.
  - `aspect-ratio: 94 / 50;` — real court proportions at any width (height is calculated from width).
  - `background: repeating-linear-gradient(180deg, #e3b781 0 14px, #d9ab72 14px 28px);` — hardwood: alternating 14px bands of two wood tones like floorboards.
  - `border: 6px solid #5a3a1e; border-radius: 4px; box-shadow: ...;` — dark wood frame, soft corners, shadow.
- `.court-lines { position: absolute; inset: 0; width: 100%; height: 100%; }` — stretch the SVG over the floor (`inset: 0` = top/right/bottom/left 0).
- `.court-lines * { fill: none; stroke: #fff; stroke-width: 0.3; }` — every shape as a white outline; width in feet so it scales.
- `.court-lines .paint-left { fill: rgba(29, 66, 138, 0.85); }` / `.paint-right { fill: rgba(200, 16, 46, 0.85); }` — blue and red keys, 85% opaque. They win over `fill: none` because two classes are more specific than one class + `*`.
- `.court-lines .rim { stroke: #e8590c; }` — orange rim.
- `.court-half { position: absolute; top: 0; bottom: 0; width: 50%; }` + `.left { left: 0; }` / `.right { right: 0; }` — invisible layers over each half.
- `.court-half.active { box-shadow: inset 0 0 0 4px #f5c242; }` — gold 4px line on the inside edge of the active half (replaces the orange border).
- `.team-label { ... }` + left/right variants — coach name tag in the outer top corner, white on dark see-through so it's readable on wood.
- `.lineup-slot { ... }` — white badge, 104px wide, label stacked over name, centred, dark border, rounded, shadow.
- `.lineup-slot.empty { background: rgba(255,255,255,0.35); border-style: dashed; }` — see-through dashed look for unfilled slots.
- `.court-half .lineup-slot { position: absolute; transform: translate(-50%, -50%); }` — only court slots: placed by the `left`/`top` from `Court.tsx`; the translate shifts back by half the badge's size so its **centre** sits on the spot.
- `.slot-label` / `.slot-name` — small grey bold position label; slightly bold name.
- `.benches { display: flex; justify-content: space-between; ... }` — two benches under the court, one at each end.
- `.bench { ... }` — dark wood bar with title and slot side by side.
- `.bench .lineup-slot.empty { background: rgba(255,255,255,0.1); border-color: #fff; color: #fff; }` + `.bench .lineup-slot.empty .slot-label { color: #ddd; }` — added after the first screenshot: the floor's empty style was grey-on-grey (unreadable) on the dark bench; this gives white dashed border and light text instead.
- `.bench-title` — bold bench name.

**Verified:** `tsc -b` and `eslint .` pass. Drove the app in headless Chrome (start game, draft 6 and then 9 players) and checked screenshots: court lines and keys correct, slots positioned without overlaps, mirroring correct, gold outline on the active half, no console errors. The bench contrast issue was found this way and fixed.

## 2026-10-11 — Dark page in game colours

**Prompt:** "i want dark colours fdor the page but should be game coulours"

**Interpreted as:** a dark "arena" page built from colours already in the game — near-black navy background, lighter navy panels, basketball orange for buttons/title, gold for turn + winners, team blue/red for Coach 1/Coach 2 (matching the painted keys). Court stays hardwood. Also switched the font from the browser default (Times) to the system sans-serif.

**Files changed:** `src/index.css`, `src/App.tsx`, `src/App.css`

**Explanation — `index.css`:**

- `:root { --bg: ...; ... }` — CSS variables (custom properties), defined once on the whole page and used with `var(--name)`. Changing a colour later = one line. Names must start with `--`.
  - `--bg #0a0e17` page background · `--panel #111a2c` left pane · `--panel-border #24314d` dividers · `--text #f1f3f7` main text · `--text-muted #9aa6bf` secondary text · `--accent #f58426` basketball orange · `--accent-hover #ff9a45` · `--gold #f5c242` · `--team1 #1d428a` blue · `--team2 #c8102e` red.
- `body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }` — dark page, light text; the font list is tried in order (`system-ui` = the OS's own UI font), nothing to download.
- `button { padding: 8px 18px; background: var(--accent); color: #111; font: inherit; font-weight: bold; border: 2px solid var(--accent); border-radius: 6px; cursor: pointer; }` — every button becomes an orange primary button. `font: inherit` stops buttons using the browser's separate button font. The same-colour border keeps primary and secondary buttons the same size.
- `button:hover { ... }` — lighter orange under the mouse.
- `button.secondary { padding: 4px 12px; background: transparent; color: var(--text-muted); border-color: var(--panel-border); }` + `:hover` — quieter outline button, only for buttons with `className="secondary"`.

**Explanation — `App.tsx`:**

- `<span className="score team1">` / `<span className="score team2">` — scores get a shared `score` pill style plus a team class for the coloured stripe.
- `<button className="secondary" onClick={handleRestart}>Restart</button>` — Restart uses the quieter style so it doesn't compete with Start Game / Next Round. Wrapped in `( )` over multiple lines because it got longer; logic unchanged.

**Explanation — `App.css`:**

- `.left-pane` — `background: var(--panel);` (sidebar slightly lighter than the page); `border-right` now `var(--panel-border)` instead of harsh `#ccc`.
- `.game-controls h1 { color: var(--accent); letter-spacing: 0.02em; }` — orange title, slightly spaced like a logo.
- `.game-controls h2 { margin: 16px 0 12px; color: var(--gold); font-size: 1.25rem; }` — round/match result headings in gold, sized for the narrow column.
- `.game-controls p { color: var(--text-muted); }` — "Coach X's pick" in quieter grey.
- `.draft-pool h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); border-top: 1px solid var(--panel-border); }` — "DRAFT POOL" as a small all-caps section label with a divider above. `text-transform` changes the display, not the text in the code.
- `.round-wins { gap: 8px; }` — was 24px; the scores are now padded pills so they need less space.
- `.score { padding: 4px 10px; background: var(--bg); border-left: 4px solid; border-radius: 4px; }` — dark pill with a 4px left stripe (colour supplied by the team rules).
- `.score.team1 { border-left-color: var(--team1); }` / `.score.team2 { ... var(--team2) }` — blue/red stripe; a two-class selector only matches elements with both classes.
- `.court-lines .paint-left { fill: var(--team1); fill-opacity: 0.85; }` (and `.paint-right` with `--team2`) — was `rgba(...)`; a variable holds a plain colour, so opacity moves to SVG's `fill-opacity`. Keys and scoreboard stripes now share one source.
- `.court-half.active { box-shadow: inset 0 0 0 4px var(--gold); }` — was hard-coded `#f5c242`.

**Verified:** `tsc -b`, `eslint .` and `vite build` pass. Screenshots in headless Chrome of the landing page, mid-draft, and a finished round: dark panels, orange title/buttons, blue/red score stripes, quiet Restart, gold round result, no console errors. Note: Restart wraps to its own line under the scores in the 300px column — looks fine.

## 2026-10-11 — Position filter on the draft pool

**Prompt:** "add a filter    button to the rirght ofo draftpool. itt brings a list to  filter by postions and er. by pg sg sf pf c"

**Clarified:** positions only ("er" was a typo, not era); one position at a time, plus "All".

**Files changed:** `src/components/DraftPool.tsx`, `src/App.css`

**Explanation — `DraftPool.tsx`:**

- `import { useState } from "react";` — the pool now has its own state. First child component with state: the filter only changes what the pool *shows*, not the game, so `App` doesn't need to know about it.
- `import type { Player, Position }` — added `Position` for the filter type.
- `type PositionFilter = 'All' | Exclude<Position, '6Man'>;` — the five real positions plus `'All'` (6th man is a slot, not a position).
- `const FILTER_OPTIONS: PositionFilter[] = ['All', 'PG', 'SG', 'SF', 'PF', 'C'];` — menu items in order.
- `const [positionFilter, setPositionFilter] = useState<PositionFilter>('All');` — current filter, starts showing everyone.
- `const [isFilterOpen, setIsFilterOpen] = useState(false);` — whether the menu is showing; type inferred from `false`.
- `const visiblePlayers = positionFilter === 'All' ? players : players.filter((player) => player.positions.includes(positionFilter));` — derived on each render (not stored), so drafting a player updates the filtered view automatically. In the `:` branch TypeScript has narrowed out `'All'`, so `includes` type-checks.
- `function handleSelectFilter(option: PositionFilter) { setPositionFilter(option); setIsFilterOpen(false); }` — choose and close in one click; React applies both updates in one redraw.
- `<div className="draft-pool-header">` — wraps heading + filter so CSS can put them on one row.
- `<div className="filter">` — wraps the button and its menu; the menu is positioned relative to it.
- Toggle button: `className="secondary"` (quiet outline style); `aria-expanded={isFilterOpen}` (tells screen readers whether the menu is open); `onClick={() => setIsFilterOpen(!isFilterOpen)}` (flip open/closed); label `{positionFilter} ▾` (current choice + arrow hint).
- `{isFilterOpen && (<ul className="filter-menu">...)}` — menu shown only while open.
- `FILTER_OPTIONS.map((option) => <li key={option}><button ...>{option}</button></li>)` — one clickable, keyboard-accessible button per option. `className={option === positionFilter ? "selected" : undefined}` highlights the current one (`undefined` = no class attribute). `onClick={() => handleSelectFilter(option)}` — arrow function so the handler knows which option.
- `visiblePlayers.map(...)` — the card list loops over the filtered list instead of `players`.
- Behaviour: filter persists between rounds (the pool stays mounted); Restart unmounts the pool, so it resets to All.

**Explanation — `App.css`:**

- `.draft-pool-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-top: 1px solid var(--panel-border); }` — heading left, filter right; padding/divider moved here from the `h2` so they span the whole row.
- `.draft-pool h2` — keeps only text styling (`margin: 0`, size, caps, spacing, grey).
- `.filter { position: relative; }` — reference box for positioning the menu.
- `.filter-menu`:
  - `position: absolute;` — floats over the cards instead of pushing them down.
  - `top: calc(100% + 4px); right: 0;` — just below the button, right edges aligned (opens leftward, stays in the column).
  - `z-index: 10;` — drawn in front of the cards.
  - `min-width: 96px; margin: 0; padding: 4px; list-style: none;` — sensible width, no default list spacing/bullets.
  - `background`, `border`, `border-radius`, `box-shadow: 0 6px 16px rgba(0,0,0,0.5)` — themed panel that looks lifted.
- `.filter-menu button { width: 100%; padding: 6px 10px; background: transparent; color: var(--text); font-weight: normal; text-align: left; border: none; border-radius: 4px; }` — overrides the global orange button style for menu items: full-width plain text rows. Wins because `.filter-menu button` (class + element) is more specific than `button`.
- `.filter-menu button:hover { background: var(--panel-border); }` — row highlight under the mouse.
- `.filter-menu button.selected { color: var(--accent); font-weight: bold; }` — current choice in bold orange.

**Verified:** `tsc -b` and `eslint .` pass. In headless Chrome: menu opens floating over the cards with "All" highlighted; choosing SF → 8 cards, all SF, button shows "SF ▾", menu closes; no console errors.

**Not included:** the menu doesn't close when clicking elsewhere on the page (only by choosing an option or clicking the button again).

## 2026-10-11 — Remove brown frame from court and bench

**Prompt:** "remove the brown borders arpoound the bench box and also the court box"

**Files changed:** `src/App.css`

**Explanation:**

- Removed `border: 6px solid #5a3a1e;` from `.court` — the dark-brown frame. The wood now runs to the edge; lines and slots are positioned in percentages of the inside, so they stay put (the court just gains the 6px the frame used). `border-radius: 4px` and the shadow remain for a clean edge on the dark page.
- Removed `background: #5a3a1e;` from `.bench` — the bench had no border; the brown was its whole background. With no background it's transparent, so the title and 6th Man badge sit directly on the dark page. `color: #fff`, padding and layout unchanged. The empty bench-slot style (white dashed border, light text) was already made for a dark background, so it still reads well.
- No `#5a3a1e` left in the stylesheet.

**Verified:** screenshot in headless Chrome after a finished round — no frame on the court, no brown behind the benches, no console errors.

## 2026-10-11 — Log In button on the landing page

**Prompt:** "before game lkoads, on the landing apge add a log in button in the middle of the right side where there is nothing"

**Scope:** visual only — there's no login system yet, so the button has no `onClick` and does nothing when clicked. To be wired up once login is designed.

**Files changed:** `src/App.tsx`, `src/App.css`

**Explanation — `App.tsx`:**

- `{match === null ? (<div className="landing">...</div>) : (<Court ... />)}` — was `{match !== null && <Court ... />}`. Changed from "show only if" (`&&`) to "this or that" (ternary) because the right side now shows something in both states: the landing area before a game, the court during one (unchanged).
- `<div className="landing">` — wrapper that fills the right side so CSS can centre the button in it.
- `<button className="login-button">Log In</button>` — gets the global orange button style; `login-button` makes it bigger. No `onClick` yet.

**Explanation — `App.css`:**

- `.landing { height: 100%; display: flex; align-items: center; justify-content: center; }` — `height: 100%` makes the wrapper as tall as `.game-area` (which stretches to the full window height in the `100vh` page row); without it, the wrapper would only be as tall as the button and vertical centring would do nothing. `justify-content: center` centres horizontally, `align-items: center` vertically — the standard flexbox "dead centre".
- `.login-button { padding: 14px 40px; font-size: 1.1rem; }` — larger than the default button (8px 18px) so it reads as the main action.

**Verified:** `tsc -b` and `eslint .` pass. Headless Chrome: on the landing page the button's centre measured (870, 450) — exactly the middle of the right side (x 300–1440, height 900); after Start Game the button is gone and the court shows; no console errors.

## 2026-10-11 — "or Play as Guest" under Log In

**Prompt:** "underneat add  or " play as guest. button"

**Decision:** Play as Guest **works now** — it starts the game like Start Game (a guest needs no account). Log In still does nothing. Guest uses the quieter `secondary` style so Log In stays the main choice.

**Files changed:** `src/App.tsx`, `src/App.css`

**Explanation — `App.tsx`:**

- `<span className="landing-or">or</span>` — the small connector text between the buttons.
- `<button className="secondary" onClick={handleStartGame}>Play as Guest</button>` — outline style; reuses the Start Game handler, so it creates a match (fresh pool, coin flip) and the court replaces the landing area.

**Explanation — `App.css`:**

- `.landing` — added `flex-direction: column;` (stack Log In / or / Guest vertically instead of side by side; in a column, `justify-content: center` now centres vertically and `align-items: center` horizontally, so the group stays dead centre) and `gap: 12px;` (space between items).
- `.landing-or { color: var(--text-muted); font-size: 0.9rem; }` — small grey "or".

**Verified:** `tsc -b` and `eslint .` pass. Headless Chrome: Log In / or / Play as Guest stacked and centred; clicking Play as Guest showed the court and 40 pool cards with the landing area gone; no console errors.

## 2026-10-11 — Multiplayer roadmap step 1: move game logic into `shared/`

**Prompt:** "following the road map how do i do the first part"

**Goal:** separate code the future server will need from browser-only code. Pure reorganisation — the game behaves exactly the same.

**Decisions:**
- Kept `src/` as the browser folder instead of renaming it to `client/` (renaming would touch Vite config, tsconfigs and `index.html` for no benefit).
- Kept **one** `package.json` (no workspaces/monorepo) — simpler while learning; can split later.
- `src/data/` (players) stays for now; it moves server-side in roadmap step 4 when the server does the dealing.

**Files changed:** `src/types.ts` → `shared/types.ts`, `src/match.ts` → `shared/match.ts`, `src/scoring.ts` → `shared/scoring.ts` (moved with `mv`, not `git mv`, to leave the git staging area alone); import updates in `shared/match.ts`, `shared/scoring.ts`, `src/App.tsx`, `src/components/Court.tsx`, `src/components/PlayerCard.tsx`, `src/components/DraftPool.tsx`, `src/data/Player.ts`, `scripts/build-players.ts`; `tsconfig.app.json`; `tsconfig.node.json`.

**Explanation — imports inside `shared/`:**

- `shared/match.ts`: `'./scoring'` → `'./scoring.ts'`, `'./types'` → `'./types.ts'`. `shared/scoring.ts`: `'./types'` → `'./types.ts'`.
- Why the extension: Vite guesses file extensions, but Node running TypeScript directly does **not** — without `.ts` it fails with "module not found" (seen earlier when a test script imported `match.ts`). Both tsconfigs already allow `.ts` in import paths (`allowImportingTsExtensions`). With the extension, the same files work in the browser build and on a Node server.

**Explanation — browser-side imports** (only the path changed; same names; kept the existing no-extension style since only Vite builds these):

- `src/App.tsx`: `"./match"` / `"./scoring"` / `"./types"` → `"../shared/match"` / `"../shared/scoring"` / `"../shared/types"` — `..` goes up from `src/` to the project root, then into `shared/`.
- `src/components/Court.tsx`, `PlayerCard.tsx`, `DraftPool.tsx`, `src/data/Player.ts`: `"../types"` → `"../../shared/types"` — two levels up because these files are one folder deeper.
- `scripts/build-players.ts`: `'../src/types.ts'` → `'../shared/types.ts'` (keeps `.ts` because Node runs it).

**Explanation — tsconfigs:**

- `tsconfig.app.json`: `"include": ["src", "shared"]` — browser rules check the shared code.
- `tsconfig.node.json`: `"include": ["vite.config.ts", "scripts", "shared"]` — Node rules check it too. Checking under both means browser-only APIs (like `document`) in shared code would be caught before they break the server.

**Verified:**
- `tsc -b`, `eslint .`, `vite build` pass.
- Node ran `shared/match.ts` directly (no Vite, no extra tools): dealt 40, flipped the coin, drafted a full round with `draftPlayer`, scored it — what the server will do in step 2.
- Headless Chrome: played a full round as before ("Coach 1 wins the round!", scoreboard 1–0), no console errors.

**Next (roadmap step 2):** a basic Node + Socket.IO server in `server/` that imports from `shared/` and keeps each room's match in memory.

## 2026-10-11 — Multiplayer roadmap step 2: basic Socket.IO server

**Prompts:** "why socket.io?" / "why nt supabase?" / "okay lets use socket.io"

**Decision:** Socket.IO (own Node server) over Supabase for the live game — most direct path to two browsers playing one match, and teaches how multiplayer works underneath. Supabase Auth/DB can still be added later for login (the "middle path"); nothing here would need undoing.

**Concepts:** a **connection** gives each browser a `socket` with a unique `socket.id`; **events** are named messages sent with `emit` and received with `on`, in either direction; **rooms** group sockets so the server can send to just the players in one match (`socket.join(code)`, `io.to(code).emit(...)`) — rooms are step 3.

**Files changed:** `package.json` (+ `package-lock.json`), `shared/events.ts` (new), `server/index.ts` (new), `tsconfig.node.json`

**Explanation — install:**

- `npm install socket.io socket.io-client` → `"socket.io": "^4.8.4"` (server) and `"socket.io-client": "^4.8.4"` (browser; used in the test now, in the game in step 4). `^` = newer 4.x allowed on reinstall, never 5.x. npm's `fsevents` install-script warning is about a macOS file-watcher Vite already used — unrelated, harmless.

**Explanation — `shared/events.ts`** (in `shared/` because both sides use it; makes TypeScript check every `emit`/`on` on both ends):

- `export interface ClientToServerEvents { hello: (reply: (message: string) => void) => void; }` — what the browser may send. `hello` carries one argument, `reply`, a callback the server calls to answer — Socket.IO's **acknowledgement** pattern (like a function call across the network).
- `export interface ServerToClientEvents { welcome: (message: string) => void; }` — what the server may send: a `welcome` text pushed on connect.
- Both are test placeholders; step 3 replaces them with real game events.

**Explanation — `server/index.ts`:**

- `import { Server } from 'socket.io';` — the server class.
- `import type { ... } from '../shared/events.ts';` — event types (`.ts` because Node runs this file directly).
- `const PORT = 3001;` — Vite already uses 5173.
- `const io = new Server<ClientToServerEvents, ServerToClientEvents>(PORT, { cors: { origin: 'http://localhost:5173' } });` — creates and starts the server on its own web server. The type arguments make TypeScript check event names and data. `cors` allows the game page (port 5173) to connect; browsers block cross-address connections unless the server permits them (CORS).
- `io.on('connection', (socket) => { ... });` — runs once per connecting browser; `socket` is that browser's connection:
  - `console.log(\`Connected: ${socket.id}\`);` — log the connection.
  - `socket.emit('welcome', '...');` — the server sends first (impossible with normal web requests), to this socket only.
  - `socket.on('hello', (reply) => { reply('...'); });` — answer this browser's `hello` by calling its acknowledgement callback.
  - `socket.on('disconnect', () => { ... });` — built-in; fires on tab close/refresh/connection loss. Where disconnects get handled in step 6.
- `console.log(\`Starting5ive server listening on port ${PORT}\`);` — startup confirmation.

**Explanation — scripts/config:**

- `package.json`: `"server": "node --watch server/index.ts"` — `npm run server`; Node runs the TypeScript directly; `--watch` restarts on save.
- `tsconfig.node.json`: `"include": [..., "server"]` — type-check the server under Node rules.

**Verified:** `tsc -b` and `eslint .` pass. Started the server and connected a `socket.io-client` test client: client got its id, received the `welcome` push, got `"Hello from the Starting5ive server"` back from `hello`; server log showed `Connected:` and `Disconnected:` with the same id.

**Next (step 3):** rooms — `createRoom` / `joinRoom` events with a room code, a `Map` of room code → match in memory, assign coach1/coach2, deal the pool on the server.

## 2026-10-11 — Multiplayer roadmap step 3: rooms (create / join with a code)

**Prompt:** "okay lets do the next stage"

**Scope:** creating and joining rooms by code; the server deals the pool, flips the coin, and sends the same match to both coaches. **Not yet:** picks over the network or connecting the game page (step 4); cleaning up rooms when players leave (step 6). Rooms live in memory, so a server restart clears them.

**Files changed:** `shared/events.ts`, `server/index.ts`

**Explanation — `shared/events.ts`** (test events `hello`/`welcome` removed):

- `import type { CoachId, MatchState } from './types.ts';` — types carried by the new events.
- `export type RoomResult = | { ok: true; code: string; coach: CoachId } | { ok: false; error: string };` — reply after create/join. A **discriminated union**: two shapes told apart by `ok`. After `if (result.ok)`, TypeScript knows `code`/`coach` exist; in `else` only `error` does.
- `createRoom: (reply: (result: RoomResult) => void) => void;` — "make me a room"; no data, just the acknowledgement callback. Always succeeds (code + `coach1`).
- `joinRoom: (code: string, reply: (result: RoomResult) => void) => void;` — "put me in room `code`"; success (`coach2`) or failure.
- `matchUpdate: (match: MatchState) => void;` — server sends the whole match to the room. Sent once when the match starts now; after every pick from step 4.
- Acknowledgements for create/join (a question with an answer for one browser); a plain broadcast for `matchUpdate` (news for everyone in the room).

**Explanation — `server/index.ts`:**

- New imports: `readFileSync` (read player data), `createMatch` (shared logic, now on the server), `CoachId`/`MatchState`/`Player` types.
- `const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';` — no I or O so codes read aloud aren't confused with 1/0 (commented). `const CODE_LENGTH = 4;` — 24⁴ ≈ 330,000 codes.
- `const PLAYERS: Player[] = JSON.parse(readFileSync(new URL('../src/data/players.json', import.meta.url), 'utf8'));` — loads all 22,104 players once at startup, path relative to this file. Reads from `src/data/` for now; data moves server-side in step 4.
- `interface Room { sockets: Record<CoachId, string | null>; match: MatchState | null; }` — which connection holds each coach seat (`null` = empty), and the match (`null` until both are in).
- `const rooms = new Map<string, Room>();` — room code → room, in memory.
- `randomCode()` — builds a code by picking a random letter `CODE_LENGTH` times (`Math.floor(Math.random() * length)` = random index).
- `createRoomCode()` — repeats `randomCode()` while the code is already taken (`rooms.has(code)`), guaranteeing uniqueness.
- `socket.on('createRoom', (reply) => { ... })`:
  - `rooms.set(code, { sockets: { coach1: socket.id, coach2: null }, match: null });` — new room with the creator as Coach 1.
  - `socket.join(code);` — put this connection in the Socket.IO room of the same name.
  - `reply({ ok: true, code, coach: 'coach1' });` — code to share + "you're Coach 1".
- `socket.on('joinRoom', (rawCode, reply) => { ... })`:
  - `const code = rawCode.trim().toUpperCase();` — tolerate spaces/lowercase (`" kx7q "` works).
  - Early-return checks: `room === undefined` → "Room not found"; `room.sockets.coach1 === socket.id` → "You are already in this room" (stops one browser filling both seats); `room.sockets.coach2 !== null` → "Room is full".
  - `room.sockets.coach2 = socket.id;` — take the seat. Mutating is fine here: ordinary server data, not React state.
  - `room.match = createMatch(PLAYERS);` — deal + coin flip **once on the server**, so both coaches get identical results.
  - `socket.join(code);` — joiner enters the Socket.IO room.
  - `reply({ ok: true, code, coach: 'coach2' });` — sent before the match so the browser knows its coach first (messages to one browser arrive in order).
  - `io.to(code).emit('matchUpdate', room.match);` — `io.to(room)` sends to everyone in the room (vs `socket.emit` = one browser).
- Startup log now includes the player count, confirming the data loaded.

**Verified:** `tsc -b` and `eslint .` pass. Four test clients against the running server: A created `DFNN` (coach1); B joined with `"  dfnn "` (coach2); both received the same 40-player match (`JSON` identical, same coin flip); C → "Room is full"; D with `ZZZZ` → "Room not found"; A joining its own room → "You are already in this room". Server log matched.

**Known gaps:** rooms are never deleted (step 6); the match sent to browsers still includes every player's stats (to hide in step 4).

## 2026-10-11 — Multiplayer roadmap step 4: connect the game page to the server

**Prompt:** "do step 4"

**Result:** two browsers can play a real match. Play as Guest → Create Game (shows a code) or Join Game (enter a code). The match lives on the server; clicks send requests; the server validates them (turn, availability) and sends the updated match to both browsers. Pool stats are hidden from the browser. Player data moved to the server — browser bundle went from ~3.6 MB to 268 KB (the "chunk too large" warning is gone).

**Left for later:** step 5 — grey out cards when it isn't your turn, label your side "You"; step 6 — tell the opponent when someone leaves/disconnects, clean up rooms. Leave Game currently only resets your own screen.

**Files changed:** `shared/events.ts`, `src/data/players.json` → `server/data/players.json`, `scripts/build-players.ts`, `server/index.ts`, `src/socket.ts` (new), `src/App.tsx`, `src/App.css`, `src/data/Player.ts` (deleted, with the empty `src/data/` folder)

**Explanation — `shared/events.ts`:**

- `pick: (playerId: string) => void;` — "draft this player". Sends only the id; the server looks the player up in its own pool, so a browser can't send fake stats.
- `nextRound: () => void;` / `playAgain: () => void;` — no data needed; the server knows the socket's room.
- No acknowledgements: the "answer" is the `matchUpdate` both coaches get; invalid requests are simply ignored.

**Explanation — data move + build script:**

- `server/data/players.json` — only the server deals now, so only it needs the 22,104 players.
- `scripts/build-players.ts`: `OUTPUT_FILE` → `'../server/data/players.json'`; final log message updated to match.

**Explanation — `server/index.ts`:**

- Imports `draftPlayer`, `getMatchWinner`, `isRoundOver`, `startNextRound` alongside `createMatch` — the shared rules now enforced by the server.
- `const HIDDEN_STATS = { ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0 };` — sent instead of real stats.
- `readFileSync(new URL('./data/players.json', import.meta.url), 'utf8')` — new path next to the server file.
- `interface SocketData { roomCode: string; coach: CoachId; }` — what each socket remembers in `socket.data`, so a pick tells the server its room and coach without searching.
- `function hideStats(match)` — returns a **copy** with every pool player's `stats` replaced (`{ ...player, stats: HIDDEN_STATS }`); the server's `room.match` keeps real numbers. Lineups untouched: drafted players carry real stats because the browser needs them for `compareLineups`. Trade-off: drafted players' stats are inspectable, undrafted ones never are. Commented.
- `function isDrafted(match, playerId)` — is this id already in either lineup? Prevents double picks.
- `new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(...)` — 3rd type argument = server-to-server events (unused → `Record<string, never>`), 4th = `SocketData` (types `socket.data`).
- `function sendMatch(code, match)` — hide stats, then `io.to(code).emit('matchUpdate', ...)`. The single exit point, so stats can't leak by accident.
- `function currentRoom()` — inside the connection handler so it can use this `socket`; looks up `rooms.get(socket.data.roomCode)`.
- `createRoom` / `joinRoom` — now also set `socket.data.roomCode` and `socket.data.coach`; `joinRoom` uses `sendMatch`.
- `socket.on('pick', ...)` — early-return checks: no room or match (`room?.match` optional chaining; `match == null` catches both null and undefined — the one deliberate use of `==`); not your turn (`match.currentTurn !== socket.data.coach`) or round over; player not in this pool (`match.pool.find(...)` → `undefined`); already drafted. Then `room.match = draftPlayer(match, player)` (also switches turn / scores the round) and `sendMatch`.
- `socket.on('nextRound', ...)` — only when the round is over and nobody has won the match. A second click arrives after the round restarted, so it's ignored — no skipped rounds.
- `socket.on('playAgain', ...)` — only once someone has won; fresh `createMatch(PLAYERS)` in the same room (no new code needed).

**Explanation — `src/socket.ts`** (new):

- `import { io, type Socket } from "socket.io-client";` — `type` inside braces marks just that import type-only (`verbatimModuleSyntax`).
- `const SERVER_URL = "http://localhost:3001";` — hard-coded for now; a setting at deploy time (step 7).
- `export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL);` — one shared connection, opened on page load. Type arguments are reversed vs the server (browser receives server events). Created outside any component so redraws don't open new connections.

**Explanation — `src/App.tsx`:**

- Imports: `useEffect`; `socket`; only `getMatchWinner`/`isRoundOver` from match (the browser no longer changes the game); `RoomResult` type; no more `PLAYER`.
- `const REPLY_TIMEOUT_MS = 5000;` — give up on create/join after 5s instead of hanging (e.g. server not running).
- `interface RoomInfo { code: string; coach: CoachId; }`
- State: `match` (latest from server), `room` (code + your coach), `isGuest` (show Create/Join), `joinCode` (input text), `roomError` (message or null).
- `useEffect(() => { ...socket.on('matchUpdate', handleMatchUpdate); return () => { socket.off('matchUpdate', handleMatchUpdate); }; }, []);` — `useEffect` runs after the component appears, for connecting to things outside React. The listener stores each server match with `setMatch`. The returned **cleanup** removes it (StrictMode sets up/cleans up/sets up again in development — without `off` there'd be two listeners). `[]` = set up once.
- Derived values (`draftedPlayers`, `availablePlayers`, `roundWinner`, `matchWinner`) unchanged — computed from the server's match.
- `handleRoomResult(result)` — `if (result.ok)` → store room, clear error (TypeScript knows `code`/`coach` exist there); else show `result.error`.
- `async function handleCreateRoom()` — `await socket.timeout(REPLY_TIMEOUT_MS).emitWithAck('createRoom')` sends and waits for the reply as a Promise; `try/catch` shows "Could not reach the server" on timeout.
- `async function handleJoinRoom(event: React.SubmitEvent<HTMLFormElement>)` — same with `joinCode`. `SubmitEvent` instead of `FormEvent` because the React types mark `FormEvent` deprecated and recommend it. `event.preventDefault()` stops the form's default page reload (which would drop the connection). A `<form>` means Enter submits.
- `handleLeave()` — reset all state to the landing page (replaces Restart).
- `handlePick`, `handleNextRound`, `handlePlayAgain` — just `socket.emit(...)`; no state changes. The screen updates when `matchUpdate` arrives, in both browsers at once.
- Left column: `{room !== null && <p className="room-info">Room {code} · You are {coach}</p>}`; scoreboard/status wrapped in `{match !== null && (...)}`; Start Game removed (no local game any more); Restart → Leave Game; Play Again emits.
- Right side, four screens in order: `match !== null` → `<Court>`; `room !== null` → waiting screen (label, big `room-code`, "Waiting for opponent to join…", Cancel); `isGuest` → Create Game button, `<form className="join-form" onSubmit={handleJoinRoom}>` with a **controlled input** (`value={joinCode}` + `onChange={(event) => setJoinCode(event.target.value)}`, `maxLength={4}`) and `type="submit"` Join Game button, error message, Back link; otherwise → Log In / or / Play as Guest (now `setIsGuest(true)`).

**Explanation — `src/App.css`:**

- `.landing-label { margin: 0; color: var(--text-muted); }` — grey helper text; flex `gap` handles spacing.
- `.room-code { margin: 0; color: var(--accent); font-size: 3rem; font-weight: bold; letter-spacing: 0.3em; }` — big, spaced, orange code that's easy to read out.
- `.room-info { margin: 0 0 12px; color: var(--text-muted); font-size: 0.85rem; }` — "Room X · You are Coach N".
- `.join-form { display: flex; gap: 8px; }` — input and button side by side.
- `.join-form input { ... font: inherit; text-transform: uppercase; letter-spacing: 0.15em; ... }` — themed input; `font: inherit` (inputs have their own default font); uppercase is display-only (server uppercases anyway).
- `.room-error { margin: 0; color: var(--team2); font-weight: bold; }` — errors in team red.
- `.link-button` (+ `:hover`) — "Back" as an underlined text link: overrides the global button (no background/border, normal weight).

**`src/data/Player.ts` deleted** — its only job was loading the JSON into the browser; nothing imports it now.

**Verified:**
- `tsc -b`, `eslint .`, `vite build` pass (bundle 268 KB / 84 KB gzipped, no size warning).
- Server tests with fake clients: pool stats arrive as zeros; out-of-turn pick ignored; valid pick reaches both identically, turn switches, drafted player has real stats; re-picking a drafted player ignored; full round completes and is scored; Next Round deals a fresh pool, empties lineups, keeps score; a second Next Round click ignored.
- Two headless Chrome tabs against the real server + Vite: A created a room (waiting screen with code), B joined by typing the code in lowercase; same pool in both; out-of-turn click changed nothing; a valid pick appeared in both tabs and the turn moved; a full round finished with the same winner and score in both; B's Next Round reset A's court; no console errors.
- Investigated: the server logged one more connection than tabs when driven by headless Chrome. From inside a page, all socket requests carry a single session id, so the app opens one connection per tab; the extra one never joins a room and comes from outside the driven page (likely a headless-Chrome background load, not confirmed). To recheck in a normal browser during step 6.
