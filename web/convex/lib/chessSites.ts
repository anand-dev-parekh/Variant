/**
 * Reading recent games from Lichess and Chess.com public APIs (docs/accounts.md). Pure parsing
 * here; the fetching is in `imports.ts`.
 */

export type Site = 'lichess' | 'chesscom';

/** One finished standard game, as listed for import. */
export type SiteGame = {
  site: Site;
  /** The site's id for the game, used to avoid importing it twice. */
  id: string;
  url: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  result: string;
  /** Milliseconds since the epoch. */
  playedAt: number;
  /** bullet, blitz, rapid, … */
  speed: string;
  pgn: string;
};

/** Usernames on both sites are letters, digits, `_` and `-`. */
export const USERNAME = /^[A-Za-z0-9_-]{2,30}$/;

/** Sites ask API clients to identify themselves. */
export const USER_AGENT = 'Variant chess explorer';

type LichessPlayer = { user?: { name: string }; aiLevel?: number; rating?: number };
type LichessGame = {
  id: string;
  variant: string;
  speed: string;
  status: string;
  createdAt: number;
  winner?: 'white' | 'black';
  players: { white: LichessPlayer; black: LichessPlayer };
  pgn?: string;
};

/** Games from Lichess's ndjson export (`/api/games/user/{name}?pgnInJson=true`). */
export function parseLichessGames(ndjson: string): SiteGame[] {
  const out: SiteGame[] = [];
  for (const line of ndjson.split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line) as LichessGame;
    // Only finished standard games: variants and games in progress can't be analyzed.
    if (g.variant !== 'standard' || !g.pgn || g.status === 'started' || g.status === 'created') continue;
    const name = (p: LichessPlayer) => p.user?.name ?? (p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous');
    out.push({
      site: 'lichess',
      id: g.id,
      url: `https://lichess.org/${g.id}`,
      white: name(g.players.white),
      black: name(g.players.black),
      ...(g.players.white.rating && { whiteRating: g.players.white.rating }),
      ...(g.players.black.rating && { blackRating: g.players.black.rating }),
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
      playedAt: g.createdAt,
      speed: g.speed,
      pgn: g.pgn,
    });
  }
  return out;
}

type ChessComPlayer = { username: string; rating?: number };
type ChessComGame = {
  url: string;
  uuid?: string;
  pgn?: string;
  rules: string;
  time_class: string;
  end_time: number;
  white: ChessComPlayer;
  black: ChessComPlayer;
};

/** Games from one Chess.com monthly archive (`/pub/player/{name}/games/{yyyy}/{mm}`), newest first. */
export function parseChessComArchive(json: { games?: ChessComGame[] }): SiteGame[] {
  const out: SiteGame[] = [];
  for (const g of json.games ?? []) {
    if (g.rules !== 'chess' || !g.pgn) continue;
    out.push({
      site: 'chesscom',
      id: g.uuid ?? g.url.split('/').at(-1)!,
      url: g.url,
      white: g.white.username,
      black: g.black.username,
      ...(g.white.rating && { whiteRating: g.white.rating }),
      ...(g.black.rating && { blackRating: g.black.rating }),
      result: (g.pgn.match(/\[Result "([^"]+)"\]/)?.[1] ?? '*').replace('1/2-1/2', '½-½'),
      playedAt: g.end_time * 1000,
      speed: g.time_class,
      pgn: g.pgn,
    });
  }
  return out.reverse();
}
