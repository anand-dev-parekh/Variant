# Analysis pipeline

From "Analyze game" to a classified tree. Code: `web/convex/games.ts`, `engine.ts`,
`pipeline.ts`.

```mermaid
sequenceDiagram
  participant B as Browser
  participant M as games.create
  participant A as engine.analyzeGame (action)
  participant E as Engine service
  participant P as pipeline.*
  B->>M: pgn
  M->>M: insert game + main-line nodes
  M-->>A: schedule
  M->>B: gameId
  loop until no positions pending (≤ 60 s per run)
    A->>P: pendingPositions
    par up to 4 at a time
      A->>E: POST /analyze (fen, depth 18, multiPv 3)
      E->>A: lines
      A->>P: saveAnalysis
    end
    A-->>A: out of time? schedule a fresh run
  end
  A->>P: finalize (classify, branch, status = ready)
```

## 1. Import (`games.create`, mutation)

- Parses the PGN with `parseGame` (chess.js). A bad PGN throws a `ConvexError` the import form
  shows. The browser runs the same parse first so most errors never reach the server.
- Inserts the `games` row (`status: 'analyzing'`) and one `nodes` row per main-line position,
  root first, each pointing at the previous one.
- Schedules `internal.engine.analyzeGame` and returns the id.

## 2. Engine pass (`engine.analyzeGame`, Node action)

- Asks `pipeline.pendingPositions` for main-line positions with no saved analysis
  (deduplicated by `positionKey`, so repeated positions and positions already analyzed in other
  games are skipped).
- Chooses an analyzer (`analyzer()` in `engine.ts`):
  - **Engine service** when `ENGINE_URL` and `ENGINE_TOKEN` are set: 4 requests in flight
    (`REMOTE_CONCURRENCY`).
  - **WASM fallback** otherwise: one search at a time inside the action.
- Workers pull positions from a shared queue and save each result immediately with
  `pipeline.saveAnalysis`. That's what drives the progress bar.
- **Time slicing.** Each run stops taking new positions after `RUN_BUDGET_MS = 60 s` and schedules
  a fresh run of itself. Convex actions have a 10-minute limit; slicing keeps every run far from
  it and makes the pipeline resumable. A rerun simply picks up whatever is still pending.
- When nothing is pending, it calls `pipeline.finalize`.
- Any thrown error is logged and the game is marked `failed` with the message
  (`pipeline.markFailed`).

Terminal positions (checkmate, stalemate, insufficient material) are never sent to an engine:
they're saved with `terminal` set and no lines.

## 3. Finalize (`pipeline.finalize`, mutation)

Runs only if the game is still `analyzing` (so a duplicate run is harmless). For each main-line
move (`classifyAndBranch`):

1. Loads the analysis before the move (its engine lines) and after it (its best score, or the
   fixed score of a finished position).
2. `judgeMove` returns `classification`, `winPercentLoss`, `onlyMove`, `critical`, which are
   patched onto the node. See [move classification](move-classification.md).
3. At a critical move, it takes the engine's best lines from the position *before* the move,
   skips the one that is the played move, keeps `BRANCH_ALTERNATIVES = 2`, plays each for
   `BRANCH_PLIES = 5` plies, and inserts them as `engine` nodes under the parent position.

Then sets `status: 'ready'`.

## Re-running classification

Thresholds are meant to be tuned. To redo step 3 for a finished game without re-running the
engine (from `web/`):

```bash
npx convex run pipeline:reclassify '{"gameId": "<id>"}'
```

It deletes the game's `engine` nodes and runs `classifyAndBranch` again. It does not touch `user`
nodes.

## Timing (depth 18, MultiPV 3, per position)

| Where | Typical |
| --- | --- |
| Native Stockfish on a laptop | 2–6 s |
| WASM in a local Convex backend | 2–6 s |
| WASM in Convex cloud | 6–17 s warm, up to ~29 s cold |

The cloud WASM numbers are why the engine service exists ([engines](engines.md)). A 40-move game
has ~80 positions; with the service and 4 in flight, expect a minute or two, minus anything
already cached.
