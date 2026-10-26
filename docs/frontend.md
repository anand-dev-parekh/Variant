# Frontend

Vite + React 19 in `web/src/`. Convex React hooks (`useQuery`, `useMutation`) are the only data
layer; there is no client-side store.

## Routes

Hash routing in `App.tsx`, no router library:

| Hash | Page |
| --- | --- |
| `#/` (anything else) | `pages/HomePage.tsx`: signed out, `Landing`; signed in, `Home` (see below) |
| `#/game/<id>` | `pages/GameView.tsx`: the explorer, for the game's owner |
| `#/game/<id>/s/<token>` | The same explorer, read-only, for anyone with a share link (signed in or not). See [accounts](accounts.md) |
| `#/settings` | `pages/Settings.tsx`: the coach's API key and the chess site usernames. Linked from the header's account menu |

## Home and landing (`Home`, `Landing`)

Their layout styles are under `.v2` at the end of `styles.css`; the look itself is the app's
(see Styling). Header: `SiteHeader` (wordmark, page actions, `UserMenu`; `wide` in the game view).

- **`Landing`** (signed out): the pitch with "Continue with Google / GitHub", the Opera Game drawn
  as a tree (`TreeSketch` with `OPERA_STOPS`), a three-step strip, a coach example, a closing bar.
- **`Home`** (signed in), from `games.list` only (no game trees are loaded):
  - The latest game: a headline from the result and your side ("You beat X as White, in 40
    moves."), its biggest turning points (up to 4: move, verdict, who played it, the engine's
    move instead), stats, and a framed `TreeSketch` of the game plus its eval `Sparkline`.
  - Totals: games, won–lost–drawn and your blunders a game (games where your side is known),
    what-ifs explored.
  - Your games: a row each (mini board at the biggest turning point, key move, sparkline, result
    pill), filterable by result, with **Delete** on hover.
  - No games yet: three ways in (Lichess, Chess.com, PGN).
- Your side of a game is `yourSide` from `games.list`: the player whose name matches one of your
  connected chess-site usernames. Without a match, rows show both players and the raw result.
- **Import game** (header) opens `ImportDialog`: a tab per site (connect a username, then recent
  games with Analyze / Open) and **Paste a PGN** (`ImportPanel`). `Home` fetches recent games for
  each connected site once (`useRecentGames`) and badges the button with how many aren't imported
  yet.
- `lib/gameSummary.ts` (tested) turns a game summary into move labels, outcomes, the top turning
  points and the stops `TreeSketch` draws.

## The explorer (`GameView`)

`GameView` runs one query, `games.tree`, which returns the game, all its nodes, the saved analysis
for each position, and progress. It builds a `GameTree` and renders `Explorer`.

Layout (`.workspace` grid): **board | tabbed panel**. Under 920 px they stack.

- **Board column:** the board (`react-chessboard`) with the last move highlighted and an arrow
  for the best move. It starts from the owner's side (`ownerSide` from `games.tree`: the player
  matching their chess-site usernames; White when neither does), and `f` flips it. Around it: the eval bar, a **player row** above and below it (`MaterialStrip`: name,
  the pieces that side has captured with the latest capture highlighted, and `+N` for the side
  ahead in material; from `captures()` in chess-core, follows the flip), the **eval graph** (`EvalGraph`: White's win % across the main
  line, with marks at inaccuracies, mistakes, blunders and key moments; click or drag to jump),
  a one-line strip with the engine's best line, and navigation buttons. Once the game is
  analyzed the board is **playable**: drag a piece, or click it and then a square (side to move
  only). The picked piece's square turns yellow, with a dot on each square it can move to and a
  ring around each capture (`legalTargets` in chess-core). A move that's already in the tree just follows it; a new one becomes a what-if
  (`branches.addMoves`), shown immediately while it saves. Pawns reaching the last rank become
  queens for now (`moveFromSquares`, chess-core).
- **Panel tabs** (the chosen tab is remembered in `localStorage`, default Tree):
  - **Position:** the selected move in words: verdict and win-% lost, "the engine preferred …"
    with a link into that line, an only-move note, a "Back to game" link inside branches (plus
    "Remove" on your what-ifs), then
    `EngineLines` (saved analysis, or live browser analysis with a "live" toggle), then
    `NodeChat`: chats from earlier moves on this line (collapsible, with "Go to move"), then
    suggested questions, the thread with streamed replies and a chip per tool call
    (a line the coach added has a "Show on board" chip), and the question box
    ([node chat](chat.md)).
  - **Tree:** `GameTreeView`, below.
  - **Moves:** `MoveList`, the scoresheet, with engine lines under each turning point.
- **Full-screen tree** (⤢ or `t`): the tree fills the window, with a floating board showing the
  selected position, or the hovered one as a preview. `Esc` closes it. Fold state is held by
  `Explorer` and shared, so the tab and full-screen trees always match.
- **Header:** players, result, and per-player counts of inaccuracies/mistakes/blunders; a
  progress bar while analyzing.

**Line previews.** Move lines in the coach's answers ("12…Nh7 13. Qxd8 Rxd8") are links, once
the answer has finished streaming. `findMoveRuns` (chess-core `notation.ts`) finds numbered move
runs in the text; `lineResolver` (`web/src/lib/chatLines.ts`) places each one where its move
number and side fit and every move is legal, trying lines earlier in the same answer first
(latest first, so "after 12. dxe5 Nh7, 13. Qxd8…" continues it), then the chat's position, the
moves leading to it (nearest first), and the moves after it. A Black move written without a
number ("…a5") continues the line just before it in the answer, or the chat's position if it's
the first. The coach's prompt asks for full numbered lines; lines that don't fit stay text.
Clicking one opens a **preview** on the board: the board gets an accent outline, the eval bar,
engine lines, best line and material rows follow the previewed position, and ← → (and the
navigation buttons) step through the line instead of the tree; Esc or Exit leaves it. The bar
under the board lists the moves (click to jump; moves from an earlier line are greyed) and has
**Add to tree** (`branches.addMoves`, reusing existing moves, then selects the move on the board)
or **Go to it in the tree** when every move already exists. Selecting another position ends the
preview.

**Chat marks.** `games.tree` also returns `chatted`, the nodes with a chat thread (a thread is
created by the first question). Those moves get a speech bubble (`ChatMark`) in the tree (stops,
cards, and folded runs that contain one) and in the move list, and it appears live when you ask.

Keyboard: ← parent, → next on the current line, ↑/Home start, ↓/End end of line, `f` flip, `t`
full-screen tree, `Esc` close it, Delete/Backspace remove the selected what-if.

**Deleting what-ifs.** Your own moves can be deleted from the Position tab ("Remove"), from the
tree (a × on the stop or card, shown on hover and when selected), or with Delete. All three go
through `deleteWhatIf` in `Explorer`. It removes the move and everything after it
(`branches.removeWhatIf`), asks first when that's more than one move, and moves the selection to
the branch point if the selected move goes with it. Game moves and engine lines can't be deleted.

### `GameTree` (`lib/tree.ts`)

An index over the flat node list: `byId`, `root`, `mainline`, `childrenOf` (sorted: played move,
engine alternatives, user what-ifs), `parentOf`, `next` (continue on the same kind of line),
`lineFrom`, `alternativesTo`.

## Tree view

`components/GameTreeView.tsx` renders with React Flow (`@xyflow/react`). Layout is computed by
our own pure function, `lib/treeLayout.ts` (`buildTreeView`), not a layout library, and is
unit-tested in `treeLayout.test.ts`.

It's drawn as a **metro map**: each position is a stop on a line, and branches peel off as their
own lines. Mistakes, blunders and key moments on the main line become **cards** with a mini board
(`MiniBoard`), the verdict and win-% lost, the eval, and the engine's preferred move.

### Folding

Long games stay readable because only landmarks get their own stop:

- On the main line: the start, the final position, inaccuracies, mistakes, blunders, and any
  position that branches.
- User what-ifs always show.
- Everything in the `revealed` set always shows.

Runs of other moves fold into one small stop ("1. e4 … 12… Rg8 · 24 moves"); runs shorter than
`MIN_RUN = 3` aren't folded. Engine lines fold completely by default ("16. Qe4 … +5"). Clicking a
folded stop adds its moves to `revealed`. Selecting a folded move from the keyboard or move list
reveals its run too, so the tree never hides where you are. "Expand all" / "Collapse" reset it.
Fold state is per page view, not stored.

### Layout

Top-down. The main line is column 0; each branch starts one row below the position it leaves,
in the nearest column to the right that's free for all the rows it spans (a simple interval
packing). Rows are 36 px, or 104 px when they hold a card (`itemPositions`, `GEOMETRY`); columns
are 280 px. Edges are a custom `elbow` edge: straight down a line, or down to the gap above the
target row, across, and down, so connectors never cut through labels or cards.

Visual encoding, with a legend in the panel: dot colour is the move's quality (amber
inaccuracy, orange mistake, red blunder, teal key moment, hollow otherwise); engine lines are dashed; folded
stretches are dotted; user what-ifs have violet stops; the path from the start to the selected
move and the selected stop's ring are in the accent colour. The view pans to the selection when it
goes off-screen (keyboard navigation, folding, resizing), but never fights manual panning.

## Styling

Plain CSS in `styles.css` with design tokens as custom properties on `:root`, redefined under
`prefers-color-scheme: dark`. A calm look in the spirit of Cartesia: a warm off-white (a warm
near-black in dark mode), hairline borders, small radii, near-black primary buttons. Every board is
warm wood (`--sq-light`, `--sq-dark`): the mini boards directly, the main and floating boards
through `SQUARE_COLORS` in `GameView`. One violet accent for links and selection.

Fonts (Google Fonts, `index.html`): Newsreader for headings, Geist for UI, IBM Plex Mono for
moves, numbers and labels.

**Owner vs viewer.** `games.tree` returns the caller's `role`. Owners get the Share and Delete
buttons in the game header (`DeleteGame`, also on each home-page row; it asks to confirm in
place, then goes home). Viewers get a "Shared by … · view only" banner; board moves, Remove, Delete,
the question box and "Add to tree" are off, and the share token is passed to every query.

Shared pieces: `SiteHeader` (every page's header, with `UserMenu`: avatar, name, Sign out),
`TreeSketch` (a still picture of a game tree drawn with the real tree's metro classes: your latest
game on the home page; on the landing, the Opera Game with real positions and hand-placed,
illustrative verdicts).
