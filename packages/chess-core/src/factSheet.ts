import type { PieceSymbol } from 'chess.js';
import type { BoardFacts, PawnFacts } from './board';
import type { Classification } from './classify';
import { formatSanLine, sideToMove, type Color } from './game';
import type { Terminal } from './position';
import { formatScore, winPercent, type Score } from './score';

/** A line of moves and the engine's score at its end. */
export type FactLine = { san: string[]; score: Score };

/**
 * Moves actually played after a position. `evals[i]` is the evaluation after `san[i]` (null if
 * not analyzed) and `verdicts[i]` its classification, so the reader can see where the game swung.
 * Per-move evals are only shown for played moves: along an engine line they barely move.
 */
export type Continuation = { san: string[]; evals: (Score | null)[]; verdicts: (Classification | null)[] };

/**
 * Everything verified about one position, for the LLM to explain from. Built from the database
 * (engine analysis plus classification) and the board itself; nothing in it is generated text.
 * Milestone 6 adds detector output here.
 */
export type FactSheet = {
  fen: string;
  /** Position the game started from, and the SAN moves from there to `fen`. */
  startFen: string;
  path: string[];
  /** How this position entered the tree. */
  source: 'game' | 'engine' | 'user';
  board: BoardFacts;
  /** The move into this position; absent at the start. */
  lastMove?: {
    san: string;
    fenBefore: string;
    by: Color;
    classification?: Classification;
    winPercentLoss?: number;
    onlyMove?: boolean;
    keyMoment?: boolean;
    /** The engine's best line from the position before the move, when the move wasn't it. */
    enginePreferred?: FactLine;
  };
  terminal?: Terminal;
  /** Saved engine analysis of this position; absent until it has been analyzed. */
  analysis?: { depth: number; lines: FactLine[] };
  /** What was actually played next in the game, when this position is on the main line. */
  continuation?: Continuation;
};

const COLOR: Record<Color, string> = { w: 'White', b: 'Black' };
const PIECE_NAME: Record<PieceSymbol, [string, string]> = {
  k: ['King', 'King'],
  q: ['Queen', 'Queens'],
  r: ['Rook', 'Rooks'],
  b: ['Bishop', 'Bishops'],
  n: ['Knight', 'Knights'],
  p: ['Pawn', 'Pawns'],
};

/** Engine lines are cut to this many plies in the prompt: the tail of a long PV is noise. */
export const PROMPT_LINE_PLIES = 8;

/** The fact sheet as plain text for a system prompt. Scores are White's point of view. */
export function renderFactSheet(sheet: FactSheet): string {
  const out: string[] = [];
  const toMove = sideToMove(sheet.fen);
  out.push(`FEN: ${sheet.fen}`);
  out.push(`Side to move: ${COLOR[toMove]}${sheet.board.inCheck ? ' (in check)' : ''}`);
  out.push(`Moves so far: ${sheet.path.length ? formatSanLine(sheet.startFen, sheet.path) : '(starting position)'}`);
  if (sheet.source !== 'game') {
    out.push(sheet.source === 'engine' ? 'This position is on an engine line, not the game.' : 'This position is a what-if, not the game.');
  }

  out.push('', 'Board:');
  for (const side of ['w', 'b'] as const) out.push(`  ${COLOR[side]}: ${describePieces(sheet.board, side)}`);
  out.push(`  Material: ${describeMaterial(sheet.board)}`);
  for (const side of ['w', 'b'] as const) {
    out.push(`  ${COLOR[side]} pawns: ${describePawns(sheet.board.pawns[side])}`);
  }

  const last = sheet.lastMove;
  if (last) {
    out.push('');
    const parts = [`Last move: ${formatSanLine(last.fenBefore, [last.san])} by ${COLOR[last.by]}`];
    if (last.classification) {
      const loss = last.winPercentLoss !== undefined ? `, lost ${last.winPercentLoss.toFixed(1)} win-% points` : '';
      parts.push(`judged ${last.classification}${loss}`);
    }
    out.push(parts.join(', '));
    if (last.keyMoment) out.push(`This was one of ${COLOR[last.by]}'s biggest slips of the game.`);
    if (last.onlyMove) out.push('Only one move kept the evaluation in the position before it.');
    if (last.enginePreferred) out.push(`Engine preferred instead: ${formatLine(last.fenBefore, last.enginePreferred)}`);
  }

  out.push('');
  if (sheet.terminal) {
    out.push(`The game is over: ${sheet.terminal === 'insufficient' ? 'insufficient material' : sheet.terminal}.`);
  } else if (sheet.analysis?.lines.length) {
    const [best] = sheet.analysis.lines;
    out.push(
      `Evaluation (depth ${sheet.analysis.depth}): ${formatScore(best!.score)}, White wins ${winPercent(best!.score).toFixed(0)}%`,
    );
    out.push('Engine lines from here, best first:');
    sheet.analysis.lines.forEach((line, i) => out.push(`  ${i + 1}. ${formatLine(sheet.fen, line)}`));
  } else {
    out.push('No saved engine analysis for this position yet; use the evaluate tool.');
  }

  if (sheet.continuation?.san.length) {
    out.push(`What was played next in the game (evaluation after each move): ${formatContinuation(sheet.fen, sheet.continuation)}`);
  }
  return out.join('\n');
}

function formatLine(fen: string, line: FactLine): string {
  return `${formatSanLine(fen, line.san.slice(0, PROMPT_LINE_PLIES))} (${formatScore(line.score)})`;
}

/** "28… Kc5 [-0.03, mistake] 29. a3 [-1.20]": each move with the evaluation after it, if known. */
function formatContinuation(fen: string, c: Continuation): string {
  const out: string[] = [];
  let ply = 0;
  for (const token of formatSanLine(fen, c.san).split(' ')) {
    out.push(token);
    if (/^\d+(\.|…)$/.test(token)) continue;
    const score = c.evals[ply];
    const verdict = c.verdicts[ply];
    ply++;
    const notes = [score && formatScore(score), verdict && verdict !== 'best' && verdict !== 'good' && verdict].filter(Boolean);
    if (notes.length) out.push(`[${notes.join(', ')}]`);
  }
  return out.join(' ');
}

function describePieces(board: BoardFacts, side: Color): string {
  const groups = new Map<PieceSymbol, string[]>();
  for (const p of board.pieces[side]) groups.set(p.type, [...(groups.get(p.type) ?? []), p.square]);
  return [...groups].map(([type, squares]) => `${PIECE_NAME[type][squares.length > 1 ? 1 : 0]} ${squares.join(' ')}`).join('; ');
}

function describeMaterial(board: BoardFacts): string {
  const { w, b } = board.material;
  const balance = board.materialBalance;
  const verdict = balance === 0 ? 'level' : `${balance > 0 ? 'White' : 'Black'} is up ${Math.abs(balance)}`;
  return `White ${w}, Black ${b} in pawn units (P1 N3 B3 R5 Q9): ${verdict}`;
}

function describePawns(p: PawnFacts): string {
  const parts = [
    `${p.islands} island${p.islands === 1 ? '' : 's'}`,
    p.passed.length ? `passed ${p.passed.join(' ')}` : 'no passed pawns',
  ];
  if (p.isolated.length) parts.push(`isolated ${p.isolated.join(' ')}`);
  if (p.doubled.length) parts.push(`doubled on the ${p.doubled.join(', ')}-file${p.doubled.length > 1 ? 's' : ''}`);
  return parts.join('; ');
}
