import { useEffect, useState } from 'react';
import type { Id } from '../convex/_generated/dataModel';
import { GameView } from './pages/GameView';
import { HomePage } from './pages/HomePage';
import { Settings } from './pages/Settings';

/**
 * Hash routes: `#/` is the landing page (signed out) or your games (signed in), `#/game/<id>`
 * explores one of yours, `#/game/<id>/s/<token>` opens a shared game read-only, `#/settings`
 * holds the API key and chess site usernames.
 */
export function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const [, gameId, share] = hash.match(/^#\/game\/(\w+)(?:\/s\/(\w+))?/) ?? [];
  if (hash.startsWith('#/settings')) return <Settings />;
  return gameId ? <GameView key={gameId} gameId={gameId as Id<'games'>} share={share} /> : <HomePage />;
}
