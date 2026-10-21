import { Chess } from 'chess.js';
import type { Score } from './score';

/** A parsed UCI `info` line that carries a principal variation. Score is side-to-move POV. */
export type UciInfo = {
  depth: number;
  multipv: number;
  score: Score;
  /** Present on a `lowerbound`/`upperbound` line; such scores are not final. */
  bound?: 'lower' | 'upper';
  nodes?: number;
  pv: string[];
};

/** Parses an `info ... pv ...` line. Returns null for lines without a score and PV. */
export function parseInfoLine(line: string): UciInfo | null {
  if (!line.startsWith('info ')) return null;
  const tokens = line.split(/\s+/);

  let depth: number | undefined;
  let multipv = 1;
  let score: Score | undefined;
  let bound: UciInfo['bound'];
  let nodes: number | undefined;
  let pv: string[] | undefined;

  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        depth = Number(tokens[++i]);
        break;
      case 'multipv':
        multipv = Number(tokens[++i]);
        break;
      case 'nodes':
        nodes = Number(tokens[++i]);
        break;
      case 'score': {
        const kind = tokens[++i];
        const value = Number(tokens[++i]);
        score = kind === 'mate' ? { mate: value } : { cp: value };
        if (tokens[i + 1] === 'lowerbound') bound = 'lower';
        if (tokens[i + 1] === 'upperbound') bound = 'upper';
        break;
      }
      case 'pv':
        pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
    }
  }

  if (depth === undefined || score === undefined || !pv || pv.length === 0) return null;
  return { depth, multipv, score, bound, nodes, pv };
}

/** Converts a line of UCI moves ("e2e4 e7e5") to SAN, stopping at the first illegal move. */
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of uciMoves) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      san.push(move.san);
    } catch {
      break;
    }
  }
  return san;
}
