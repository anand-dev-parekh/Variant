# Variant

Chess Explorer prototype: turn one finished game into a tree of positions you can explore and question.
Stockfish and deterministic code decide what is true; the LLM only explains it.

**Technical docs: [`docs/`](docs/README.md)** covers the architecture, data model, analysis pipeline,
move classification, engines, frontend, development setup, and design decisions.

## Layout

| Path | What |
| --- | --- |
| `web/src/` | Vite + React app (board, variation tree, in-browser Stockfish for unanalyzed positions) |
| `web/convex/` | Convex backend: schema, game import, the engine pass, move classification |
| `packages/chess-core/` | Shared TypeScript: PGN/UCI parsing, win %, move classification |
| `engine/` | Native Stockfish HTTP service (Docker) that Convex calls for the engine pass |
| `docs/` | Technical documentation |

## Quick start

Requires Node 20+.

```bash
npm install
npm run convex     # Convex backend; keep running (first run sets up a deployment)
npm run dev        # http://localhost:5173
npm test
npm run typecheck
```

No Convex account? `CONVEX_AGENT_MODE=anonymous npm run convex` runs a local backend.
Without an engine service configured, analysis falls back to WASM Stockfish inside Convex; to use
the native service see [docs/engines.md](docs/engines.md).

Keys in the explorer: ← → step, ↑ ↓ start/end, `f` flip board.

## Status

- [x] M1: Board + PGN import + browser Stockfish evals
- [x] M2: Server engine pass, move classification, critical moments (Convex)
- [ ] M3: Tree view (first pass done; UI polish in progress)
- [ ] M4: Node chat
- [ ] M5: What-if branches
- [ ] M6: Detectors + punchline
- [ ] M7: Evaluation
