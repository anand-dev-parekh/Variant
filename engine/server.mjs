// Native Stockfish behind a tiny HTTP API. No dependencies; Node 20+.
//
//   GET  /health                                → { ok, engines, busy, queued }
//   POST /analyze { fen, depth, multiPv }       → { depth, bestmove, lines: [{ multipv, depth, score, pv }] }
//        (Authorization: Bearer $ENGINE_TOKEN; scores are side-to-move POV, as UCI reports them)
//
// Each engine runs single-threaded and starts every search with `ucinewgame` (cleared hash),
// so the same request always gets the same answer. Throughput comes from running one engine
// process per CPU instead.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { availableParallelism } from 'node:os';
import { createInterface } from 'node:readline';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const STOCKFISH_PATH = process.env.STOCKFISH_PATH ?? 'stockfish';
const ENGINE_TOKEN = process.env.ENGINE_TOKEN;
const POOL_SIZE = Number(process.env.POOL_SIZE ?? availableParallelism());
const HASH_MB = Number(process.env.HASH_MB ?? 64);
const MAX_DEPTH = 24;
const MAX_MULTIPV = 5;
const MAX_QUEUE = 64;
const SEARCH_TIMEOUT_MS = 120_000;

if (!ENGINE_TOKEN) {
  console.error('ENGINE_TOKEN must be set');
  process.exit(1);
}

/** One Stockfish process speaking UCI over stdin/stdout. */
class Engine {
  constructor() {
    this.dead = false;
    this.waiter = null; // { match(line) → boolean, resolve, reject }
    this.proc = spawn(STOCKFISH_PATH, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.proc.on('error', (err) => this.die(err));
    this.proc.on('exit', (code) => this.die(new Error(`stockfish exited with code ${code}`)));
    this.proc.stdin.on('error', (err) => this.die(err)); // EPIPE if the process is already gone
    createInterface({ input: this.proc.stdout }).on('line', (line) => this.onLine(line));
    this.ready = this.init();
    this.ready.catch(() => {});
  }

  async init() {
    this.send('uci');
    await this.until((l) => l === 'uciok');
    this.send('setoption name Threads value 1');
    this.send(`setoption name Hash value ${HASH_MB}`);
    this.send('isready');
    await this.until((l) => l === 'readyok');
  }

  send(cmd) {
    this.proc.stdin.write(cmd + '\n');
  }

  /** Resolves with the first line `match` accepts; every line is offered to `onInfo` meanwhile. */
  until(match, onInfo) {
    return new Promise((resolve, reject) => {
      if (this.dead) return reject(new Error('engine is dead'));
      this.waiter = { match, onInfo, resolve, reject };
    });
  }

  onLine(line) {
    const w = this.waiter;
    if (!w) return;
    if (w.match(line)) {
      this.waiter = null;
      w.resolve(line);
    } else {
      w.onInfo?.(line);
    }
  }

  die(err) {
    if (this.dead) return;
    this.dead = true;
    this.waiter?.reject(err);
    this.waiter = null;
    this.proc.kill();
  }

  async analyze(fen, depth, multiPv) {
    await this.ready;
    if (this.dead) throw new Error('engine is dead');
    this.send('ucinewgame');
    this.send(`setoption name MultiPV value ${multiPv}`);
    this.send('isready');
    await this.until((l) => l === 'readyok');

    const lines = new Map();
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    const timer = setTimeout(() => this.die(new Error('search timed out')), SEARCH_TIMEOUT_MS);
    try {
      const done = await this.until(
        (l) => l.startsWith('bestmove'),
        (l) => {
          const info = parseInfo(l);
          if (info) lines.set(info.multipv, info);
        },
      );
      const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
      return { depth: sorted[0]?.depth ?? 0, bestmove: done.split(' ')[1], lines: sorted };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** `info ... multipv N score cp|mate X ... pv ...` → line, or null (skips bound scores). */
function parseInfo(line) {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const t = line.split(' ');
  const at = (key) => t.indexOf(key);
  if (at('lowerbound') >= 0 || at('upperbound') >= 0) return null;
  const s = at('score');
  if (s < 0) return null;
  return {
    multipv: at('multipv') >= 0 ? Number(t[at('multipv') + 1]) : 1,
    depth: Number(t[at('depth') + 1]),
    score: t[s + 1] === 'mate' ? { mate: Number(t[s + 2]) } : { cp: Number(t[s + 2]) },
    pv: t.slice(at('pv') + 1),
  };
}

/** Fixed-size pool; replaces engines that die (Stockfish 19 exits on an invalid FEN). */
class Pool {
  constructor(size) {
    this.idle = Array.from({ length: size }, () => new Engine());
    this.size = size;
    this.queue = [];
  }

  async run(fn) {
    if (this.idle.length === 0 && this.queue.length >= MAX_QUEUE) throw Object.assign(new Error('busy'), { status: 503 });
    const engine = this.idle.pop() ?? (await new Promise((resolve) => this.queue.push(resolve)));
    try {
      return await fn(engine);
    } finally {
      this.release(engine.dead ? new Engine() : engine);
    }
  }

  release(engine) {
    const next = this.queue.shift();
    if (next) next(engine);
    else this.idle.push(engine);
  }
}

const pool = new Pool(POOL_SIZE);

// Board, side to move, castling, en passant, and the two counters. Stockfish does the rest.
const FEN_RE = /^[1-8pnbrqkPNBRQK/]{15,71} [wb] (-|K?Q?k?q?) (-|[a-h][36]) \d+ \d+$/;

function authorized(req) {
  const given = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${ENGINE_TOKEN}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw Object.assign(new Error('body too large'), { status: 413 });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { ok: true, engines: pool.size, idle: pool.idle.length, queued: pool.queue.length });
    }
    if (req.method !== 'POST' || req.url !== '/analyze') return send(res, 404, { error: 'not found' });
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });

    const { fen, depth = 18, multiPv = 1 } = await readJson(req);
    if (typeof fen !== 'string' || !FEN_RE.test(fen)) return send(res, 400, { error: 'invalid fen' });
    if (!Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH) return send(res, 400, { error: `depth must be 1–${MAX_DEPTH}` });
    if (!Number.isInteger(multiPv) || multiPv < 1 || multiPv > MAX_MULTIPV) return send(res, 400, { error: `multiPv must be 1–${MAX_MULTIPV}` });

    const started = Date.now();
    const result = await pool.run((engine) => engine.analyze(fen, depth, multiPv));
    send(res, 200, { ...result, ms: Date.now() - started });
  } catch (err) {
    send(res, err.status ?? 500, { error: err.message });
  }
}).listen(PORT, () => {
  console.log(`engine service on :${PORT} with ${POOL_SIZE} × ${STOCKFISH_PATH}`);
});
