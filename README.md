# Variant

Chess Explorer prototype: turn one finished game into a tree of positions you can explore and question.
Stockfish and deterministic code decide what is true; the LLM only explains it.

## Layout

| Path | What |
| --- | --- |
| `web/src/` | Vite + React app (board, move list, in-browser Stockfish for unanalyzed positions) |
| `web/convex/` | Convex backend: schema, game import, the engine pass, move classification |
| `packages/chess-core/` | Shared TypeScript: PGN/UCI parsing, win %, move classification |
| `engine/` | Native Stockfish HTTP service (Docker) that Convex calls for the engine pass |

## Develop

Requires Node 20+.

```bash
npm install
npm run convex     # Convex backend; keep running (first run sets up a deployment)
npm run dev        # http://localhost:5173
npm test           # chess-core unit tests
npm run typecheck
```

To try it without a Convex account, start the backend with
`CONVEX_AGENT_MODE=anonymous npm run convex`, which runs a local Convex backend.

`npm install` runs `web/scripts/prepare-stockfish.mjs`, which takes the lite single-threaded
Stockfish build from `node_modules/stockfish` and writes (both git-ignored):

- `web/public/stockfish/`: the browser Web Worker
- `web/vendor/stockfish/`: a patched copy for Convex Node actions, with the `.wasm` embedded as
  base64. The full npm package (~200 MB) is too big to deploy to Convex.

### Engine service

Convex's cloud runtime is too slow for WASM Stockfish, so the engine pass calls `engine/server.mjs`:
a dependency-free Node server that runs native Stockfish 19 (`POST /analyze`, Bearer auth). Deploy
it from `engine/` (Dockerfile; e.g. Railway) with `ENGINE_TOKEN` set, and `POOL_SIZE` set to the
machine's vCPU count. Then point Convex at it (from `web/`):

```bash
npx convex env set ENGINE_URL https://your-engine-host
npx convex env set ENGINE_TOKEN <same token>
npx convex run engine:benchmark '{"depth": 18}'
```

Locally: `ENGINE_TOKEN=dev STOCKFISH_PATH=$(which stockfish) node engine/server.mjs` (port 8080).
Without `ENGINE_URL`, Convex falls back to the WASM build in-process.

### Analysis pipeline

1. `games.create` stores the PGN and its main line as `nodes`, then schedules `engine.analyzeGame`.
2. `engine.analyzeGame` analyzes each position at depth 18, MultiPV 3, saving to `analyses` (keyed
   by position, so repeated positions are free). It runs in 60 s slices and reschedules itself.
3. `pipeline.finalize` classifies every move (Lichess win-% thresholds plus mate rules), marks
   critical moments, and adds the engine's top alternatives there as `engine` nodes.

Thresholds live in `packages/chess-core/src/classify.ts`. After changing them, rerun step 3 on a game:
`npx convex run pipeline:reclassify '{"gameId": "…"}'` (from `web/`).

Keys: ← → step, ↑ ↓ start/end, `f` flip board.

## Status

- [x] M1 — Board + PGN import + browser Stockfish evals
- [x] M2 — Server engine pass, move classification, critical moments (Convex)
- [ ] M3 — Tree view
- [ ] M4 — Node chat
- [ ] M5 — What-if branches
- [ ] M6 — Detectors + punchline
- [ ] M7 — Evaluation
