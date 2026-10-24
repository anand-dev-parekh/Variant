# Accounts, sharing and imports

People sign in with Google or GitHub; every game belongs to the user who imported it. An owner
can share a game read-only by link, and can import recent games from their Lichess or Chess.com
account.

## Sign-in (Convex Auth)

[Convex Auth](https://labs.convex.dev/auth) (`@convex-dev/auth`, with `@auth/core` providers) runs
inside our Convex deployment: no separate auth service.

- `web/convex/auth.ts`: `convexAuth({ providers: [GitHub, Google] })`.
- `web/convex/http.ts`: the OAuth callback and token routes (`auth.addHttpRoutes`).
- `web/convex/auth.config.ts`: the deployment trusts tokens it issued itself
  (`CONVEX_SITE_URL`, application id `convex`).
- `schema.ts` includes `authTables`: `users`, `authSessions`, `authAccounts`,
  `authRefreshTokens`, and a few more the library manages.
- Browser: `ConvexAuthProvider` in `web/src/main.tsx`; `SignInButtons` and `UserMenu` in
  `web/src/components/Account.tsx` (`useAuthActions().signIn('google' | 'github')`). The session
  is kept in `localStorage` and refreshed by the library.

### Setting it up on a deployment

| Variable | What it is |
| --- | --- |
| `SITE_URL` | Where OAuth sends people back: `http://localhost:5173` in dev |
| `JWT_PRIVATE_KEY`, `JWKS` | The key pair the deployment signs session tokens with. Generate a fresh RS256 pair per deployment (`npx @convex-dev/auth` does it, or any RSA tool); rotating it signs everyone out |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | A GitHub OAuth app |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | A Google OAuth client |

All are declared in `web/convex/convex.config.ts` and set with `npx convex env set` (from
`web/`). The OAuth apps' callback URLs are the deployment's **site** URL (`.convex.site`, not
`.convex.cloud`):

- **GitHub:** github.com → Settings → Developer settings → OAuth Apps → New OAuth App.
  Homepage `http://localhost:5173`, callback
  `https://<deployment>.convex.site/api/auth/callback/github`. Copy the client id, generate a
  secret.
- **Google:** console.cloud.google.com → APIs & Services → Credentials → Create credentials →
  OAuth client ID (Web application; set up the consent screen first if asked). Authorized
  JavaScript origin `http://localhost:5173`, redirect URI
  `https://<deployment>.convex.site/api/auth/callback/google`.

Games imported before accounts existed have no owner, so nobody can see them. After signing in
once, give them to yourself: `npx convex run games:claimUnowned '{"email": "you@example.com"}'`.

## Who can do what

`web/convex/lib/access.ts` holds the rules. The caller's identity always comes from the auth token
(`getAuthUserId`), never from an argument.

| | Owner | Visitor with the share link | Anyone else |
| --- | --- | --- | --- |
| See the game, tree, what-ifs, evals | yes | yes | no (`games.tree` returns null) |
| Read the coach chats | yes | yes | no |
| Preview chat lines on the board | yes | yes | no |
| Ask the coach, add or remove what-ifs | yes | no | no |
| Turn sharing on or off | yes | no | no |

- `readableGame(ctx, gameId, share?)` returns the game and the caller's role (`owner` or
  `viewer`), or null. `ownedGame` throws unless the caller owns the game.
- Every public query that reads a game (`games.tree`, `chat.threadFor`, `chat.earlierThreads`,
  `chat.messages`) takes an optional `share` token and checks `readableGame`. `chat.messages`
  finds the game through the thread row (`threads.by_threadId`).
- Every public mutation that changes a game (`chat.send`, `branches.addMoves`,
  `branches.removeWhatIf`, `games.setSharing`, `games.remove`) checks `ownedGame`. Not-owned and not-found look
  the same, so ids don't reveal whether a game exists.
- Internal functions (the analysis pipeline, `chat.respond`) run without a user and don't check.
- `analyses` stays global: an engine evaluation of a position is the same for everyone, and
  sharing the cache saves engine time.

## Share links

`games.setSharing({ gameId, enabled })` sets `games.shareToken` to a random 32-character token,
or clears it. The link is `#/game/<id>/s/<token>` and works signed out. Turning sharing off and on
again makes a new token, so old links stop working. Viewers never receive the token or the PGN
from `games.tree`.

In the app (`GameView.tsx`): owners have a **Share** button in the game header (create, copy,
stop sharing). Viewers see "Shared by <name> · view only". The board can't be moved on, the
Remove buttons and Delete key are off, the question box is hidden, and line previews have no
"Add to tree".

## Importing from Lichess and Chess.com

- `profiles` holds each user's usernames (`profiles.setUsername`, `profiles.mine`). Only public
  games are read, so no password or OAuth with the chess sites is needed.
- `imports.recent({ site })` (action) fetches the user's 20 most recent finished standard games:
  - Lichess: `GET /api/games/user/{name}?max=20&pgnInJson=true` as ndjson.
  - Chess.com: `GET /pub/player/{name}/games/archives`, then the newest monthly archives (up to
    3) until there are 20 games.
  - Both send a `User-Agent` (Lichess returns 404 to requests without one from some networks).
  - Parsing is in `web/convex/lib/chessSites.ts` (tested in `chessSites.test.ts`): variants and
    unfinished games are skipped.
- `games.create({ pgn, origin })` stores `origin = { site, id }`. If the user already imported
  that game, it returns the existing one instead of analyzing it again
  (`by_ownerId_and_origin`). `games.importedFrom({ site })` lets the list show **Open** for those.
- UI: `SiteImport` on the signed-in home page: a tab per site, connect a username, then the
  recent games with **Analyze** / **Open**.

## Deleting a game

`games.remove({ gameId })` (owner only) deletes the game row at once, so it leaves the list, its
share link stops working and its analysis pass stops (the pipeline treats a missing game as
done). `games.deleteTree` then deletes its chat threads (with their messages, through the agent
component's `deleteAllForThreadIdAsync`) and nodes, 500 at a time, rescheduling itself until
none are left. `analyses` are kept: they're shared by position. In the app, **Delete** is in the
game header and on each card in "Your games" (shown on hover), with a confirm step.

## Not done yet

Usage limits per user (questions and imports cost real money), and a production
deployment (it needs its own keys, `SITE_URL` and OAuth apps).
