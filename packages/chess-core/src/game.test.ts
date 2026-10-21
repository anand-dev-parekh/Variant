import { describe, expect, it } from 'vitest';
import { PgnParseError, fenAtPly, formatSanLine, moveNumberLabel, parseGame } from './game';
import { OPERA_GAME_PGN } from './samples';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('parseGame', () => {
  it('parses headers and every ply', () => {
    const game = parseGame(OPERA_GAME_PGN);
    expect(game.headers).toMatchObject({ white: 'Paul Morphy', result: '1-0' });
    expect(game.startFen).toBe(START_FEN);
    expect(game.plies).toHaveLength(33);
    expect(game.plies[0]).toMatchObject({ ply: 1, san: 'e4', uci: 'e2e4', color: 'w' });
    expect(game.plies.at(-1)).toMatchObject({ ply: 33, san: 'Rd8#', color: 'w' });
  });

  it('chains positions: each ply starts where the previous ended', () => {
    const game = parseGame(OPERA_GAME_PGN);
    for (let i = 1; i < game.plies.length; i++) {
      expect(game.plies[i]!.fenBefore).toBe(game.plies[i - 1]!.fenAfter);
    }
    expect(fenAtPly(game, 0)).toBe(START_FEN);
    expect(fenAtPly(game, 33)).toBe(game.plies[32]!.fenAfter);
  });

  it('supports games that start from a custom FEN', () => {
    const pgn = `[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 *`;
    const game = parseGame(pgn);
    expect(game.startFen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    expect(game.plies.map((p) => p.san)).toEqual(['e4', 'Kd7']);
  });

  it('rejects illegal moves and empty games', () => {
    expect(() => parseGame('1. e4 e5 2. Ke3')).toThrow(PgnParseError);
    expect(() => parseGame('[White "x"]\n\n*')).toThrow(PgnParseError);
  });
});

describe('formatSanLine', () => {
  it('numbers moves from either side', () => {
    expect(formatSanLine(START_FEN, ['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
    const blackToMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(formatSanLine(blackToMove, ['e5', 'Nf3', 'Nc6'])).toBe('1… e5 2. Nf3 Nc6');
  });
});

describe('moveNumberLabel', () => {
  it('uses the fullmove number from the FEN', () => {
    const game = parseGame(OPERA_GAME_PGN);
    expect(moveNumberLabel(game.plies[0]!.fenBefore, 'w')).toBe('1.');
    expect(moveNumberLabel(game.plies[1]!.fenBefore, 'b')).toBe('1…');
  });
});
