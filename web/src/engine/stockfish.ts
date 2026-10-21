import { parseInfoLine, sideToMove, toWhitePov, uciLineToSan, type Score } from '@variant/chess-core';

const ENGINE_URL = '/stockfish/stockfish-19-lite-single.js';

export type EngineLine = {
  multipv: number;
  depth: number;
  /** White's point of view. */
  score: Score;
  pv: string[];
  san: string[];
};

export type Analysis = {
  fen: string;
  depth: number;
  lines: EngineLine[];
  done: boolean;
};

type Search = {
  fen: string;
  depth: number;
  onUpdate: (analysis: Analysis) => void;
};

/**
 * Wraps the Stockfish Web Worker. Only one search runs at a time: asking for a new
 * position stops the current search, and output is ignored until its `bestmove` arrives,
 * so stale lines never leak into the next position's results.
 */
export class StockfishEngine {
  private worker: Worker;
  private ready = false;
  private running: Search | null = null;
  private next: Search | null = null;
  private lines = new Map<number, EngineLine>();

  constructor(private multiPv = 3) {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e: MessageEvent<string>) => this.onLine(String(e.data));
    this.send('uci');
  }

  analyze(fen: string, depth: number, onUpdate: Search['onUpdate']) {
    this.next = { fen, depth, onUpdate };
    if (this.running) this.send('stop');
    else this.startNext();
  }

  stop() {
    this.next = null;
    if (this.running) {
      this.running.onUpdate = () => {};
      this.send('stop');
    }
  }

  terminate() {
    this.worker.terminate();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private startNext() {
    if (!this.ready || !this.next) return;
    this.running = this.next;
    this.next = null;
    this.lines.clear();
    this.send(`position fen ${this.running.fen}`);
    this.send(`go depth ${this.running.depth}`);
  }

  private onLine(line: string) {
    if (line === 'uciok') {
      this.send(`setoption name MultiPV value ${this.multiPv}`);
      this.send('isready');
      return;
    }
    if (line === 'readyok') {
      this.ready = true;
      this.startNext();
      return;
    }
    if (line.startsWith('bestmove')) {
      const finished = this.running;
      this.running = null;
      // A search that was stopped for a newer request has nothing worth reporting.
      if (finished && !this.next) this.emit(finished, true);
      this.startNext();
      return;
    }

    const search = this.running;
    if (!search || this.next) return;
    const info = parseInfoLine(line);
    if (!info || info.bound) return;

    this.lines.set(info.multipv, {
      multipv: info.multipv,
      depth: info.depth,
      score: toWhitePov(info.score, sideToMove(search.fen)),
      pv: info.pv,
      san: uciLineToSan(search.fen, info.pv),
    });
    this.emit(search, false);
  }

  private emit(search: Search, done: boolean) {
    const lines = [...this.lines.values()].sort((a, b) => a.multipv - b.multipv);
    if (lines.length === 0) return;
    search.onUpdate({ fen: search.fen, depth: lines[0]!.depth, lines, done });
  }
}
