# Frontend

Vite + React 19 in `web/src/`. Convex React hooks (`useQuery`, `useMutation`) are the only data
layer; there is no client-side store.

## Routes

Hash routing in `App.tsx`, no router library:

| Hash | Page |
| --- | --- |
| `#/` (anything else) | `pages/ImportPage.tsx`: landing page with the import card, recent games, how it works |
| `#/game/<id>` | `pages/GameView.tsx`: the explorer |

## The explorer (`GameView`)

`GameView` runs one query, `games.tree`, which returns the game, all its nodes, the saved analysis
for each position, and progress. It builds a `GameTree` and renders `Explorer`.

Layout (`.workspace` grid): **board | tabbed panel**. Under 920 px they stack.

- **Board column:** the board (`react-chessboard`) with the last move highlighted and an arrow
  for the best move, the eval bar, the **eval graph** (`EvalGraph`: White's win % across the main
  line, with marks at inaccuracies, mistakes, blunders and key moments; click or drag to jump),
  a one-line strip with the engine's best line, and navigation buttons.
- **Panel tabs** (the chosen tab is remembered in `localStorage`, default Tree):
  - **Position:** the selected move in words: verdict and win-% lost, "the engine preferred …"
    with a link into that line, an only-move note, a "Back to game" link inside branches, then
    `EngineLines` (saved analysis, or live browser analysis with a "live" toggle). The chat for
    the position goes here in M4.
  - **Tree:** `GameTreeView`, below.
  - **Moves:** `MoveList`, the scoresheet, with engine lines under each turning point.
- **Full-screen tree** (⤢ or `t`): the tree fills the window, with a floating board showing the
  selected position, or the hovered one as a preview. `Esc` closes it. Fold state is held by
  `Explorer` and shared, so the tab and full-screen trees always match.
- **Header:** players, result, and per-player counts of inaccuracies/mistakes/blunders; a
  progress bar while analyzing.

Keyboard: ← parent, → next on the current line, ↑/Home start, ↓/End end of line, `f` flip, `t`
full-screen tree, `Esc` close it.

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
`prefers-color-scheme: dark`. Light mode follows Cartesia (near-white, hairlines); dark mode
follows Railway (deep violet-black). One violet accent.

Fonts (Google Fonts, `index.html`): IBM Plex Serif for headings, Inter for UI, IBM Plex Mono for
PGN and numbers.

Shared pieces: `TopBar` (sticky header; `narrow` aligns it with the 1200 px landing frame),
`TreePreview` (static, hand-placed illustration of the tree on the landing page; not real data).
