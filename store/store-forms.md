# Store forms: ready-to-paste answers (Mắm Village 1.0, `com.mamvillage.app`)

Answers taken from what the app actually does (code + database, checked 2026-10-31). Copy them into the
forms. Where something is a business decision it's marked **DECIDE**.

Common values:
- **Privacy policy URL:** https://ducnguyenhuynh90.github.io/Auto-game-studio/privacy.html
- **Account deletion URL (Play):** https://ducnguyenhuynh90.github.io/Auto-game-studio/delete-account.html
- **Website / marketing URL:** https://ducnguyenhuynh90.github.io/Auto-game-studio/
- **Support email:** **DECIDE** (the privacy policy and deletion page tell players to use the email shown on
  the store page)
- **Category:** Games → Simulation (secondary: Casual) · **Price:** Free · **In-app purchases:** none · **Ads:** none

---

## Google Play Console

### App content → Ads
"Does your app contain ads?" → **No**

### App content → App access
"All functionality is available without special access" → **Yes** (players start as guests; no login needed)

### App content → Target audience and content
- Target age groups: **DECIDE.** Recommended: **13-15, 16-17, 18+**. Including under-13 puts the app under
  Google's Families policy (stricter rules for analytics and sign-in). The game is gentle and kid-friendly,
  but targeting adults and teens keeps launch simple.
- "Could your store listing unintentionally appeal to children?" → **Yes** if Google asks (cartoon style). Then
  confirm the app isn't designed for children.

### App content → Content rating (IARC questionnaire)
- Category: **Game**
- Violence: **No** (catching fish only; nothing hurt is shown) · Fear: **No** · Sexuality: **No**
- Language (profanity): **No** · Controlled substances: **No** · Crude humour: **No**
- Gambling: **No** real-money gambling. Simulated gambling: **No**. (Mystery Crates are earned by playing,
  never bought.)
- Users interact with each other: **Yes**, limited: friends see each other's chosen captain name and send
  in-game gifts. There's no chat and no messages.
- Shares the user's location: **No** · Digital purchases: **No** · Unrestricted internet browsing: **No**
- Expected result: **Everyone / PEGI 3** (possibly with "Users Interact").

### App content → Data safety
Overview:
- Collects or shares any of the required data types? **Yes**
- All data encrypted in transit? **Yes** (HTTPS only)
- Can users request deletion? **Yes** (in the app + the deletion URL above)
- Data shared with third parties? **No** (Supabase and Google Analytics act as our service providers)

Data types collected:

| Data type (Play category) | Collected | Optional? | Purposes |
|---|---|---|---|
| Personal info → **Name** (first name from Google sign-in; a captain name the player chooses) | Yes | Optional | App functionality, Account management |
| Personal info → **Email address** (only with Google / Apple sign-in) | Yes | Optional | Account management |
| Personal info → **User IDs** (random player id) | Yes | Required | App functionality, Account management |
| App activity → **Other actions** (game save and progress: village, fish, coins, levels) | Yes | Required | App functionality |
| App activity → **App interactions** (screens, catches, levels; only after "Yes" to statistics) | Yes | Optional | Analytics |
| Device or other IDs (anonymous install id used for statistics, only after "Yes") | Yes | Optional | Analytics |

Not collected: location, contacts, photos, files, audio, financial info, health, messages, web browsing,
installed apps, crash logs beyond what Google Play itself provides.

### Store listing
Text, screenshots, feature graphic and video: `store/listing.md`.

---

## App Store Connect

### App Privacy
- Do you or your partners collect data? **Yes**. Is data used to track? **No** (no ads, no cross-app tracking, no IDFA).

| Data type | Linked to the user? | Used for tracking? | Purposes |
|---|---|---|---|
| Contact Info → **Name** | Yes | No | App Functionality |
| Contact Info → **Email Address** (only Sign in with Apple / Google) | Yes | No | App Functionality |
| Identifiers → **User ID** | Yes | No | App Functionality |
| User Content → **Gameplay Content** (game save, captain name) | Yes | No | App Functionality |
| Usage Data → **Product Interaction** (only after "Yes" to statistics) | No | No | Analytics |

### Age rating
All content questions: **None**. Unrestricted web access: **No**. Gambling / contests: **No**. → **4+**
(Apple may add "Infrequent/Mild" only if you tick something else.)

### App information
- Primary category: **Games → Simulation** · secondary: **Games → Casual**
- Content rights: the app contains no third-party content (art, music and sound are original/procedural)
- Export compliance: answered in the build (`ITSAppUsesNonExemptEncryption = NO`)

### Review notes (paste into "App Review Information → Notes")
```
Mắm Village is a free fishing and fish-sauce game. No login is needed: the game starts as a guest and backs
progress up to our server automatically. Account deletion: tap ≡ (top right) → Settings → Privacy →
"Delete my account and progress" (tap twice). There are no purchases and no ads.
```
Sign-in: the iPhone build shows no Google button until Sign in with Apple is set up (guideline 4.8), so
reviewers don't need a demo account.
