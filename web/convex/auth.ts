import GitHub from '@auth/core/providers/github';
import Google from '@auth/core/providers/google';
import { convexAuth } from '@convex-dev/auth/server';

/** Sign-in with GitHub or Google (Convex Auth). Setup: docs/accounts.md. */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub, Google],
});
