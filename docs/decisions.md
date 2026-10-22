# Decisions

Why things are the way they are. Newest first. Add an entry when you make a choice someone might
later want to undo.

## Fold state lives in the browser, not in `nodes`

The design doc lists a `collapsed` field on nodes. We keep fold state in React instead: it's
per-viewer UI state, storing it would make every click a database write, and the default (fold
quiet stretches and engine lines, show landmarks) is computed from data we already have. Revisit
if fold state needs to be shared or remembered across sessions.

## Our own tree layout instead of dagre/elk

The tree has a strong shape (a main-line spine with short side branches), and a tidy-tree layout
would rebalance it on every fold. A ~60-line column packer (`lib/treeLayout.ts`) keeps the spine
fixed, is deterministic, and is easy to test. React Flow still does rendering, pan and zoom.

## Native Stockfish service for the analysis pass

WASM Stockfish inside Convex cloud actions took 6–17 s per position (up to ~29 s cold), so a game
took many minutes. Native Stockfish is roughly 2–4× faster per search (2–6 s on a laptop) and
allows several searches in parallel. Railway was chosen over Fly.io for cost at prototype scale (free tier and $5 Hobby
plan; Fly has no free tier). The service is a single dependency-free file so it runs on any
Docker host.

**Follow-up:** remove the WASM-in-Convex fallback once the service is verified, so every stored
analysis comes from the same engine. Mixing lite and full Stockfish results in the shared
`analyses` cache would make classifications partly reflect the engine difference. Removing it
also lets `engine.ts` drop `'use node'`. Keep the browser WASM engine; it's for live browsing.

## Deterministic engine settings

One thread per engine and `ucinewgame` before each search. Multi-threaded Stockfish gives
slightly different answers run to run; determinism makes classifications reproducible and
cached analyses trustworthy.

## Cache analyses by position, across games

`analyses` is keyed by `positionKey` rather than by node. Openings and transpositions are
analyzed once, re-imports are nearly free, and engine/user branches that reach a known position
get its analysis for free.

## Lichess win-% thresholds, with mate rules

Win % (rather than raw centipawns) judges a move by how much it changed the likely result, and
Lichess's cutoffs are well understood by players. The mate rules were added after a real game
classified walking into a forced mate as only a "mistake". Thresholds are expected to be tuned
(`THRESHOLDS`, `pipeline:reclassify`).

## Convex for backend and database

Reactive queries make the live progress bar and live-updating tree (and later, streamed chat and
branches added by the agent) free. Actions handle engine and LLM calls; the scheduler gives
resumable background work.

## npm workspaces, not pnpm

pnpm wouldn't run on the development machine's Node 20. npm workspaces do the job for three
packages.

## Open questions

- **LLM provider (M4):** undecided; budget under $50 to start. Keep the chat layer provider-
  agnostic so it can be swapped.
- **Detectors (M6):** undecided whether to follow Take Take Take's approach. Keep the per-node
  fact sheet pluggable.
