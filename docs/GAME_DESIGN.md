# Game design (current slice)

## Fishing (one thumb)
- **Aim:** hold anywhere and a power meter ping-pongs (0.75 Hz); the 3D reticle shows where the bobber will
  land. Release to cast. Fish shadows swim across the water at depths that match their species (far = rarer/bigger).
- **Attract:** the shadow nearest the landing point (within about 95 px) swims to the bait. Missing every
  shadow still brings the nearest fish, only slower (no dead ends).
- **Nibbles → bite:** 0-2 nibbles (visual and haptic), then a splash and "TAP!". The window is 1.1 s
  (rod upgrades 1.3 / 1.5; +0.8 s on the first catch).
- **Reel:** hold raises tension, release lowers it. Keep the needle in the green zone (it drifts for hard
  fish). Thrashes spike tension. Max tension for 0.7 s snaps the line; slack lets the fish escape.
  Freshness = time in zone.
- **Rarity signals are honest:** legendary/epic shadows glow; treasure sparkles.
- 5 casts per trip, then a trip summary.

## Crafting
- Jar holds 3 fish. Recipes: Classic (3 anchovy), Squid (2+ squid), Reef (any snapper/grouper/trevally),
  Golden (any golden anchovy), else Village Blend. "Best 3" auto-fill serves casual players.
- A jar is ready after 1 trip or 90 s, and keeps aging to ★★★ (3 trips) for more °N. Opening early versus
  waiting is the player's call.

## Reveal
- Knock 3 times: the jar squashes and glows more each time. Then the lid pops, the bottle rises, and the °N
  counter eases out through tier thresholds with sound and particles. A tier stamp follows, with NEW RECIPE /
  NEW BEST badges and the honest "X°N from next tier" line.

## Village
- 3D island: house (thatch → terracotta at Lv 6), market stall, drying rack showing your fish, jar yard,
  dock with your boat, salt piles, a lantern string that grows with village level.
- The goal banner plus a pointing hand always show the next step.
