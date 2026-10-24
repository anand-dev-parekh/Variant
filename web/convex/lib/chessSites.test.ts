import { describe, expect, it } from 'vitest';
import { USERNAME, parseChessComArchive, parseLichessGames } from './chessSites';

const PGN = '[Event "x"]\n[Result "1-0"]\n\n1. e4 e5 1-0';

describe('parseLichessGames', () => {
  const line = (fields: object) =>
    JSON.stringify({
      id: 'abc123',
      variant: 'standard',
      speed: 'blitz',
      status: 'mate',
      createdAt: 1700000000000,
      winner: 'white',
      players: { white: { user: { name: 'alice' }, rating: 1500 }, black: { aiLevel: 3 } },
      pgn: PGN,
      ...fields,
    });

  it('reads finished standard games, naming AI opponents', () => {
    expect(parseLichessGames(`${line({})}\n`)).toEqual([
      {
        site: 'lichess',
        id: 'abc123',
        url: 'https://lichess.org/abc123',
        white: 'alice',
        black: 'Stockfish level 3',
        whiteRating: 1500,
        result: '1-0',
        playedAt: 1700000000000,
        speed: 'blitz',
        pgn: PGN,
      },
    ]);
  });

  it('skips variants and games still in progress, and scores draws', () => {
    const games = parseLichessGames(
      [line({ variant: 'chess960' }), line({ status: 'started' }), line({ id: 'd', status: 'draw', winner: undefined })].join('\n'),
    );
    expect(games.map((g) => [g.id, g.result])).toEqual([['d', '½-½']]);
  });
});

describe('parseChessComArchive', () => {
  const game = (fields: object) => ({
    url: 'https://www.chess.com/game/live/1',
    uuid: 'u1',
    pgn: PGN,
    rules: 'chess',
    time_class: 'rapid',
    end_time: 1700000000,
    white: { username: 'bob', rating: 1200 },
    black: { username: 'carol', rating: 1250 },
    ...fields,
  });

  it('reads standard games newest first, with the result from the PGN', () => {
    const games = parseChessComArchive({
      games: [game({}), game({ uuid: 'u2', pgn: PGN.replace(/1-0/g, '1/2-1/2') }), game({ uuid: 'u3', rules: 'chess960' })],
    });
    expect(games.map((g) => [g.id, g.result, g.white, g.blackRating, g.playedAt])).toEqual([
      ['u2', '½-½', 'bob', 1250, 1700000000000],
      ['u1', '1-0', 'bob', 1250, 1700000000000],
    ]);
  });
});

describe('USERNAME', () => {
  it('accepts site usernames and rejects anything else', () => {
    expect(['Hikaru', 'Daniil_Kolbasenk0', 'a-b'].every((u) => USERNAME.test(u))).toBe(true);
    expect(['', 'x', 'has space', 'evil/../path', 'a'.repeat(31)].some((u) => USERNAME.test(u))).toBe(false);
  });
});
