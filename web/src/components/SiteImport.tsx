import { useAction, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { Site, SiteGame } from '../../convex/lib/chessSites';

const SITES: { site: Site; name: string }[] = [
  { site: 'lichess', name: 'Lichess' },
  { site: 'chesscom', name: 'Chess.com' },
];
const TAB_KEY = 'variant.importSite';

const errorText = (err: unknown) => (err instanceof ConvexError ? String(err.data) : 'Something went wrong. Try again.');

/**
 * Import from a chess site: connect your username once, then pick from your recent games.
 * Games already imported open instead of being analyzed again.
 */
export function SiteImport() {
  const profile = useQuery(api.profiles.mine);
  const [site, setSite] = useState<Site>(() => {
    try {
      return localStorage.getItem(TAB_KEY) === 'chesscom' ? 'chesscom' : 'lichess';
    } catch {
      return 'lichess';
    }
  });
  const choose = (next: Site) => {
    setSite(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Not remembered; fine.
    }
  };
  if (profile === undefined || profile === null) return null;
  const username = profile[site];

  return (
    <div className="site-import">
      <div className="site-tabs" role="tablist">
        {SITES.map((s) => (
          <button
            key={s.site}
            role="tab"
            aria-selected={site === s.site}
            className={site === s.site ? 'active' : ''}
            onClick={() => choose(s.site)}
          >
            {s.name}
            {profile[s.site] && <span className="muted"> · {profile[s.site]}</span>}
          </button>
        ))}
      </div>
      {username ? (
        <RecentGames key={`${site}:${username}`} site={site} username={username} />
      ) : (
        <ConnectForm key={site} site={site} />
      )}
    </div>
  );
}

function ConnectForm({ site, current, onDone }: { site: Site; current?: string; onDone?: () => void }) {
  const setUsername = useMutation(api.profiles.setUsername);
  const [name, setName] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const siteName = SITES.find((s) => s.site === site)!.name;
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
        Your {siteName} username
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

function RecentGames({ site, username }: { site: Site; username: string }) {
  const recent = useAction(api.imports.recent);
  const imported = useQuery(api.games.importedFrom, { site }) ?? {};
  const create = useMutation(api.games.create);
  const [games, setGames] = useState<SiteGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setGames(null);
    recent({ site })
      .then(setGames)
      .catch((err) => setError(errorText(err)));
  };
  // `RecentGames` is keyed by site and username, so this runs once per account shown.
  useEffect(load, []);

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
  return (
    <div className="site-recent">
      <div className="site-recent-head">
        <span className="muted">Recent games of {username}</span>
        <button className="link" onClick={load}>
          Refresh
        </button>
        <button className="link" onClick={() => setEditing(true)}>
          Change username
        </button>
      </div>
      {error && <p className="import-error">{error}</p>}
      {!games && !error && <p className="muted">Loading games…</p>}
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
