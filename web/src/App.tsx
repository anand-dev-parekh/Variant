import { useEffect, useState } from 'react';
import type { Id } from '../convex/_generated/dataModel';
import { GameView } from './pages/GameView';
import { ImportPage } from './pages/ImportPage';

/** Hash routes: `#/` imports a game, `#/game/<id>` explores one. */
export function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const gameId = hash.match(/^#\/game\/(\w+)/)?.[1];
  return gameId ? <GameView key={gameId} gameId={gameId as Id<'games'>} /> : <ImportPage />;
}
