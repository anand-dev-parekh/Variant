import { useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Site } from '../../convex/lib/chessSites';
import { DeleteGame } from '../components/DeleteGame';
import { ImportDialog, type ImportTab } from '../components/ImportDialog';
import { MiniBoard } from '../components/MiniBoard';
import { SiteHeader } from '../components/SiteHeader';
import { siteName, useNewGameCount, useRecentGames } from '../components/SiteImport';
import { Sparkline } from '../components/Sparkline';
import { TreeSketch } from '../components/TreeSketch';
import {
  KIND_LABEL,
  bestLabel,
  momentKind,
  outcomeFor,
  plyLabel,
  sketchOf,
  topMoments,
  type ListedGame,
  type Outcome,
} from '../lib/gameSummary';

const OUTCOME_LABEL: Record<Outcome, string> = { won: 'Won', lost: 'Lost', drawn: 'Drawn' };
const FILTERS = ['all', 'won', 'lost', 'drawn'] as const;
type Filter = (typeof FILTERS)[number];

/** The signed-in home: the latest game up top (turning points and tree), your totals, then every game. */
export function Home() {
  const games = useQuery(api.games.list);
  const profile = useQuery(api.profiles.mine);
  const usernames: Partial<Record<Site, string>> = { lichess: profile?.lichess ?? undefined, chesscom: profile?.chesscom ?? undefined };
  const recent = { lichess: useRecentGames('lichess', usernames.lichess), chesscom: useRecentGames('chesscom', usernames.chesscom) };
  const newCounts = { lichess: useNewGameCount('lichess', recent.lichess), chesscom: useNewGameCount('chesscom', recent.chesscom) };
  const totalNew = newCounts.lichess + newCounts.chesscom;
  const [tab, setTab] = useState<ImportTab | null>(null);

  // Open on the site with new games, else a connected one, else Lichess.
  const openImport = () =>
    setTab(newCounts.lichess ? 'lichess' : newCounts.chesscom ? 'chesscom' : usernames.chesscom && !usernames.lichess ? 'chesscom' : 'lichess');

  return (
    <div className="v2">
      <SiteHeader>
        <button className="import-button" onClick={openImport}>
          Import game
          {totalNew > 0 && <span className="count-badge">{totalNew} new</span>}
        </button>
      </SiteHeader>
      <main className="v2-main">
        {games === undefined ? (
          <p className="muted v2-loading">Loading your games…</p>
        ) : games.length === 0 ? (
          <FirstGame onImport={setTab} />
        ) : (
          <>
            <LatestGame game={games[0]!} />
            <Totals games={games} />
            <GameList games={games} />
          </>
        )}
      </main>
      <ImportDialog tab={tab} onTab={setTab} onClose={() => setTab(null)} usernames={usernames} recent={recent} newCounts={newCounts} />
    </div>
  );
}

const sourceName = (g: ListedGame) => (g.origin ? siteName(g.origin.site) : 'PGN');
const sideName = (side: 'w' | 'b') => (side === 'w' ? 'White' : 'Black');
const opponentOf = (g: ListedGame) => (g.yourSide === 'w' ? g.black : g.white);

/** The game's date: the PGN's Date header when it has a full one, else when it was imported. */
function dateOf(g: ListedGame): string {
  const m = g.date?.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(g._creationTime);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Headline({ game }: { game: ListedGame }) {
  const outcome = outcomeFor(game.result, game.yourSide);
  const moves = game.summary && Math.ceil(game.summary.san.length / 2);
  const inMoves = moves ? `, in ${moves} moves.` : '.';
  if (outcome && game.yourSide) {
    const verb = outcome === 'won' ? 'You beat' : outcome === 'lost' ? 'You lost to' : 'You drew with';
    return (
      <h1>
        {verb} {opponentOf(game)} <span className="quiet">as {sideName(game.yourSide)}{inMoves}</span>
      </h1>
    );
  }
  const result = game.result === '1-0' ? 'White won' : game.result === '0-1' ? 'Black won' : game.result === '1/2-1/2' ? 'Drawn' : null;
  return (
    <h1>
      {game.white} vs {game.black}{' '}
      {result && (
        <span className="quiet">
          {result}
          {inMoves}
        </span>
      )}
    </h1>
  );
}

function LatestGame({ game }: { game: ListedGame }) {
  const summary = game.summary;
  const moments = summary ? topMoments(summary) : [];
  const outcome = outcomeFor(game.result, game.yourSide);
  const who = (ply: number) => {
    const mover = ply % 2 ? 'w' : 'b';
    if (game.yourSide) return mover === game.yourSide ? 'You' : 'Opponent';
    return mover === 'w' ? game.white : game.black;
  };

  return (
    <article className="lead">
      <div className="lead-text">
        <p className="eyebrow-mono">
          <span className={`outcome-dot ${outcome ?? ''}`} />
          Latest game · {sourceName(game)} · {dateOf(game)}
        </p>
        <Headline game={game} />
        {game.status === 'analyzing' && <p className="lead-note">Stockfish is still analyzing this game. Its turning points appear when it's done.</p>}
        {game.status === 'failed' && <p className="lead-note">The analysis didn't finish. Open the game to see what's there.</p>}
        {summary && moments.length === 0 && <p className="lead-note">No turning points: neither side made a real mistake.</p>}
        {moments.length > 0 && (
          <div className="moments" aria-label="Turning points">
            {moments.map((m) => {
              const kind = momentKind(m.classification);
              const best = bestLabel(m);
              return (
                <div key={m.ply} className="moment-row">
                  <span className={`moment-dot ${kind}`} />
                  <span className="moment-move">{plyLabel(m.ply, summary!.san[m.ply - 1]!)}</span>
                  <span className="moment-verdict">{KIND_LABEL[kind]}</span>
                  <span className="moment-note">
                    {who(m.ply)}
                    {best && ` · best was ${best}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="lead-stats">
          <Stat value={summary ? Math.ceil(summary.san.length / 2) : '—'} label="moves" />
          <Stat value={summary ? summary.moments.length : '—'} label="turning points" />
          <Stat value={game.chats} label={game.chats === 1 ? 'chat' : 'chats'} />
          <Stat value={game.whatIfs} label={game.whatIfs === 1 ? 'what-if' : 'what-ifs'} />
        </div>
        <div className="lead-actions">
          <a className="button primary" href={`#/game/${game._id}`}>
            Open the game
          </a>
        </div>
      </div>

      <figure className="lead-figure">
        <div className="lead-card">
          <div className="lead-card-head">
            <span>The game as a tree</span>
            {summary && <span className="muted mono">{moments.length} turning points</span>}
          </div>
          {summary ? (
            <>
              <TreeSketch stops={sketchOf(summary)} flipped={game.yourSide === 'b'} />
              <Sparkline evals={summary.evals} className="lead-graph" label="Evaluation over the game" />
              <div className="lead-card-foot">
                <span>Evaluation</span>
                <span>+ is good for White</span>
              </div>
            </>
          ) : (
            <p className="muted lead-card-empty">The tree appears when the analysis finishes.</p>
          )}
        </div>
      </figure>
    </article>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** Totals across the games: record and blunders count only games where we know your side. */
function Totals({ games }: { games: ListedGame[] }) {
  const outcomes = games.map((g) => outcomeFor(g.result, g.yourSide));
  const count = (o: Outcome) => outcomes.filter((x) => x === o).length;
  const known = outcomes.some(Boolean);
  const yours = games.filter((g) => g.yourSide && g.summary);
  const blunders = yours.reduce(
    (n, g) => n + g.summary!.moments.filter((m) => m.classification === 'blunder' && (m.ply % 2 ? 'w' : 'b') === g.yourSide).length,
    0,
  );
  const sum = (key: 'chats' | 'whatIfs') => games.reduce((n, g) => n + g[key], 0);
  return (
    <section className="totals" aria-label="Your totals">
      <Total value={games.length} label={games.length === 1 ? 'Game analyzed' : 'Games analyzed'} />
      <Total value={known ? `${count('won')}–${count('lost')}–${count('drawn')}` : '—'} label="Won, lost, drawn" />
      <Total value={yours.length ? (blunders / yours.length).toFixed(1) : '—'} label="Your blunders a game" />
      <Total value={sum('whatIfs')} label="What-ifs explored" />
    </section>
  );
}

function Total({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="total">
      <span className="total-value">{value}</span>
      <span className="total-label">{label}</span>
    </div>
  );
}

function GameList({ games }: { games: ListedGame[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const showFilter = games.some((g) => outcomeFor(g.result, g.yourSide));
  const shown = filter === 'all' ? games : games.filter((g) => outcomeFor(g.result, g.yourSide) === filter);
  return (
    <section className="games" aria-label="Your games">
      <div className="games-head">
        <h2>
          Your games <span className="quiet">· {games.length === 1 ? 'one so far' : `${games.length} so far`}</span>
        </h2>
        {showFilter && (
          <div className="segmented" role="group" aria-label="Filter games">
            {FILTERS.map((f) => (
              <button key={f} className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : OUTCOME_LABEL[f]}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="game-rows">
        {shown.map((g) => (
          <GameRow key={g._id} game={g} />
        ))}
        {shown.length === 0 && <li className="game-rows-empty muted">No {filter} games yet.</li>}
      </ul>
    </section>
  );
}

function GameRow({ game: g }: { game: ListedGame }) {
  const outcome = outcomeFor(g.result, g.yourSide);
  const top = g.summary && topMoments(g.summary, 1)[0];
  const status = g.status === 'analyzing' ? 'Analyzing' : g.status === 'failed' ? 'Failed' : null;
  return (
    <li className="game-row">
      <a className="game-row-link" href={`#/game/${g._id}`}>
        {g.summary ? <MiniBoard fen={g.summary.fen} size={60} flipped={g.yourSide === 'b'} /> : <span className="mini-board-placeholder" />}
        <span className="game-row-text">
          <span className="game-row-title">{g.yourSide ? `vs ${opponentOf(g)}` : `${g.white} vs ${g.black}`}</span>
          <span className="game-row-meta">
            {sourceName(g)} · {dateOf(g)}
            {top && (
              <>
                {' · '}
                <span className="mono">{plyLabel(top.ply, g.summary!.san[top.ply - 1]!)}</span>
              </>
            )}
          </span>
        </span>
        {g.summary && <Sparkline evals={g.summary.evals} className="game-row-graph" label="Evaluation over the game" />}
        <span className={`outcome-pill ${status ? 'status' : (outcome ?? 'unknown')}`}>{status ?? (outcome ? OUTCOME_LABEL[outcome] : g.result)}</span>
      </a>
      <div className="game-row-delete">
        <DeleteGame gameId={g._id} compact />
      </div>
    </li>
  );
}

/** No games yet: the three ways in. */
function FirstGame({ onImport }: { onImport: (tab: ImportTab) => void }) {
  const ways: { tab: ImportTab; title: string; body: string }[] = [
    { tab: 'lichess', title: 'Lichess', body: 'Connect your username and pick one of your recent games.' },
    { tab: 'chesscom', title: 'Chess.com', body: 'Connect your username and pick one of your recent games.' },
    { tab: 'pgn', title: 'Paste a PGN', body: 'Any game from anywhere: a tournament, a book, a friend.' },
  ];
  return (
    <section className="first-game">
      <p className="eyebrow-mono">Welcome</p>
      <h1>
        Import your first game. <span className="quiet">Variant turns it into a tree you can explore.</span>
      </h1>
      <div className="first-game-ways">
        {ways.map((w) => (
          <button key={w.tab} className="way" onClick={() => onImport(w.tab)}>
            <span className="way-title">{w.title}</span>
            <span className="way-body">{w.body}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
