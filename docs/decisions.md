# Decisions

Why things are the way they are. Newest first. Add an entry when you make a choice someone might
later want to undo.

## Users bring their own LLM key; stored encrypted on the server

The app is free and its author doesn't fund the LLM, so each user pastes an Anthropic or
OpenRouter key. The server stores it encrypted (AES-GCM, secret in an env var) because the reply
runs in a scheduled action, whose arguments Convex stores anyway, and the agent's tool loop runs
server-side. Rejected: keeping the key in the browser and calling the provider from there (a
rewrite of the chat, the key exposed to page scripts, and one device only), and a server key with
per-user limits (the author still pays). NIM's free models were dropped from the chat, since
they gave ungrounded answers (below). OpenRouter's "connect" login could replace pasting later.

## Accounts with Convex Auth; shared links are read-only and include chats

Sign-in runs inside the Convex deployment (Convex Auth with Google and GitHub) rather than a
separate service like Clerk, so there's one backend and no extra account. Games belong to the
importer. A share link shows everything, chats included, but changes nothing; a "save a copy"
for visitors can come later. The analysis cache stays global, because an engine evaluation
doesn't depend on who asked. Chess sites are connected by username only, reading public games,
so there's no Lichess or Chess.com OAuth to set up.

## What-ifs: judged like game moves, never branched; promotion is always a queen

A move the player tries gets the same verdict as a game move, so the board and tree read the same
everywhere. It doesn't get engine branches (those mark the game's turning points) and doesn't
count toward key moments. Dragging a pawn to the last rank promotes to a queen; a picker can come
later if underpromotion matters.

## Claude Opus 5.5 for node chat, NIM kept as a switchable fallback

NIM's free models couldn't do the job even with a rich fact sheet: they skipped tool calls, mixed
up whose move it was, and invented pieces the board section said weren't there. With the same
prompt and tools, Opus 5.5 checked lines and explained the real idea in each test position, for
roughly 3–5 cents a question. `LLM_PROVIDER` switches between them; NIM stays for free testing.

## NVIDIA NIM for node chat, through the Convex Agent component

NIM's hosted API is free for development, serves many open models, and is OpenAI-compatible,
so the chat uses the AI SDK's generic OpenAI-compatible provider: switching provider or model is
a change of `LLM_BASE_URL` / `LLM_MODEL`, not code. Alternatives considered: Gemini Flash's free
tier, Groq, OpenRouter's free models. The Agent component (as the design doc planned) gives
threads, tool-call steps and streamed replies over Convex's reactivity. It's pinned to v0.6 (AI
SDK 6) because v0.7 needs Node 22.

## Branch only at mistakes and blunders, one line each

The first version branched at every "critical" move with the engine's top two alternatives,
where critical included any only-move position. In real games most of those were obvious
recaptures (17 of 29 in three games), so the tree branched into losing alternatives nobody would
consider. Now only mistakes and blunders branch, with the single move that should have been
played: the branch reads as "what you played vs what you should have played".

## Tree drawn as a metro map with cards at turning points

Compared four node styles (boxes per move, soft chips, move pairs, metro line; with or without
cards). The metro line is the calmest for long games; cards with a mini board make the turning
points, which is where questions get asked, stand out without clicking. Colours stay, explained
by a legend in the panel.

## Board plus tabbed panel instead of three panes

Board, tree and engine lines side by side was too busy, and the move list duplicated the tree.
The panel's tabs (Position, Tree, Moves) keep each view full-size; the tree can go full screen.
The Position tab is where node chat (M4) will live, so the tree becomes the map of conversations.

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
took many minutes, and deep positions hit the 90 s search timeout. Native Stockfish on Fly
measures 1–2.3 s per position and runs several searches in parallel. The service is a single
dependency-free file so it runs on any Docker host.

Hosting: Railway was the first choice (free tier, $5 Hobby plan) but had an outage during setup.
Fly.io is used instead: pay-per-second with auto-stop, so cost tracks usage. New Fly orgs can't use
dedicated `performance-*` machines, so it runs on `shared-cpu-2x`. Rejected: Render and Heroku
(cheap tiers get a fraction of a CPU; Heroku also caps requests at 30 s). Cloud Run (free tier) and
a $5 VPS remain good alternatives; switching only changes `ENGINE_URL`.

**Fallback removed.** The WASM-in-Convex engine was kept as a fallback until the service was
proven, then deleted: mixing lite and full Stockfish results in the shared `analyses` cache would
make classifications partly reflect the engine difference, and it took the most fragile code in
the repo with it (base64 `.wasm`, patched Emscripten glue, a Node-only action). The trade-off: a
local Convex backend now needs the engine service running locally too. The browser WASM engine
stays; it's for live browsing.

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

- **Detectors (M6):** undecided whether to follow Take Take Take's approach. Keep the per-node
  fact sheet pluggable.
