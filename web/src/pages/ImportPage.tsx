import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ImportPanel } from '../components/ImportPanel';
import { TopBar } from '../components/TopBar';
import { TreePreview } from '../components/TreePreview';

const STEPS = [
  {
    title: 'Import',
    body: 'Paste a PGN from Chess.com, Lichess, or anywhere else. The whole game becomes a tree of positions.',
  },
  {
    title: 'Find the turning points',
    body: 'Stockfish checks every move. Mistakes are marked, and the tree branches only where the game was decided.',
  },
  {
    title: 'Explore what-ifs',
    body: "Step into the engine's alternatives, or try your own moves and see where they lead.",
  },
];

export function ImportPage() {
  const games = useQuery(api.games.list);

  return (
    <>
      <TopBar narrow>
        <a className="link" href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noreferrer">
          Powered by Stockfish 19
        </a>
      </TopBar>
      <main className="frame">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Chess Explorer</p>
            <h1>
              <span className="muted-serif">Every game is a tree.</span>
              <br />
              Explore the branches you didn't play.
            </h1>
            <p className="lede">
              Import a finished game. Variant finds the moments that decided it and lets you walk every line that could
              have happened instead.
            </p>
            <ImportPanel onCreated={(id) => (window.location.hash = `#/game/${id}`)} />
          </div>
          <TreePreview />
        </section>

        {games && games.length > 0 && (
          <section className="band">
            <h2 className="band-title">
              Recent <span className="muted-serif">games</span>
            </h2>
            <ul className="game-grid">
              {games.map((g) => (
                <li key={g._id}>
                  <a className="game-card" href={`#/game/${g._id}`}>
                    <span className="game-card-players">
                      <strong>{g.white}</strong>
                      <span className="muted">vs</span>
                      <strong>{g.black}</strong>
                    </span>
                    <span className="game-card-meta">
                      <span className="result">{g.result}</span>
                      {[g.event, g.date?.replaceAll('.', '-')].filter(Boolean).join(' · ')}
                      {g.status !== 'ready' && <span className={`status ${g.status}`}>{g.status}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="band">
          <h2 className="band-title">
            How it <span className="muted-serif">works</span>
          </h2>
          <ol className="steps">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="step-number">0{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <footer className="footer muted">Stockfish decides what's true. Variant helps you see it.</footer>
      </main>
    </>
  );
}
