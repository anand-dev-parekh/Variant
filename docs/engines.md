# Engines

Stockfish runs in two places. Only the engine service produces stored analysis, so every saved
evaluation comes from the same engine with the same settings.

| | Engine service | WASM in the browser |
| --- | --- | --- |
| Code | `engine/server.mjs` (called from `web/convex/lib/remoteEngine.ts`) | `web/src/engine/stockfish.ts` |
| Build | Stockfish 19 native (official Linux release) | Stockfish 19 lite, single-threaded |
| Used for | The analysis pass (required) | Live evals of positions without saved analysis |
| Writes to DB | Yes (`engine: 'stockfish-19'`) | Never |

## Engine service (`engine/`)

A dependency-free Node 20+ server around a pool of native Stockfish processes.

### API

```
GET  /health
  → { ok, engines, idle, queued }

POST /analyze            Authorization: Bearer $ENGINE_TOKEN
  { fen, depth = 18, multiPv = 1 }
  → { depth, bestmove, lines: [{ multipv, depth, score, pv }], ms }
```

- `score` is **side-to-move POV**, as UCI reports it (`{cp}` or `{mate}`). The Convex client
  (`web/convex/lib/remoteEngine.ts`) flips it to White POV and adds SAN.
- Limits: depth 1–24, multiPv 1–5, body ≤ 10 KB, queue ≤ 64 waiting requests (503 beyond),
  120 s per search. FENs are shape-checked with a regex; Stockfish does the rest.
- Errors: 400 bad input, 401 bad token (timing-safe comparison), 404, 503 busy, 500 otherwise.

### Behaviour

- **Determinism.** Each engine runs `Threads 1` and sends `ucinewgame` (clears the hash) before
  every search, so the same request always returns the same lines. Throughput comes from running
  `POOL_SIZE` processes, not threads.
- **Crash recovery.** Stockfish 19 exits on some invalid FENs (e.g. no king). The pool replaces a
  dead engine before handing out the next one; the failing request gets a 500.
- **Client retries.** `analyzeRemote` retries network errors and 502/503 up to 4 attempts with
  exponential backoff (2 s, 4 s, 8 s). That covers a sleeping instance waking up.

### Configuration

| Env var | Default | |
| --- | --- | --- |
| `ENGINE_TOKEN` | (required) | Shared secret; the server exits without it |
| `PORT` | 8080 | |
| `STOCKFISH_PATH` | `stockfish` | Binary to spawn. The Docker image installs it at `/usr/local/bin/stockfish` |
| `POOL_SIZE` | CPU count | **Set it explicitly in containers.** Node may report the host's CPU count, starting far more engines than the container can hold |
| `HASH_MB` | 64 | Hash per engine. Memory ≈ `POOL_SIZE × (HASH_MB + ~30 MB)` |

### Docker image

`engine/Dockerfile`: `node:22-bookworm-slim`, downloads the official `sf_19`
`stockfish-linux-x86-64-universal` release (the universal binary picks AVX2/AVX-512 at
runtime), checks its SHA-256, runs as the `node` user. `.dockerignore` allows only
`package.json` and `server.mjs` into the build. To upgrade Stockfish, change both
`STOCKFISH_RELEASE` and `STOCKFISH_SHA256`.

### Deploying (Fly.io, current)

Production runs on Fly as `variant-engine` (`https://variant-engine.fly.dev`), configured by
`engine/fly.toml`: one `shared-cpu-2x` machine (1 GB, `POOL_SIZE=2`) in `iad`, near Convex. The
machine stops when idle and starts on the next request, so it bills only while analyzing; the
client's retries cover the start-up delay. Measured: 1–2.3 s per position at depth 18, MultiPV 3.

From `engine/` (install flyctl with `curl -L https://fly.io/install.sh | sh`):

```bash
fly launch --copy-config --no-deploy                # first time only: creates the app
TOKEN=$(openssl rand -hex 32)
fly secrets set ENGINE_TOKEN=$TOKEN
fly deploy --ha=false                               # one machine, not Fly's default two

cd ../web
npx convex env set ENGINE_URL https://variant-engine.fly.dev
npx convex env set ENGINE_TOKEN "$TOKEN"
npx convex run engine:benchmark '{"depth": 18}'     # should report engine "stockfish-19"
```

Dedicated `performance-*` machines are faster under sustained load, but new Fly organizations
must ask billing@fly.io to enable them. Shared CPUs burst to full speed and are throttled only
under long sustained load; one game at a time mostly fits in the burst.

### Deploying elsewhere

Any Docker host works; only `ENGINE_URL`/`ENGINE_TOKEN` change. Railway (`railway init`,
`railway add --service engine --variables …`, `railway up`, `railway domain`), Google Cloud Run
(free tier, scales to zero), or a $5 VPS with Caddy for HTTPS. Avoid hosts whose cheap plans give
a fraction of a CPU (Render/Heroku free and starter tiers) or cap request time at 30 s (Heroku).
Set `POOL_SIZE` to the machine's vCPUs.

### Running locally

```bash
brew install stockfish        # or download a release binary
ENGINE_TOKEN=dev STOCKFISH_PATH=$(which stockfish) node engine/server.mjs
```

A **local** Convex backend can reach it (`npx convex env set ENGINE_URL http://localhost:8080`,
`ENGINE_TOKEN dev`). A cloud deployment cannot reach your laptop.

## Removed: WASM in Convex

Until the service was deployed, analysis ran WASM Stockfish inside a Convex Node action, which
needed the `.wasm` embedded as base64 and two patches to the Emscripten glue. It took 6–17 s per
position in Convex cloud and timed out on deep positions, so it was removed; see
[decisions](decisions.md). Analyses it saved (`engine: 'stockfish-19-lite'`) were purged with
`pipeline:purgeAnalyses` and the games re-run with `pipeline:reanalyze`.

## WASM in the browser

`web/public/stockfish/` (copied by `prepare-stockfish.mjs`) is loaded as a Web Worker.
`StockfishEngine` runs one search at a time: a new position stops the current search, and output
is ignored until its `bestmove`, so stale lines never show for the wrong position. `useAnalysis`
searches to depth 20 with 3 lines.

The game page uses it only when the selected position has **no saved analysis** and isn't
finished, and only while the "live" toggle is on. Single-threaded WASM needs no COOP/COEP headers.
