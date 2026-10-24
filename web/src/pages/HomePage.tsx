import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react';
import { Home } from './Home';
import { Landing } from './Landing';

/** `#/`: the landing page when signed out, your home when signed in. */
export function HomePage() {
  return (
    <>
      <AuthLoading>
        <div className="v2" />
      </AuthLoading>
      <Unauthenticated>
        <Landing />
      </Unauthenticated>
      <Authenticated>
        <Home />
      </Authenticated>
    </>
  );
}
