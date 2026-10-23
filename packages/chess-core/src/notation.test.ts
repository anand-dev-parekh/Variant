import { describe, expect, it } from 'vitest';
import { findMoveRuns } from './notation';

const runs = (text: string) => findMoveRuns(text).map(({ number, side, san, start, end }) => ({ number, side, san, text: text.slice(start, end) }));

describe('findMoveRuns', () => {
  it('finds a line with numbers for both sides', () => {
    expect(runs('After 12…Nh7 13. Qxd8 Rxd8 14. Nb5, White wins c7.')).toEqual([
      { number: 12, side: 'b', san: ['Nh7', 'Qxd8', 'Rxd8', 'Nb5'], text: '12…Nh7 13. Qxd8 Rxd8 14. Nb5' },
    ]);
  });

  it('accepts three dots, black move numbers inside a line, castling, promotion and checks', () => {
    expect(runs('15...O-O 16. e8=Q+ 16...Rxe8 17. Qh5#')).toEqual([
      { number: 15, side: 'b', san: ['O-O', 'e8=Q+', 'Rxe8', 'Qh5#'], text: '15...O-O 16. e8=Q+ 16...Rxe8 17. Qh5#' },
    ]);
  });

  it('finds separate runs and strips annotation glyphs', () => {
    expect(runs('12. dxe5! is strong; 12. Nxe5?! lets Black off the hook.')).toEqual([
      { number: 12, side: 'w', san: ['dxe5'], text: '12. dxe5!' },
      { number: 12, side: 'w', san: ['Nxe5'], text: '12. Nxe5?!' },
    ]);
  });

  it('stops at a move number that does not fit the sequence', () => {
    expect(runs('9. Qb3 Na5 11. Qa4')).toEqual([
      { number: 9, side: 'w', san: ['Qb3', 'Na5'], text: '9. Qb3 Na5' },
      { number: 11, side: 'w', san: ['Qa4'], text: '11. Qa4' },
    ]);
  });

  it('ignores numbers that are not move numbers and moves without a number', () => {
    expect(runs('+0.90 after Nh7; a 1.5 pawn edge; the e5 pawn; step 3. then')).toEqual([]);
  });
});
