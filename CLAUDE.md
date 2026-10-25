# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Variant (Chess Explorer prototype) turns one finished chess game into a tree of positions you can
explore and ask about. The detailed technical docs live in `docs/` (start at `docs/README.md`);
this file is the short version.

## Commands

npm workspaces (`web`, `packages/*`), Node 20+. Run from the repo root unless noted.

```bash
npm install                 # also copies Stockfish WASM into web/public/stockfish/
npm run convex              # Convex dev backend; keep running (pushes web/convex on save)
npm run dev                 # Vite on http://localhost:5173
npm test                    # vitest in chess-core and web
npm run typecheck           # tsc for chess-core, web/src and web/convex
npm run build               # production build of the web app
```

- Single test file: `npm test -w web -- src/lib/treeLayout.test.ts` or
  `npm test -w @variant/chess-core -- classify`. Add `-t "<name>"` for one test.
- No Convex account: `CONVEX_AGENT_MODE=anonymous npm run convex` runs a local backend.
- `npx convex …` commands run from `web/`. Useful ones: `npx convex run pipeline:reclassify
  '{"gameId": "…"}'`, `pipeline:reanalyze`, `chat:systemPrompt '{"nodeId": "…"}'`, `npx convex logs`.
  The full table and env vars are in `docs/development.md`.
- There is no lint step; `typecheck` and `test` are the checks.

## Architecture

- `packages/chess-core/`: pure TypeScript shared by the browser and Convex: PGN/UCI parsing,
  scores and win %, move classification, board facts, the chat fact sheet. Imported as
  `@variant/chess-core` straight from source (no build step).
- `web/convex/`: Convex backend. `games.ts` (import, `games.tree` loads the whole tree in one query),
  `engine.ts` (actions that call the engine service), `pipeline.ts` (finalize: classify moves, mark
  critical moments, insert engine alternatives), `chat.ts` + `lib/chatTools.ts` + `lib/llm.ts` (node
  chat over the Convex Agent component), `branches.ts` (user what-ifs), `imports.ts` (Lichess /
  Chess.com), `lib/access.ts` (who can read or change a game).
- `web/src/`: Vite + React 19. `pages/GameView.tsx` is the explorer (board | tabbed panel);
  `engine/` runs Stockfish WASM in a Web Worker for positions the server hasn't analyzed (it never
  writes to the database); `lib/tree.ts` indexes the node table into a `GameTree`.
- `engine/`: native Stockfish behind a small authenticated HTTP API (Docker, Fly), called by Convex
  actions via `ENGINE_URL` / `ENGINE_TOKEN`.

A game's life: the browser parses the PGN, `games.create` stores the game and one `nodes` row per
main-line position and schedules `engine.analyzeGame`; analyses land in `analyses` (the page's
reactive query shows progress); once all are in, `pipeline.finalize` classifies and branches and
the game becomes `ready`.

## Rules that hold everywhere

- **Stockfish and deterministic code decide what is true; the LLM only explains it.** Every eval,
  classification and branch comes from the engine plus `chess-core`. The chat model must get facts
  through tools, never invent them.
- Scores are from White's point of view (`{cp}` or `{mate}`). Raw UCI output is side-to-move and
  is flipped once at the boundary (`toWhitePov`).
- Analyses are cached by `positionKey` (first four FEN fields), shared across games and move orders.
- The tree is a parent-pointer table: each node is a position and carries the move that led to it
  (`moveSan`, `moveUci`); the root has none. `source` is `game`, `engine` or `user`.
- **Before touching Convex code, read `web/convex/_generated/ai/guidelines.md`** (see `web/CLAUDE.md`).
  It overrides older habits: index names list their fields, every query is bounded with `.take()`,
  `db.get/patch/replace/delete` take the table name, env vars come from the typed `env` in
  `_generated/server`. Everything runs in the default runtime; nothing needs `'use node'`.
- `web/convex/_generated/` is generated and committed; `web/public/stockfish/` is generated and ignored.

## Docs and git

- Update the `docs/` page that covers a change in the same commit. Thresholds, depths and limits
  quoted in the docs name their constant and file; the code is the source of truth.
- Why things are the way they are (and rejected alternatives): `docs/decisions.md`.
- One branch per milestone or feature; milestone status lives in the root `README.md`.
- Tool versions are pinned to ones that support Node 20 (vitest 3, Vite 6, Convex Agent 0.6 with
  AI SDK 6) because of the author's machine; don't bump them casually.
