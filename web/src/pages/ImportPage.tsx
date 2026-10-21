import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ImportPanel } from '../components/ImportPanel';

export function ImportPage() {
  const games = useQuery(api.games.list);

  return (
    <main className="app">
      <ImportPanel onCreated={(id) => (window.location.hash = `#/game/${id}`)} />
      {games && games.length > 0 && (
        <section className="recent">
          <h2>Recent games</h2>
          <ul>
            {games.map((g) => (
              <li key={g._id}>
                <a href={`#/game/${g._id}`}>
                  {g.white} vs {g.black}
                </a>{' '}
                <span className="muted">
                  {g.result}
                  {g.status !== 'ready' && ` · ${g.status}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
