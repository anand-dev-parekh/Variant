# Data model

Defined in `web/convex/schema.ts`: `games`, `nodes`, `analyses`, `threads` for node chat, and
`profiles` for chess site usernames, `apiKeys` for users' own chat keys, plus Convex Auth's tables (`users`, `authSessions`, …; see
[accounts](accounts.md)). Chat messages themselves live in the Convex Agent component's tables.

## `games`

One imported game.

| Field | Notes |
| --- | --- |
| `ownerId?` | The user who imported it. Optional only for games from before accounts (`games:claimUnowned` assigns those) |
| `shareToken?` | Set while the game is shared by link; cleared to revoke ([accounts](accounts.md)) |
| `origin?` | `{ site: lichess \| chesscom, id }` for games imported from a chess site, to avoid importing one twice |
| `pgn` | The PGN as imported. Omitted from `games.list` and from `games.tree` |
| `white`, `black`, `result`, `event?`, `date?` | From PGN headers (`parseGame`), with "White"/"Black"/"*" fallbacks |
| `status` | `analyzing` → `ready`, or `failed` with `error` |
| `depth`, `multiPv` | Engine settings used for this game (`ANALYSIS_DEPTH = 18`, `ANALYSIS_MULTIPV = 3` in `games.ts`) |
| `summary?` | Set when analysis finishes, for lists and the home page: main-line `san`, `evals` (White-POV pawns per position, ±10), `moments` (critical moves and key moments: ply, classification, win-% loss, position after, and the engine's line instead with its score), and `fen` (the position to show: after the biggest turning point, else the last) |

Indexes: `by_ownerId` (your games), `by_shareToken`, `by_ownerId_and_origin` (`origin.site`,
`origin.id`).

## `nodes`

One position in a game's tree. The edge (the move into the position) is stored on the child.

| Field | Notes |
| --- | --- |
| `gameId` | Owning game |
| `parentId?` | Absent only on the root (the starting position) |
| `fen`, `positionKey` | Full FEN, and the cache key (see below) |
| `ply` | Half-moves from the game's start (root = 0). Branch nodes continue counting from their parent |
| `moveSan?`, `moveUci?` | The move into this position. Absent on the root |
| `source` | `game` (played), `engine` (alternative at a critical moment), `user` (a what-if, from the board or the chat's `add_branch`) |
| `classification?` | `best` · `good` · `inaccuracy` · `mistake` · `blunder`. Set on main-line moves at finalize, and on user moves once they're analyzed |
| `winPercentLoss?` | Win-% points the mover gave up versus the best move |
| `keyMoment?` | One of a player's biggest slips that wasn't a mistake or blunder; branched like a critical move |
| `onlyMove?`, `critical?` | `critical` = a mistake or blunder (where the tree branches). See [move classification](move-classification.md) |

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

## `threads`

The chat thread for one node, created on its first question ([node chat](chat.md)).

| Field | Notes |
| --- | --- |
| `nodeId` | The position the chat is about |
| `threadId` | The Agent component's thread; its messages and stream deltas are stored there |
| `gameId?` | The node's game, so `games.tree` can list chatted moves in one query. Optional only for threads made before it was added (`chat:backfillThreadGames` filled those in) |

Indexes: `by_nodeId`, `by_gameId`, `by_threadId` (to check access when reading a thread's messages).

## `profiles`

A user's usernames on chess sites, for importing their recent games ([accounts](accounts.md)).

| Field | Notes |
| --- | --- |
| `userId` | The Convex Auth user |
| `lichess?`, `chesscom?` | Usernames (letters, digits, `_`, `-`) |

Index: `by_userId`.

## `apiKeys`

A user's own LLM key for the chat, one per user (`apiKeys.ts`, [node chat](chat.md)).

| Field | Notes |
| --- | --- |
| `userId` | The Convex Auth user |
| `provider` | `anthropic` or `openrouter`, from the key's prefix |
| `last4` | The key's last four characters, the only part the page ever sees |
| `ciphertext`, `iv` | The key, AES-256-GCM encrypted with `KEY_ENCRYPTION_SECRET` (`lib/secrets.ts`) |

Index: `by_userId`.

## Not stored

- **Fold/expand state of the tree** is per-browser UI state, not the design doc's
  `nodes.collapsed`. See [decisions](decisions.md).
- **Live browser-engine results** are never written; they are recomputed when needed.
