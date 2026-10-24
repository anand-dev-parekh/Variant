import { useAction, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { Site, SiteGame } from '../../convex/lib/chessSites';

export const SITES: { site: Site; name: string }[] = [
  { site: 'lichess', name: 'Lichess' },
  { site: 'chesscom', name: 'Chess.com' },
];
export const siteName = (site: Site) => SITES.find((s) => s.site === site)!.name;

const errorText = (err: unknown) => (err instanceof ConvexError ? String(err.data) : 'Something went wrong. Try again.');

export type RecentGames = { games: SiteGame[] | null; error: string | null; reload: () => void };

/** The connected account's recent games on a site (fetched once per username), or nothing without one. */
export function useRecentGames(site: Site, username: string | undefined): RecentGames {
  const recent = useAction(api.imports.recent);
  const [games, setGames] = useState<SiteGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!username) return;
    setError(null);
    setGames(null);
    recent({ site })
      .then(setGames)
      .catch((err) => setError(errorText(err)));
  }, [recent, site, username]);
  useEffect(reload, [reload]);
  return { games, error, reload };
}

/** Recent games on a site that aren't imported yet. */
export function useNewGameCount(site: Site, recent: RecentGames): number {
  const imported = useQuery(api.games.importedFrom, { site }) ?? {};
  return recent.games?.filter((g) => !imported[g.id]).length ?? 0;
}

/** Connect (or change) the username to import from. */
export function ConnectForm({ site, current, onDone }: { site: Site; current?: string; onDone?: () => void }) {
  const setUsername = useMutation(api.profiles.setUsername);
  const [name, setName] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await setUsername({ site, username: name });
      onDone?.();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <form className="site-connect" onSubmit={(e) => void submit(e)}>
      <label>
        Your {siteName(site)} username
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="username" autoComplete="off" spellCheck={false} />
      </label>
      <button className="primary" type="submit" disabled={!name.trim() && !current}>
        {current ? 'Save' : 'Connect'}
      </button>
      {onDone && (
        <button type="button" className="ghost" onClick={onDone}>
          Cancel
        </button>
      )}
      {error && <p className="import-error">{error}</p>}
      {!current && <p className="muted site-note">Only your public games are read. No password needed.</p>}
    </form>
  );
}

/** The recent games of a connected account, each with Analyze (or Open, if already imported). */
export function RecentGameList({ site, username, recent }: { site: Site; username: string; recent: RecentGames }) {
  const imported = useQuery(api.games.importedFrom, { site }) ?? {};
  const create = useMutation(api.games.create);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const { games } = recent;

  const open = (id: Id<'games'>) => (window.location.hash = `#/game/${id}`);
  const analyze = async (g: SiteGame) => {
    setImporting(g.id);
    setError(null);
    try {
      open(await create({ pgn: g.pgn, origin: { site, id: g.id } }));
    } catch (err) {
      setError(errorText(err));
      setImporting(null);
    }
  };

  if (editing) return <ConnectForm site={site} current={username} onDone={() => setEditing(false)} />;
  const lower = username.toLowerCase();
  const shownError = error ?? recent.error;
  return (
    <div className="site-recent">
      <div className="site-recent-head">
        <span className="muted">Recent games of {username}</span>
        <button className="link" onClick={recent.reload}>
          Refresh
        </button>
        <button className="link" onClick={() => setEditing(true)}>
          Change username
        </button>
      </div>
      {shownError && <p className="import-error">{shownError}</p>}
      {!games && !shownError && <p className="muted">Loading games…</p>}
      {games?.length === 0 && <p className="muted">No finished standard games yet.</p>}
      {games && games.length > 0 && (
        <ul className="site-games">
          {games.map((g) => {
            const already = imported[g.id];
            // The opponent's name stands out; the user's own is plain.
            const player = (name: string) => (name.toLowerCase() === lower ? name : <strong>{name}</strong>);
            return (
              <li key={g.id}>
                <span className="site-game-players">
                  {player(g.white)}
                  {g.whiteRating && <span className="muted"> ({g.whiteRating})</span>}
                  <span className="muted"> vs </span>
                  {player(g.black)}
                  {g.blackRating && <span className="muted"> ({g.blackRating})</span>}
                </span>
                <span className="site-game-meta muted">
                  <span className="result">{g.result}</span> {g.speed} ·{' '}
                  {new Date(g.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                {already ? (
                  <button className="ghost" onClick={() => open(already)}>
                    Open
                  </button>
                ) : (
                  <button className="primary" disabled={importing !== null} onClick={() => void analyze(g)}>
                    {importing === g.id ? 'Importing…' : 'Analyze'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
