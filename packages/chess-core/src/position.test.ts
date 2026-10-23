import { describe, expect, it } from 'vitest';
import { playSanLine } from './position';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('playSanLine', () => {
  it('plays a legal line and returns each position', () => {
    const line = playSanLine(START_FEN, ['e4', 'e5', 'Nf3']);
    expect(line.illegal).toBeUndefined();
    expect(line.moves.map((m) => m.uci)).toEqual(['e2e4', 'e7e5', 'g1f3']);
    expect(line.moves.at(-1)!.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
  });

  it('normalizes SAN written loosely', () => {
    expect(playSanLine(START_FEN, [' Nf3 ']).moves[0]!.san).toBe('Nf3');
  });

  it('stops at the first illegal move and says whose move it was', () => {
    const line = playSanLine(START_FEN, ['e4', 'e4', 'Nf3']);
    expect(line.moves).toHaveLength(1);
    expect(line.illegal).toEqual({ index: 1, move: 'e4', reason: 'not legal for Black here' });
  });

  it('handles promotion', () => {
    const line = playSanLine('8/P7/8/8/8/8/8/k6K w - - 0 1', ['a8=Q']);
    expect(line.moves[0]).toMatchObject({ san: 'a8=Q+', uci: 'a7a8q' });
  });

  it('refuses moves once the game is over', () => {
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    expect(playSanLine(mated, ['e3']).illegal?.reason).toBe('the game is already over');
  });
});
