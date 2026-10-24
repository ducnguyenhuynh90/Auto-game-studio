# Mắm Village (working title)

**Fantasy:** build the world's most satisfying fishing village. You start as a poor fisherman in a
round basket boat (thúng chai) on a Vietnamese-inspired coast.

**Core loop (vertical slice):** CATCH → CRAFT → REVEAL → PROGRESS
1. **Catch:** hold to aim a cast at a visible fish shadow, release, wait for the bite, tap, then
   hold/release to keep line tension in the green zone. Skill (aim, reaction, tension control) decides
   *which* fish you get, *whether* you land it, and how *fresh* it is.
2. **Craft:** put 3 fish in a clay jar and seal it. The fish combination decides the recipe;
   freshness, salt upgrades and aging decide quality.
3. **Reveal:** after a fishing trip (or 90 s), knock 3 times to open the jar; a °N (độ đạm, the real
   quality measure of fish sauce) counter rolls up through quality tiers. Quality is fixed before the
   animation: the reveal shows it and never fakes it.
4. **Progress:** sell the sauce and buy visible village upgrades (jars, rod, salt house, boat → the
   Reef, market stall). The village visibly grows.

**Differentiator:** fermentation-as-reveal. The jar is a timer, a crafting decision, and a reward
moment all at once, and it gives the player a reason to go fishing again ("it ferments while you fish").

**Non-goals for now:** multiplayer, clans, monetization, LiveOps, large content. See studio/BACKLOG.md.

**Platform:** mobile-first web (portrait, one thumb), three.js 3D world + 2D canvas UI. It can be wrapped
for the stores later (Capacitor), but web lets us put a playable link in front of testers now.
