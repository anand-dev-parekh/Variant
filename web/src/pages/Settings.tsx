import { AuthLoading, Authenticated, Unauthenticated, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Site } from '../../convex/lib/chessSites';
import { SignInButtons } from '../components/Account';
import { ApiKeySetting } from '../components/ApiKey';
import { SiteHeader } from '../components/SiteHeader';
import { ConnectForm, SITES } from '../components/SiteImport';

/** `#/settings`: the coach's API key and the chess site usernames to import from. */
export function Settings() {
  return (
    <div className="v2">
      <SiteHeader />
      <main className="v2-main settings">
        <h1>Settings</h1>
        <AuthLoading>{null}</AuthLoading>
        <Unauthenticated>
          <p className="muted">Sign in to change your settings.</p>
          <SignInButtons />
        </Unauthenticated>
        <Authenticated>
          <section className="settings-section">
            <h2>Coach API key</h2>
            <p className="muted settings-note">
              Why a key, and how it's kept: <a href="#/help">How it works</a>.
            </p>
            <ApiKeySetting />
          </section>
          <section className="settings-section">
            <h2>Chess sites</h2>
            <p className="muted settings-note">Import your recent games by username. Clear a name and save to disconnect it.</p>
            <SiteUsernames />
          </section>
        </Authenticated>
      </main>
    </div>
  );
}

function SiteUsernames() {
  const profile = useQuery(api.profiles.mine);
  if (profile === undefined) return null;
  return (
    <>
      {SITES.map(({ site }) => (
        <SiteUsername key={site} site={site} current={profile?.[site] ?? undefined} />
      ))}
    </>
  );
}

/** One site's username, shown with Change, or the connect form. */
function SiteUsername({ site, current }: { site: Site; current?: string }) {
  const [editing, setEditing] = useState(false);
  const name = SITES.find((s) => s.site === site)!.name;
  if (!current || editing) return <ConnectForm key={current} site={site} current={current} onDone={current ? () => setEditing(false) : undefined} />;
  return (
    <p className="settings-row">
      {name}: <strong>{current}</strong> ·{' '}
      <button className="link" onClick={() => setEditing(true)}>
        Change
      </button>
    </p>
  );
}
