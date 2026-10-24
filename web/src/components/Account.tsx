import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';

/** "Continue with Google / GitHub". OAuth returns to the page the button was on. */
export function SignInButtons() {
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState<string | null>(null);
  const go = (provider: 'google' | 'github') => {
    setBusy(provider);
    void signIn(provider, { redirectTo: window.location.href }).catch(() => setBusy(null));
  };
  return (
    <div className="sign-in">
      <button className="primary" disabled={busy !== null} onClick={() => go('google')}>
        {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
      </button>
      <button className="ghost" disabled={busy !== null} onClick={() => go('github')}>
        {busy === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}
      </button>
    </div>
  );
}

/** The header's account corner: who's signed in, with sign out. Nothing while signed out. */
export function UserMenu() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
  const { signOut } = useAuthActions();
  if (!isAuthenticated || !me) return null;
  return (
    <div className="user-menu">
      {me.image ? (
        <img className="avatar" src={me.image} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="avatar" aria-hidden>
          {me.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="user-name">{me.name}</span>
      <button className="link" onClick={() => void signOut().then(() => (window.location.hash = '#/'))}>
        Sign out
      </button>
    </div>
  );
}
