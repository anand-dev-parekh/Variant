import { describe, expect, it } from 'vitest';
import { boardFacts } from './board';

describe('boardFacts', () => {
  it('reads pieces, material and pawn structure off a king-and-pawn ending', () => {
    // An ending from a real game, after 28. Kxc3.
    const facts = boardFacts('8/p4p1p/1pk1pp2/8/2P1P3/2K5/P1P3PP/8 b - - 0 28');
    expect(facts.pieces.w.map((p) => p.type + p.square)).toEqual(['kc3', 'pa2', 'pc2', 'pc4', 'pe4', 'pg2', 'ph2']);
    expect(facts.material).toEqual({ w: 6, b: 6 });
    expect(facts.materialBalance).toBe(0);
    expect(facts.pawns.w).toEqual({ doubled: ['c'], isolated: ['a2', 'c2', 'c4', 'e4'], passed: [], islands: 4 });
    expect(facts.pawns.b).toEqual({ doubled: ['f'], isolated: ['h7'], passed: [], islands: 3 });
  });

  it('finds passed pawns for both sides', () => {
    const facts = boardFacts('4k3/8/1P6/8/8/6p1/8/4K3 w - - 0 1');
    expect(facts.pawns.w.passed).toEqual(['b6']);
    expect(facts.pawns.b.passed).toEqual(['g3']);
  });

  it('counts material and check', () => {
    const facts = boardFacts('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(facts.inCheck).toBe(true);
    expect(facts.material).toEqual({ w: 39, b: 39 });
  });
});
