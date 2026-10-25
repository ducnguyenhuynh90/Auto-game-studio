# Supabase: player accounts and cloud saves

Supabase stores who each player is and their progress, for the web build (GitHub Pages) and the iOS /
Android apps. The claude.ai playtest page keeps using claude.ai storage (it can't reach outside services).

## How it works for players
- **Backed up from the first launch.** The game silently creates an anonymous account, so progress is
  safe before anyone signs up.
- **Link a login later.** Settings shows "Guest · backed up to the cloud" with *Continue with Google /
  Apple / Facebook*. Linking keeps the same account, so the village follows the player to any device.
- **Two saves?** If a player already has a cloud save on that login, the newer journey wins, or the game
  asks which village to keep.
- **Offline is fine.** If Supabase can't be reached, the game plays and saves on the device.
- **Delete account.** Settings → *Delete my account and progress* (two taps) removes the account, its
  cloud save and the device save. Both app stores require this.

## What we store
| Table | Columns | Who can read / write |
|---|---|---|
| `profiles` | player id, first name (or "Guest"), sign-in method, created, last seen | only that player |
| `saves` | the whole game save (≤ 500 KB) + a progress summary: captain level, coins, catches, sea, relics, island level, brand level, last update | only that player |

- No email, contacts or location in our tables. For social logins, Supabase's own auth service keeps
  the email to sign the player in; the game never reads it.
- Row-level security: each player can only see and change their own rows (tested in real Postgres).
- The progress summary lets you see retention and progress in the Supabase table editor without
  opening save files.

## Setup (about 20 minutes, free plan)
1. **Create the project:** supabase.com → New project → Free plan, region near players (e.g. Singapore).
2. **Create the tables:** SQL editor → paste and run each file in `supabase/migrations/`, in order:
   1. `20261025000000_players.sql`: profiles, saves, security rules
   2. `20261026000000_delete_account.sql`: in-app account deletion
3. **Turn on sign-in methods:** Authentication → Sign In / Providers:
   - **Allow anonymous sign-ins**: on (required)
   - **Allow manual linking**: on (lets guests link a login)
   - **Google**: on, with an OAuth client from Google Cloud Console (free)
   - **Facebook**: optional, needs a Meta developer app (free)
   - **Apple**: needs the Apple Developer account (US$99/yr, your decision). Apple requires it in the
     iOS app if Google or Facebook login is offered.
4. **Allow the return addresses:** Authentication → URL Configuration:
   - Site URL: the game URL, e.g. `https://<user>.github.io/Auto-game-studio/`
   - Redirect URLs: the same game URL **and** `com.mamvillage.app://auth/callback` (the apps)
5. **Connect the builds:** Project Settings → API → copy the *Project URL* and the *anon public* key.
   Add them in GitHub → Settings → Secrets and variables → Actions as:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   The anon key is public by design; the security rules protect the data. For local testing, put the
   same two lines in `.env` (see `.env.example`).
6. **Ship it:** merge to `main`. The Pages build and the native app builds pick up the secrets
   automatically. Without them, builds stay guest-only (progress on the device).
7. **Optional:** Authentication → Rate limits / CAPTCHA if bots start creating anonymous accounts.

## Check it works
- Open the game, play a minute, then in Supabase → Table editor: a row in `profiles` and in `saves`.
- Settings in the game should say "Guest · backed up to the cloud" with a "Last saved" time.
- Link Google: the `profiles.provider` column changes from `anonymous` to `google`, same player id.

## For developers
- Code: `src/auth/supabase.ts` (client, save backend, sign-in, deletion), `src/auth/account.ts`
  (sync every 15 s and when the app goes to the background; merge rules in `src/auth/merge.ts`).
- Compiled in only when both variables are set at build time (`__SUPABASE__`); a lazy-loaded chunk
  (≈ 60 KB gz). Firebase is ignored when Supabase is configured.
- In the apps, sign-in opens the system browser and returns by deep link (PKCE); see docs/NATIVE.md.
- Tests: `tests/supabase.test.ts` runs the migrations in PGlite (real Postgres) as two players, including
  account deletion. `tools/supabase-e2e.mjs` fakes Supabase at the network level in Chromium: sign-up →
  upload → restore after a wipe → delete account → offline start (build steps in the file header).
