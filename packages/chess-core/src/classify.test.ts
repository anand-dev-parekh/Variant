import { describe, expect, it } from 'vitest';
import { judgeMove, pickKeyMoments, winPercentFor } from './classify';
import { parseGame } from './game';
import { OPERA_GAME_PGN } from './samples';
import { playUciLine, positionKey, terminalScore, terminalState } from './position';

const line = (cp: number, first: string) => ({ score: { cp }, pv: [first] });

describe('judgeMove', () => {
  it('calls the engine move best regardless of eval', () => {
    const v = judgeMove({ mover: 'w', playedUci: 'e2e4', before: [line(30, 'e2e4'), line(20, 'd2d4')], after: { cp: 25 } });
    expect(v).toMatchObject({ classification: 'best', critical: false, onlyMove: false });
  });

  it('grades losses by win-% points for the mover', () => {
    // Black to move at equality. On the Lichess curve, 10/20/30 win-% points from
    // equality are roughly +1.1, +2.3 and +4.2 for White.
    const before = [line(0, 'e7e5'), line(-10, 'c7c5')];
    const after = (cp: number) => judgeMove({ mover: 'b', playedUci: 'a7a6', before, after: { cp } }).classification;
    expect(after(500)).toBe('blunder');
    expect(after(300)).toBe('mistake');
    expect(after(150)).toBe('inaccuracy');
    expect(after(50)).toBe('good');
  });

  it('is lenient when the game is already decided', () => {
    // White is up a rook either way: +9 -> +7 is a small win-% change.
    const v = judgeMove({ mover: 'w', playedUci: 'a2a3', before: [line(900, 'e2e4')], after: { cp: 700 } });
    expect(v.classification).toBe('good');
  });

  it('notes only-move positions but does not branch on a found only move', () => {
    const v = judgeMove({ mover: 'w', playedUci: 'e2e4', before: [line(0, 'e2e4'), line(-400, 'd2d4')], after: { cp: 0 } });
    expect(v).toMatchObject({ classification: 'best', onlyMove: true, critical: false });
  });

  it('makes mistakes and blunders critical, inaccuracies not', () => {
    const before = [line(0, 'e7e5'), line(-10, 'c7c5')];
    const critical = (cp: number) => judgeMove({ mover: 'b', playedUci: 'a7a6', before, after: { cp } }).critical;
    expect(critical(500)).toBe(true);
    expect(critical(300)).toBe(true);
    expect(critical(150)).toBe(false);
  });

  it('treats walking into a forced mate as a blunder unless already lost', () => {
    // Immortal Game, 20…Na6: Black was worse but alive (+2.40), then got mated.
    const into = (cp: number) =>
      judgeMove({ mover: 'b', playedUci: 'b8a6', before: [line(cp, 'g8e7')], after: { mate: 3 } }).classification;
    expect(into(240)).toBe('blunder');
    expect(into(800)).toBe('mistake');
    expect(into(1200)).toBe('inaccuracy');
  });

  it('downgrades a missed mate when the result is still crushing', () => {
    const missed = (cp: number) =>
      judgeMove({ mover: 'w', playedUci: 'a2a3', before: [{ score: { mate: 3 }, pv: ['d1h5'] }], after: { cp } })
        .classification;
    expect(missed(1500)).toBe('inaccuracy');
    expect(missed(800)).toBe('mistake');
  });

  it('treats a missed mate as a blunder', () => {
    const v = judgeMove({ mover: 'w', playedUci: 'a2a3', before: [{ score: { mate: 2 }, pv: ['d1h5'] }], after: { cp: 0 } });
    expect(v.classification).toBe('blunder');
  });
});

describe('pickKeyMoments', () => {
  const m = (mover: 'w' | 'b', winPercentLoss: number, critical = false) => ({ mover, winPercentLoss, critical });

  it("picks each side's two biggest slips in a clean game", () => {
    const moves = [m('w', 2), m('b', 9.2), m('w', 6), m('b', 7.6), m('w', 1), m('b', 5.1), m('b', 3)];
    expect([...pickKeyMoments(moves)].sort()).toEqual([1, 2, 3]);
  });

  it('fills only the slots mistakes left open, and ignores tiny slips', () => {
    const moves = [m('w', 40, true), m('w', 8), m('w', 6), m('b', 25, true), m('b', 30, true), m('b', 9), m('w', 4)];
    expect([...pickKeyMoments(moves)]).toEqual([1]);
  });
});

describe('positions', () => {
  it('keys positions without move counters', () => {
    expect(positionKey('8/8/8/8/8/8/8/K6k w - - 12 40')).toBe('8/8/8/8/8/8/8/K6k w - -');
  });

  it('scores terminal positions for the right side', () => {
    const whiteMates = parseGame(OPERA_GAME_PGN).plies.at(-1)!.fenAfter;
    expect(terminalState(whiteMates)).toBe('checkmate');
    expect(winPercentFor(terminalScore(whiteMates, 'checkmate'), 'w')).toBe(100);
    expect(terminalState('8/8/8/8/8/8/8/K6k w - - 0 1')).toBe('insufficient');
    expect(terminalState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBeNull();
  });

  it('plays a UCI line and stops at illegal moves', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(playUciLine(start, ['e2e4', 'e7e5', 'e1e3']).map((m) => m.san)).toEqual(['e4', 'e5']);
  });
});
