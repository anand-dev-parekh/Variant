# Data model

Defined in `web/convex/schema.ts`. Three tables today; the design doc's fourth (`messages`, for
node chat) arrives with milestone 4.

## `games`

One imported game.

| Field | Notes |
| --- | --- |
| `pgn` | The PGN as imported. Omitted from `games.list` to keep the landing page light |
| `white`, `black`, `result`, `event?`, `date?` | From PGN headers (`parseGame`), with "White"/"Black"/"*" fallbacks |
| `status` | `analyzing` → `ready`, or `failed` with `error` |
| `depth`, `multiPv` | Engine settings used for this game (`ANALYSIS_DEPTH = 18`, `ANALYSIS_MULTIPV = 3` in `games.ts`) |

## `nodes`

One position in a game's tree. The edge (the move into the position) is stored on the child.

| Field | Notes |
| --- | --- |
| `gameId` | Owning game |
| `parentId?` | Absent only on the root (the starting position) |
| `fen`, `positionKey` | Full FEN, and the cache key (see below) |
| `ply` | Half-moves from the game's start (root = 0). Branch nodes continue counting from their parent |
| `moveSan?`, `moveUci?` | The move into this position. Absent on the root |
| `source` | `game` (played), `engine` (alternative at a critical moment), `user` (what-if, M5) |
| `classification?` | `best` · `good` · `inaccuracy` · `mistake` · `blunder`. Set on main-line moves at finalize |
| `winPercentLoss?` | Win-% points the mover gave up versus the best move |
| `onlyMove?`, `critical?` | See [move classification](move-classification.md) |

Indexes:

- `by_gameId_and_ply`: load a whole tree (`games.tree`).
- `by_gameId_and_source_and_ply`: the main line in order, or all engine nodes (for reclassify).
- `by_parentId`: children of a node.

A game's tree is capped at `MAX_NODES = 4000` (`games.ts`), which every node query uses as its
`.take()` bound. A long game (150 plies) plus branches is far below it.

Sibling order is decided in the browser, not stored: the played move first, then engine
alternatives, then user what-ifs, each by creation time (`web/src/lib/tree.ts`).

## `analyses`

Server engine output for one position, shared by every node (in any game) with the same
`positionKey`.

| Field | Notes |
| --- | --- |
| `positionKey`, `fen` | The FEN that was actually searched is kept for re-checking |
| `engine` | Which engine produced it (`stockfish-19`). If the engine or its settings change, purge and reanalyze ([pipeline](analysis-pipeline.md)) so results aren't mixed |
| `depth`, `multiPv` | Depth actually reached (forced mates can stop short of the target) |
| `terminal?` | `checkmate` · `stalemate` · `insufficient`; such positions have no lines |
| `lines` | Best first. Each: `score` (White POV), `pv` (UCI moves), `san` (same moves in SAN) |

Index: `by_positionKey`.

### `positionKey`

`positionKey(fen)` in `chess-core/src/position.ts` keeps the first four FEN fields (board, side to
move, castling, en-passant square) and drops the two move counters. So the same position reached
by a different move order, or in another game, reuses one analysis. Openings are effectively
analyzed once across all games.

`saveAnalysis` inserts, or replaces an existing analysis only with a deeper one.

## Not stored

- **Fold/expand state of the tree** is per-browser UI state, not the design doc's
  `nodes.collapsed`. See [decisions](decisions.md).
- **Live browser-engine results** are never written; they are recomputed when needed.
