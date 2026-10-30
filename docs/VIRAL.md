# The viral loop: growing without paid marketing

**Founder goal (2026-10-30):** a viral loop with a high viral factor, so the game grows without
spending money on marketing.

## The honest maths
Viral factor **K = shares per player × clicks per share × new players per click**. With K above 1 each
player brings more than one new player, and the game grows on its own. K above 1 is rare. Most games
that grow without ads run at K 0.3-0.7, and multiply it with retention: a player who stays 30 days
shares on many days. So the levers are:

| Lever | What raises it | Built |
|---|---|---|
| **Shares per player** | Moments worth showing off, at the moment they happen; a reason to need friends | Brag cards at a great reveal, a rare catch and a taste-off win; daily gifts; invite milestones |
| **Clicks per share** | A picture that stops the scroll, a challenge ("can you beat it?"), a friend's name | 1080×1350 brag card with the result in big type; "my code"; taste-off headline |
| **New players per click** | No install, no sign-up, a personal welcome, a gift | The invite link opens the game in the browser and plays at once; "Lan invited you, her sauce is 31.2°N"; 300-coin welcome |
| **Retention** (multiplies everything) | Friends to beat, gifts waiting, a story to finish | Friends board, daily gifts, story chapters, island business |

## The loop as built (build 3.13)
```
play → a great moment (Premium+ sauce, new best, rare/epic/legendary fish, taste-off win)
     → "📤 Show friends": a picture post with the result + "Play free · my code K7M2QX" + link
     → a friend taps the link → the game opens in the browser, no install
     → "Lan invited you! Her best sauce: 31.2°N. Can you beat it?" + 300 coins; both are now friends
     → the new player plays; at their first sale the inviter gets 500 coins (+ milestone rewards at 1/3/5/10)
     → friends send each other daily gifts and compare sauce → more great moments → more posts
```
Every share carries its sender's code, so each post is also an invitation. Rewards pay only when a
friend really plays, and are never paid for the share itself. Facebook's platform rules forbid
rewarding people for sharing; app stores frown on it too.

## Zero-cost channels to seed the loop
A loop needs a first push. These cost time, not money:
1. **The founder's own network**: 20-50 people on Zalo and Facebook, each with your invite link. This
   is the first test of K.
2. **Vietnamese Facebook groups** about Phú Quốc, fish sauce, cooking, cozy games, and parents of
   kids who like fishing games. Post a brag card, not an ad.
3. **TikTok / Reels / Shorts**: the store trailer (`store/video/promo-1080x1920.mp4`) and
   jar-reveal clips. "Can you guess the °N?" is a natural short-video hook.
4. **Phú Quốc fish-sauce makers and tourism pages**: the game is a free love letter to their craft,
   so ask them to share it.
5. **Store listing (ASO)**: `store/listing.md`. Free search traffic after launch.

## How to measure it
Google Analytics events (once `VITE_GA_MEASUREMENT_ID` is set): `brag_tap`, `brag_share`
(by kind and result), `invite_share` (by channel), `invite_opened`, `invite_welcome`,
`invite_joined`, `invite_reward`, `invite_milestone`, `friend_added`, `friend_visit`, `gifts_sent`,
`gifts_opened`.

The ground truth is in Supabase. Run these in the SQL editor:
```sql
-- K for the last 7 days: new players who joined through an invite, per active player
with active as (select count(*) n from public.profiles where last_seen > now() - interval '7 days'),
     joined as (select count(*) n from public.referrals where created_at > now() - interval '7 days')
select joined.n as invited_new_players, active.n as active_players,
       round(joined.n::numeric / nullif(active.n, 0), 2) as k_7d
from active, joined;

-- Share of new players who came from an invite (viral share of growth)
select date_trunc('week', created_at) as week, count(*) as new_players,
       count(*) filter (where invited_by is not null) as from_invites
from public.profiles group by 1 order by 1 desc;

-- Invites that turned into real players (made a sale), by inviter: who are the super-sharers?
select p.display_name, count(*) as invited, count(*) filter (where r.sale_paid) as playing
from public.referrals r join public.profiles p on p.id = r.inviter
group by 1 order by 2 desc limit 20;

-- Friend graph health: players with at least one friend, and gifts per day
select (select count(distinct user_id) from public.friends) as players_with_friends,
       (select count(*) from public.gifts where day = current_date) as gifts_today;
```

## What to try next (when the numbers say so)
- **Too few shares:** put the brag button on more moments (the first Legendary jar, a Road stage),
  and add "share your village" to the island view.
- **Shares but few clicks:** test card designs (the bottle big against the °N big), and Vietnamese text
  for Vietnamese players.
- **Clicks but few joins:** speed up the first 30 seconds from a link (skip straight to the first
  cast), and show the inviter's face/portrait.
- **Joins but no retention:** fix retention before chasing virality. A leaky bucket can't be filled.
- **Later:** friend tournaments (a weekly sauce cup between friends), co-op orders (fill a big
  export order together), and notifications when a gift arrives (needs push, a native feature).
