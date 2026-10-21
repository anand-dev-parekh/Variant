import { describe, expect, it } from 'vitest';
import { formatScore, toWhitePov, winPercent } from './score';
import { parseInfoLine, uciLineToSan } from './uci';

describe('parseInfoLine', () => {
  it('parses a MultiPV centipawn line', () => {
    const info = parseInfoLine(
      'info depth 18 seldepth 24 multipv 2 score cp -35 nodes 812345 nps 900000 time 900 pv e7e5 g1f3 b8c6',
    );
    expect(info).toEqual({
      depth: 18,
      multipv: 2,
      score: { cp: -35 },
      bound: undefined,
      nodes: 812345,
      pv: ['e7e5', 'g1f3', 'b8c6'],
    });
  });

  it('parses mate scores and bounds', () => {
    expect(parseInfoLine('info depth 5 score mate -2 pv e1e2')?.score).toEqual({ mate: -2 });
    expect(parseInfoLine('info depth 9 score cp 20 lowerbound pv e2e4')?.bound).toBe('lower');
  });

  it('ignores lines without a PV', () => {
    expect(parseInfoLine('info string NNUE evaluation using nn.nnue')).toBeNull();
    expect(parseInfoLine('info depth 1 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfoLine('bestmove e2e4 ponder e7e5')).toBeNull();
  });
});

describe('uciLineToSan', () => {
  it('converts moves including castling and promotion', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(uciLineToSan(start, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
    expect(uciLineToSan('4k3/P7/8/8/8/8/8/4K2R w K - 0 1', ['a7a8q', 'e8d7', 'e1g1'])).toEqual([
      'a8=Q+',
      'Kd7',
      'O-O',
    ]);
  });

  it('stops at the first illegal move', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(uciLineToSan(start, ['e2e4', 'e2e4', 'g1f3'])).toEqual(['e4']);
  });
});

describe('scores', () => {
  it('flips side-to-move scores to White POV', () => {
    expect(toWhitePov({ cp: 50 }, 'b')).toEqual({ cp: -50 });
    expect(toWhitePov({ mate: 3 }, 'b')).toEqual({ mate: -3 });
    expect(toWhitePov({ cp: 50 }, 'w')).toEqual({ cp: 50 });
  });

  it('maps scores to win percent', () => {
    expect(winPercent({ cp: 0 })).toBeCloseTo(50);
    expect(winPercent({ cp: 300 })).toBeGreaterThan(70);
    expect(winPercent({ mate: 2 })).toBe(100);
    expect(winPercent({ mate: -1 })).toBe(0);
    // A 200cp swing matters more at equality than when already winning.
    const nearEqual = winPercent({ cp: 100 }) - winPercent({ cp: -100 });
    const alreadyWon = winPercent({ cp: 900 }) - winPercent({ cp: 700 });
    expect(nearEqual).toBeGreaterThan(alreadyWon * 3);
  });

  it('formats scores', () => {
    expect(formatScore({ cp: 125 })).toBe('+1.25');
    expect(formatScore({ cp: -40 })).toBe('-0.40');
    expect(formatScore({ cp: 0 })).toBe('0.00');
    expect(formatScore({ mate: -2 })).toBe('#-2');
  });
});
