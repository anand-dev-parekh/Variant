import { describe, expect, it } from 'vitest';
import { moveNumber, outcomeFor, sketchOf, topMoments, type GameSummary } from './gameSummary';

const FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

// 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4, with turning points at plies 4 and 8.
const summary: GameSummary = {
  san: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4'],
  evals: [0.2, 0.3, 0.3, 0.4, 0.2, 0.3, 0.3, 0.4, 1.5, 1.4, 1.4],
  moments: [
    { ply: 4, classification: 'inaccuracy', winPercentLoss: 8, fen: FEN, best: { san: ['d6', 'd4'], score: { cp: 30 } } },
    { ply: 8, classification: 'blunder', winPercentLoss: 31.6, fen: FEN, best: { san: ['d6'], score: { cp: -10 } } },
  ],
  fen: FEN,
};

describe('moveNumber', () => {
  it('numbers White and Black moves', () => {
    expect([1, 2, 3, 10].map(moveNumber)).toEqual(['1.', '1…', '2.', '5…']);
  });
});

describe('outcomeFor', () => {
  it('reads the result from either side, and nothing without a side', () => {
    expect(outcomeFor('1-0', 'w')).toBe('won');
    expect(outcomeFor('1-0', 'b')).toBe('lost');
    expect(outcomeFor('1/2-1/2', 'b')).toBe('drawn');
    expect(outcomeFor('*', 'w')).toBeNull();
    expect(outcomeFor('1-0', null)).toBeNull();
  });
});

describe('topMoments', () => {
  it('keeps the biggest, in game order', () => {
    expect(topMoments(summary, 1).map((m) => m.ply)).toEqual([8]);
    expect(topMoments(summary).map((m) => m.ply)).toEqual([4, 8]);
  });
});

describe('sketchOf', () => {
  it('folds quiet stretches into runs, with a card and an engine line at each turning point', () => {
    const stops = sketchOf(summary).map((s) =>
      s.kind === 'card' ? `card ${s.row} ${s.label} ${s.verdict} -${s.loss}% best ${s.best}` : s.kind === 'run' ? `run ${s.col},${s.row} ${s.text}` : `move ${s.row} ${s.label}`,
    );
    expect(stops).toEqual([
      'move 0 Start',
      'run 0,1 1. e4 … 2. Nf3 · 3 moves',
      'card 2 2… Nc6 key -8% best 2… d6',
      'run 1,2 2… d6 … +0.30',
      'run 0,3 3. Bc4 … 4. c3 · 3 moves',
      'card 4 4… Nf6 blunder -32% best 4… d6',
      'run 1,4 4… d6 … -0.10',
      'run 0,5 5. d4',
      'move 6 5… exd4',
    ]);
  });
});
