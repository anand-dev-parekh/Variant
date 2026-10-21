'use node';

import {
  parseInfoLine,
  sideToMove,
  terminalState,
  toWhitePov,
  uciLineToSan,
  type Score,
  type Terminal,
  type UciInfo,
} from '@variant/chess-core';
import createEngine from '../../vendor/stockfish/engine.cjs';
import { STOCKFISH_WASM_BASE64 } from '../../vendor/stockfish/wasm';

export const ENGINE_NAME = 'stockfish-19-lite';

/** A search that hasn't finished by now is treated as hung. */
const SEARCH_TIMEOUT_MS = 90_000;

export type ServerAnalysis = {
  depth: number;
  terminal?: Terminal;
  /** Best first, White POV. */
  lines: { score: Score; pv: string[]; san: string[] }[];
};

type RawEngine = ReturnType<typeof createEngine>;

let engine: Promise<RawEngine> | null = null;
let onLine: ((line: string) => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Starts the WASM engine once per Node process. The glue reads its .wasm bytes from a
 * global (see scripts/prepare-stockfish.mjs). Output is delivered on a later tick:
 * sending a command from inside the engine's print callback deadlocks it.
 */
function getEngine(): Promise<RawEngine> {
  engine ??= new Promise((resolve) => {
    (globalThis as { __STOCKFISH_WASM__?: Buffer }).__STOCKFISH_WASM__ = Buffer.from(STOCKFISH_WASM_BASE64, 'base64');
    const raw = createEngine();
    raw.listener = (line) => setImmediate(() => onLine?.(line));
    onLine = (line) => {
      if (line === 'readyok') resolve(raw);
    };
    raw.processCommand('uci');
    raw.processCommand('isready');
  });
  return engine;
}

/** Analyzes one position. Calls are serialized: the engine runs one search at a time. */
export function analyzePosition(fen: string, opts: { depth: number; multiPv: number }): Promise<ServerAnalysis> {
  const run = queue.then(() => search(fen, opts));
  queue = run.catch(() => {});
  return run;
}

async function search(fen: string, { depth, multiPv }: { depth: number; multiPv: number }): Promise<ServerAnalysis> {
  const terminal = terminalState(fen);
  if (terminal) return { depth, terminal, lines: [] };

  const raw = await getEngine();
  return new Promise((resolve, reject) => {
    const lines = new Map<number, UciInfo>();
    const timer = setTimeout(() => {
      onLine = null;
      raw.processCommand('stop');
      reject(new Error(`Stockfish timed out on ${fen}`));
    }, SEARCH_TIMEOUT_MS);

    onLine = (line) => {
      if (line.startsWith('bestmove')) {
        clearTimeout(timer);
        onLine = null;
        const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
        resolve({
          depth: sorted[0]?.depth ?? 0,
          lines: sorted.map((info) => ({
            score: toWhitePov(info.score, sideToMove(fen)),
            pv: info.pv,
            san: uciLineToSan(fen, info.pv),
          })),
        });
        return;
      }
      const info = parseInfoLine(line);
      if (info && !info.bound) lines.set(info.multipv, info);
    };

    raw.processCommand(`setoption name MultiPV value ${multiPv}`);
    raw.processCommand(`position fen ${fen}`);
    raw.processCommand(`go depth ${depth}`);
  });
}
