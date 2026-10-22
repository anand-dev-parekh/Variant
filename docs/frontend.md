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

Layout (`.workspace` grid): **board | tree | side panel**. Under 1240 px the tree moves below
the board and side panel; under 860 px everything stacks.

- **Board** (`react-chessboard`): last move highlighted, an arrow for the best move, eval bar
  (`EvalBar`). A finished position shows the result instead of engine lines.
- **Tree** (`GameTreeView`): see below.
- **Side panel:** `EngineLines` (saved analysis, or live browser analysis, with a "live" toggle),
  a note with "Back to game" when you're in an engine line, `MoveList` (main line, with engine
  alternatives under critical moves), and navigation buttons.
- **Header:** players, result, and once analysis is done a per-player count of
  inaccuracies/mistakes/blunders plus the number of critical moments. While analyzing, a
  progress bar.

Keyboard: ← parent, → next on the current line, ↑/Home start, ↓/End end of line, `f` flip.

### `GameTree` (`lib/tree.ts`)

An index over the flat node list: `byId`, `root`, `mainline`, `childrenOf` (sorted: played move,
engine alternatives, user what-ifs), `parentOf`, `next` (continue on the same kind of line),
`lineFrom`, `alternativesTo`.

## Tree view

`components/GameTreeView.tsx` renders with React Flow (`@xyflow/react`). Layout is computed by
our own pure function, `lib/treeLayout.ts` (`buildTreeView`), not a layout library, and is
unit-tested in `treeLayout.test.ts`.

### Folding

Long games stay readable because only landmarks get their own box:

- On the main line: the start, the final position, critical moves, mistakes and blunders, and
  any position that branches.
- User what-ifs always show.
- Everything in the `revealed` set always shows.

Runs of other moves fold into one box ("1. e4 … +23"); runs shorter than `MIN_RUN = 3` aren't
folded. Engine lines fold completely by default. Clicking a folded box adds its moves to
`revealed`. Selecting a folded move from the keyboard or move list reveals its run too, so the
tree never hides where you are. "Expand all" / "Collapse" reset it. Fold state is per page view,
not stored.

### Layout

Top-down. The main line is column 0; each branch is placed one row below the position it leaves,
in the nearest column to the right that's free for all the rows it spans (a simple interval
packing). Boxes are 144 × 32 px on a 168 × 46 px grid.

Visual encoding: the left border colour is the move's classification; engine lines are dashed;
user lines have a purple border; the purple dot marks a critical moment; the path from the start
to the selected move is drawn in the accent colour. The view pans to the selected box when it
goes off-screen (keyboard navigation, folding, resizing), but never fights manual panning.

## Styling

Plain CSS in `styles.css` with design tokens as custom properties on `:root`, redefined under
`prefers-color-scheme: dark`. Light mode follows Cartesia (near-white, hairlines); dark mode
follows Railway (deep violet-black). One violet accent.

Fonts (Google Fonts, `index.html`): IBM Plex Serif for headings, Inter for UI, IBM Plex Mono for
PGN and numbers.

Shared pieces: `TopBar` (sticky header; `narrow` aligns it with the 1200 px landing frame),
`TreePreview` (static, hand-placed illustration of the tree on the landing page; not real data).
