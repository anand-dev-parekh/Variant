import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import { internal } from './_generated/api';
import { action } from './_generated/server';
import { USER_AGENT, parseChessComArchive, parseLichessGames, type SiteGame } from './lib/chessSites';
import { vSite } from './schema';

/** How many recent games are listed for import. */
const RECENT = 20;

/** Chess.com monthly archives read at most, newest first, to find `RECENT` games. */
const MAX_ARCHIVES = 3;

const SITE_NAME = { lichess: 'Lichess', chesscom: 'Chess.com' } as const;

/** The signed-in user's most recent finished games on a connected site, newest first. */
export const recent = action({
  args: { site: vSite },
  handler: async (ctx, { site }): Promise<SiteGame[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Sign in first.');
    const username = await ctx.runQuery(internal.profiles.usernameFor, { userId, site });
    if (!username) throw new ConvexError(`Connect your ${SITE_NAME[site]} username first.`);
    return site === 'lichess' ? lichessGames(username) : chessComGames(username);
  },
});

async function lichessGames(username: string): Promise<SiteGame[]> {
  const res = await get(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${RECENT}&pgnInJson=true&moves=true`,
    'application/x-ndjson',
    'lichess',
    username,
  );
  return parseLichessGames(await res.text());
}

async function chessComGames(username: string): Promise<SiteGame[]> {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`;
  const { archives = [] } = (await (await get(`${base}/games/archives`, 'application/json', 'chesscom', username)).json()) as {
    archives?: string[];
  };
  const games: SiteGame[] = [];
  for (const url of archives.slice(-MAX_ARCHIVES).reverse()) {
    games.push(...parseChessComArchive(await (await get(url, 'application/json', 'chesscom', username)).json()));
    if (games.length >= RECENT) break;
  }
  return games.slice(0, RECENT);
}

async function get(url: string, accept: string, site: 'lichess' | 'chesscom', username: string) {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: accept, 'User-Agent': USER_AGENT } });
  } catch {
    throw new ConvexError(`Couldn't reach ${SITE_NAME[site]}. Try again in a moment.`);
  }
  if (res.status === 404) throw new ConvexError(`There's no ${SITE_NAME[site]} player called ${username}.`);
  if (res.status === 429) throw new ConvexError(`${SITE_NAME[site]} is rate-limiting requests. Try again in a minute.`);
  if (!res.ok) throw new ConvexError(`${SITE_NAME[site]} didn't answer (HTTP ${res.status}). Try again later.`);
  return res;
}
