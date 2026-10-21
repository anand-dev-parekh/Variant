# Variant

Chess Explorer prototype: turn one finished game into a tree of positions you can explore and question.
Stockfish and deterministic code decide what is true; the LLM only explains it.

## Layout

| Path | What |
| --- | --- |
| `web/` | Vite + React app (board, move list, in-browser Stockfish) |
| `packages/chess-core/` | Shared TypeScript: PGN parsing, UCI parsing, scores / win % |

## Develop

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # chess-core unit tests
npm run typecheck
```

`npm run dev` copies the lite single-threaded Stockfish build from `node_modules/stockfish`
into `web/public/stockfish/` (git-ignored).

Keys: ← → step, ↑ ↓ start/end, `f` flip board.

## Status

- [x] M1 — Board + PGN import + browser Stockfish evals
- [ ] M2 — Server engine pass, move classification, critical moments (Convex)
- [ ] M3 — Tree view
- [ ] M4 — Node chat
- [ ] M5 — What-if branches
- [ ] M6 — Detectors + punchline
- [ ] M7 — Evaluation
