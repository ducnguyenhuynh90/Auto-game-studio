// A fishing trip (React Native + Skia). Same rules as the web game: hold to charge the cast (release
// before the red or the line tangles), the nearest fish to where the bobber lands bites, tap on the
// bite, then hold/release to keep the line tension in the green zone (core/fishing.ts Reel).
import { Canvas, Circle, Group, Line, LinearGradient, Oval, Path, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { analytics } from '@core/analytics';
import { BALANCE, RARITY_COLOR, RARITY_LABEL, SPECIES_BY_ID } from '@core/data';
import { Reel, castDistance, castPower, rollShadow } from '@core/fishing';
import { range } from '@core/rng';
import { SEAS_BY_ID } from '@core/seas';
import { addCatch, castsPerTrip, finishTrip, type CaughtFish } from '@core/state';
import { HUNGRY_DIFFICULTY, addChainLink, foodLevel, rollHungry, topLevel } from '@core/chain';
import { FETCH_CHANCE, FIND_CHANCE, MAX_FETCH_PER_TRIP, dogAboard, dogFetch, dogFind } from '@core/dog';
import { FISHING_LEVELS, completeLevel, fishingGoalMet, fishingGoalText, fishingStars, type FishingLevel } from '@core/puzzles';
import { SCENES } from '@core/story';
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, GameButton } from '../ui';
import { sfx } from '../audio';
import type { Nav } from '../nav';

const W = 390;
const H = 844;
const NEAR_Y = 600;
const FAR_Y = 175;
const depthToY = (d: number) => NEAR_Y - d * (NEAR_Y - FAR_Y);

type Phase = 'aim' | 'charging' | 'flying' | 'waiting' | 'bite' | 'reel' | 'card' | 'done';

interface Shadow {
  id: number;
  species: string;
  size: number;
  depth: number;
  x: number;
  y: number;
  dir: number;
  speed: number;
  state: 'swim' | 'approach' | 'hooked' | 'flee';
  /** Food chain: this fish smelled the last catch, swims up within reach and bites fast. */
  hungry?: boolean;
}

const buzz = (style: Haptics.ImpactFeedbackStyle) => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(style).catch(() => undefined);
};

/** All the trip's moving parts live in a ref; React re-renders once per frame to draw them. */
class Trip {
  phase: Phase = 'aim';
  shadows: Shadow[] = [];
  holdTime = 0;
  power = 0;
  bobber = { y: NEAR_Y, t: 0 };
  target: Shadow | null = null;
  wait = 0;
  biteTimer = 0;
  reel: Reel | null = null;
  holding = false;
  castsLeft: number;
  catches: CaughtFish[] = [];
  card: { fish: CaughtFish; isNew: boolean; link: string; dogNote: string } | null = null;
  message = '';
  private nextId = 1;
  /** Food chain: links in the current chain and what this trip earned from chains. */
  chain = 0;
  bestChain = 0;
  links = 0;
  chainCoins = 0;
  /** Mực: fish he fetched, and the trip time of his one find (-1 = none this trip). */
  private fetches = 0;
  private findAt = -1;
  private t = 0;
  /** Fishing puzzle: a fixed school, fixed casts, a goal (core/puzzles.ts). */
  result: { met: boolean; stars: number; reward: string } | null = null;

  constructor(
    readonly casts: number,
    readonly sea = game.state.sea,
    readonly puzzle: FishingLevel | null = null,
    readonly puzzleIndex = -1,
  ) {
    this.castsLeft = casts;
    if (puzzle) {
      for (const f of puzzle.fish) {
        const sh = this.spawn(true, f.species);
        sh.x = f.x;
        sh.depth = f.depth;
        sh.y = depthToY(f.depth);
        sh.dir = f.dir;
      }
      analytics.track('puzzle_trip_start', { level: puzzleIndex + 1 });
      return;
    }
    for (let i = 0; i < 5; i++) this.spawn(true);
    if (dogAboard(game.state) && game.rng() < FIND_CHANCE) this.findAt = 8 + game.rng() * 30;
  }

  get reach(): number {
    return this.puzzle ? BALANCE.lineReach[this.puzzle.line] : BALANCE.lineReach[game.state.upgrades.line];
  }

  get hungryFish(): Shadow | null {
    return this.shadows.find((sh) => sh.hungry && sh.state !== 'flee') ?? null;
  }

  spawn(anywhere = false, species?: string): Shadow {
    const s = game.state;
    const spec = species ? { species, size: Math.round(range(game.rng, SPECIES_BY_ID[species].size[0], SPECIES_BY_ID[species].size[1]) * 10) / 10, depth: SPECIES_BY_ID[species].depth } : rollShadow(game.rng, this.sea, s.upgrades.bait);
    const sp = SPECIES_BY_ID[spec.species];
    const dir = game.rng() < 0.5 ? 1 : -1;
    const sh: Shadow = {
      id: this.nextId++,
      ...spec,
      x: anywhere ? range(game.rng, 40, W - 40) : dir > 0 ? -60 : W + 60,
      y: depthToY(spec.depth),
      dir,
      speed: range(game.rng, 22, 42) * (sp.treasure ? 0.3 : 1) * (1 + sp.difficulty * 0.6),
      state: 'swim',
    };
    this.shadows.push(sh);
    return sh;
  }

  /** A level-L fish was landed: the nearest level-L+1 fish gets hungry and swims up within reach. */
  private wakeHungry(level: number): void {
    if (level < 1 || level >= topLevel(this.sea)) return;
    const next = level + 1;
    const swimming = this.shadows.filter((sh) => sh.state === 'swim' && !sh.hungry && foodLevel(sh.species) === next);
    let h = swimming.sort((a, b) => Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2))[0] ?? null;
    if (!h) {
      if (this.puzzle) return; // a puzzle's school is fixed: nothing new swims in
      const id = rollHungry(game.rng, this.sea, level, game.state.upgrades.bait);
      if (!id) return;
      h = this.spawn(false, id);
    }
    h.hungry = true;
    h.depth = Math.max(0.2, Math.min(h.depth, this.reach - 0.1));
    h.speed = Math.max(h.speed, 40);
    analytics.track('hungry', { species: h.species, level: next, sea: this.sea, chain: this.chain });
    const sc = SCENES.find((x) => x.id === 'food_chain');
    if (sc) game.playStory(sc);
  }

  private breakChain(): void {
    const h = this.hungryFish;
    if (h) {
      h.hungry = false;
      h.state = 'flee';
      h.dir = h.x < W / 2 ? -1 : 1;
    }
    if (this.chain >= 2) analytics.track('chain_end', { links: this.chain, sea: this.sea });
    this.chain = 0;
  }

  down(): void {
    if (this.phase === 'aim') {
      this.phase = 'charging';
      this.holdTime = 0;
    } else if (this.phase === 'bite') this.hook();
    else if (this.phase === 'reel') this.holding = true;
    else if (this.phase === 'card') this.closeCard();
  }

  up(): void {
    if (this.phase === 'charging') this.cast();
    this.holding = false;
  }

  private cast(): void {
    const s = game.state;
    this.castsLeft--;
    s.stats.casts++;
    analytics.funnelStep('first_cast');
    const { distance, tangled } = castDistance(this.power, this.reach);
    analytics.track('cast', { power: Math.round(this.power * 100) / 100, sea: s.sea, tangled, app: 'react-native' });
    if (tangled) {
      s.stats.tangles++;
      buzz(Haptics.ImpactFeedbackStyle.Heavy);
      this.say('Tangled line! Release before the red');
      this.next();
      return;
    }
    this.phase = 'flying';
    this.bobber = { y: depthToY(distance), t: 0 };
    sfx.cast();
  }

  private landed(): void {
    // a hungry fish rushes the bait from farther away and bites almost at once
    const h = this.hungryFish;
    if (h && h.state === 'swim' && Math.hypot((h.x - W / 2) * 0.6, h.y - this.bobber.y) < 150) {
      this.target = h;
      h.state = 'approach';
      this.wait = range(game.rng, 0.3, 0.6);
      this.phase = 'waiting';
      return;
    }
    // the closest fish to the bobber notices; a near miss just takes longer (no dead ends)
    let best: Shadow | null = null;
    let bestD = Infinity;
    for (const sh of this.shadows) {
      if (sh.state !== 'swim' || sh.depth > this.reach + 0.02) continue;
      const d = Math.hypot((sh.x - W / 2) * 0.6, sh.y - this.bobber.y);
      if (d < bestD) {
        bestD = d;
        best = sh;
      }
    }
    this.target = best;
    if (best) best.state = 'approach';
    this.wait = (bestD < 95 ? range(game.rng, 0.6, 1.2) : range(game.rng, 1.6, 2.4));
    this.phase = 'waiting';
  }

  private hook(): void {
    const t = this.target;
    if (!t) return;
    const s = game.state;
    const sp = SPECIES_BY_ID[t.species];
    t.state = 'hooked';
    this.reel = new Reel({ difficulty: sp.difficulty * (t.hungry ? HUNGRY_DIFFICULTY : 1), rodLevel: s.upgrades.rod, hookLevel: s.upgrades.hook, assist: s.stats.catches < 1 }, game.rng);
    this.phase = 'reel';
    buzz(Haptics.ImpactFeedbackStyle.Medium);
    analytics.track('hook', { species: sp.id, reaction: Math.round((BALANCE.hookBite[s.upgrades.hook] - this.biteTimer) * 1000) });
  }

  private land(): void {
    const t = this.target!;
    const s = game.state;
    const res = addCatch(s, t.species, t.size, this.reel!.freshness, this.sea, game.rng);
    this.catches.push(res.fish);
    this.shadows = this.shadows.filter((x) => x !== t);
    // food chain: a hungry fish extends the chain; anything else starts a new one from this fish
    const lvl = foodLevel(t.species);
    if (t.hungry) this.chain++;
    else {
      this.breakChain();
      this.chain = lvl ? 1 : 0;
    }
    let link = '';
    if (this.chain >= 2) {
      const b = addChainLink(s, this.chain);
      this.chainCoins += b.coins;
      this.links++;
      link = `Chain ×${this.chain}! +${b.coins}`;
      analytics.track('chain_link', { links: this.chain, species: t.species, sea: this.sea, coins: b.coins });
    }
    this.bestChain = Math.max(this.bestChain, this.chain);
    // Mực sometimes dives in after your fish and brings back a little one of his own
    let dogNote = '';
    const spc = SPECIES_BY_ID[t.species];
    if (!this.puzzle && dogAboard(s) && !spc.treasure && !spc.crate && this.fetches < MAX_FETCH_PER_TRIP && game.rng() < FETCH_CHANCE) {
      const extra = dogFetch(s, this.sea, game.rng);
      if (extra) {
        this.fetches++;
        this.catches.push(extra);
        dogNote = `Splash! Mực brings back a ${SPECIES_BY_ID[extra.species].name}`;
        analytics.track('dog_fetch', { species: extra.species, sea: this.sea });
      }
    }
    this.card = { fish: res.fish, isNew: res.isNew, link, dogNote };
    this.phase = 'card';
    if (SPECIES_BY_ID[t.species].rarity >= 3) sfx.rare();
    else sfx.catch();
    buzz(Haptics.ImpactFeedbackStyle.Heavy);
    const sp = SPECIES_BY_ID[t.species];
    analytics.track('catch', { species: sp.id, rarity: sp.rarity, size: t.size, fresh: Math.round(res.fish.freshness * 100) / 100, isNew: res.isNew, sea: s.sea, app: 'react-native' });
    analytics.funnelStep('first_catch', { species: sp.id });
    game.commit();
    if (!this.puzzle) this.spawn();
    if (lvl) this.wakeHungry(lvl);
  }

  private lose(why: string, reason: string): void {
    sfx.fail();
    if (this.target) this.target.state = 'flee';
    this.breakChain();
    analytics.track('fish_lost', { reason, species: this.target?.species ?? '' });
    this.say(why);
    this.next();
  }

  private closeCard(): void {
    if (this.card?.dogNote) game.toast(this.card.dogNote, '#6b4a2a', 'Into the bucket it goes');
    this.card = null;
    this.next();
  }

  private next(): void {
    this.target = null;
    this.reel = null;
    this.phase = this.castsLeft <= 0 ? 'done' : 'aim';
    if (this.phase === 'done') this.finish();
  }

  private finish(): void {
    const s = game.state;
    if (this.puzzle) {
      const fish = this.catches.filter((f) => !SPECIES_BY_ID[f.species].treasure && !SPECIES_BY_ID[f.species].crate);
      const met = fishingGoalMet(this.puzzle, { bestChain: this.bestChain, links: this.links, caught: this.catches.map((f) => f.species) });
      const st = fishingStars(met, fish.map((f) => f.freshness));
      const r = completeLevel(s, 'fishing', this.puzzleIndex, st);
      this.result = { met, stars: st, reward: r.first ? `+${r.coins} coins` : met ? 'Best kept' : 'Try again' };
      analytics.track('puzzle_end', { section: 'fishing', level: this.puzzleIndex + 1, stars: st, links: this.links, bestChain: this.bestChain, app: 'react-native' });
      game.commit();
      return;
    }
    finishTrip(s, true);
    analytics.track('trip_end', { sea: s.sea, catches: this.catches.length, casts: this.casts, app: 'react-native' });
    if (s.stats.trips === 2) analytics.funnelStep('second_trip_start');
    game.commit();
  }

  private say(m: string): void {
    this.message = m;
    setTimeout(() => {
      if (this.message === m) this.message = '';
    }, 1800);
  }

  step(dt: number): void {
    this.t += dt;
    // once in a while Mực spots something floating by while you aim
    if (this.findAt >= 0 && this.t >= this.findAt && this.phase === 'aim') {
      this.findAt = -1;
      const f = dogFind(game.state, game.rng);
      game.toast(f.title, '#6b4a2a', f.detail);
      analytics.track('dog_find', { kind: f.kind, sea: this.sea });
      game.commit();
    }
    for (const sh of this.shadows) {
      if (sh.state === 'swim' && sh.hungry) {
        // circles the casting lane at its risen depth, waiting for the next bait
        const tx = W / 2 + Math.sin(this.t * 0.8 + sh.id) * 70;
        const ty = depthToY(sh.depth);
        const dx = tx - sh.x;
        const dy = ty - sh.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          sh.x += (dx / d) * Math.min(d, sh.speed * 1.4 * dt);
          sh.y += (dy / d) * Math.min(d, sh.speed * 1.4 * dt);
        }
        sh.dir = dx >= 0 ? 1 : -1;
      } else if (sh.state === 'swim') {
        sh.x += sh.dir * sh.speed * dt;
        if (sh.x < -80 || sh.x > W + 80) sh.dir *= -1;
      } else if (sh.state === 'approach') {
        const dx = W / 2 - sh.x;
        const dy = this.bobber.y - sh.y;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          sh.x += (dx / d) * Math.min(d, 60 * dt);
          sh.y += (dy / d) * Math.min(d, 60 * dt);
        }
      } else if (sh.state === 'flee') sh.x += sh.dir * 220 * dt;
    }
    this.shadows = this.shadows.filter((sh) => !(sh.state === 'flee' && (sh.x < -100 || sh.x > W + 100)));
    if (!this.puzzle) while (this.shadows.filter((x) => x.state === 'swim' || x.state === 'approach').length < 5) this.spawn();
    switch (this.phase) {
      case 'charging':
        this.holdTime += dt;
        this.power = castPower(this.holdTime);
        break;
      case 'flying':
        this.bobber.t += dt / 0.55;
        if (this.bobber.t >= 1) this.landed();
        break;
      case 'waiting':
        this.wait -= dt;
        if (this.wait <= 0) {
          if (!this.target) return this.lose('Nothing bit this time', 'nothing');
          this.phase = 'bite';
          sfx.bite();
          this.biteTimer = BALANCE.hookBite[game.state.upgrades.hook] + (game.state.stats.catches < 1 ? 0.8 : 0);
          buzz(Haptics.ImpactFeedbackStyle.Heavy);
          analytics.funnelStep('first_bite');
        }
        break;
      case 'bite':
        this.biteTimer -= dt;
        if (this.biteTimer <= 0) this.lose('Too slow! Tap when it bites', 'missed_bite');
        break;
      case 'reel': {
        const r = this.reel!.step(dt, this.holding);
        if (r === 'caught') this.land();
        else if (r === 'snapped') this.lose('Snap! Too much tension', 'snapped');
        else if (r === 'escaped') this.lose('It got away: keep the line tighter', 'escaped');
        break;
      }
    }
  }
}

function fishPath(x: number, y: number, len: number, dir: number): string {
  const h = len * 0.38;
  const tx = x - dir * len * 0.55;
  return `M ${x + dir * len * 0.5} ${y} Q ${x} ${y - h} ${tx} ${y} Q ${x} ${y + h} ${x + dir * len * 0.5} ${y} M ${tx} ${y} L ${tx - dir * len * 0.25} ${y - h * 0.7} L ${tx - dir * len * 0.25} ${y + h * 0.7} Z`;
}

export function FishingScreen({ nav, puzzle }: { nav: Nav; puzzle?: number }) {
  const s = useGame();
  const { width, height } = useWindowDimensions();
  const trip = useRef<Trip | null>(null);
  const level = puzzle !== undefined ? FISHING_LEVELS[puzzle] : null;
  trip.current ??= level ? new Trip(level.casts, level.sea, level, puzzle!) : new Trip(castsPerTrip(s));
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!level) {
      analytics.track('trip_start', { sea: s.sea, trip: s.stats.trips + 1, app: 'react-native' });
      game.checkStory('fishing'); // arriving in a new sea starts its chapter
    } else analytics.track('puzzle_start', { section: 'fishing', level: puzzle! + 1, app: 'react-native' });
    let last = Date.now();
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      trip.current!.step(Math.min(0.05, (now - last) / 1000));
      last = now;
      setFrame((f) => (f + 1) % 1e6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const t = trip.current;
  // browser QA only (web build): lets tools/ test bots read the reel like a player's eyes would
  if (Platform.OS === 'web') (globalThis as unknown as { __mamTrip?: Trip }).__mamTrip = t;
  const k = Math.min(width / W, height / H);
  const ox = (width - W * k) / 2;
  const sea = SEAS_BY_ID[t.sea];
  const reel = t.reel;
  const sp = t.card ? SPECIES_BY_ID[t.card.fish.species] : null;
  const aimY = depthToY(castDistance(Math.min(t.power, BALANCE.overcast), t.reach).distance);
  return (
    <View
      style={{ flex: 1, backgroundColor: sea.look.water }}
      testID="water"
      // the responder system handles press-and-hold the same way for touch (phones) and mouse (web)
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => t.down()}
      onResponderRelease={() => t.up()}
      onResponderTerminate={() => t.up()}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Group transform={[{ translateX: ox }, { scale: k }]}>
          <Rect x={0} y={0} width={W} height={H}>
            <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={[sea.look.skyTop, sea.look.skyBottom, sea.look.water, C.seaDeep]} positions={[0, 0.12, 0.14, 1]} />
          </Rect>
          {/* the line's reach: fish beyond it are out of range */}
          <Line p1={vec(20, depthToY(t.reach))} p2={vec(W - 20, depthToY(t.reach))} color="rgba(255,255,255,0.25)" strokeWidth={2} />
          {t.shadows.map((sh) => (
            <Path key={sh.id} path={fishPath(sh.x, sh.y, 30 + Math.min(70, sh.size * 0.9), sh.dir)} color={sh.hungry ? SPECIES_BY_ID[sh.species].color : sh.depth > t.reach + 0.02 ? 'rgba(10,40,60,0.18)' : 'rgba(10,40,60,0.42)'} />
          ))}
          {/* boat */}
          <Oval x={W / 2 - 70} y={NEAR_Y + 120} width={140} height={90} color="#6e4423" />
          <Oval x={W / 2 - 56} y={NEAR_Y + 128} width={112} height={66} color="#a06a3d" />
          {t.phase === 'charging' ? <Circle cx={W / 2} cy={aimY} r={16} color="rgba(255,255,255,0.85)" style="stroke" strokeWidth={3} /> : null}
          {['flying', 'waiting', 'bite', 'reel'].includes(t.phase) ? (
            <>
              <Line p1={vec(W / 2, NEAR_Y + 130)} p2={vec(W / 2, t.phase === 'flying' ? NEAR_Y - (NEAR_Y - t.bobber.y) * t.bobber.t : t.bobber.y)} color="rgba(255,255,255,0.7)" strokeWidth={1.5} />
              <Circle cx={W / 2} cy={t.phase === 'flying' ? NEAR_Y - (NEAR_Y - t.bobber.y) * t.bobber.t : t.bobber.y + (t.phase === 'bite' ? 6 : 0)} r={9} color={C.bad} />
            </>
          ) : null}
          {/* cast power meter: release before the red */}
          {t.phase === 'charging' ? (
            <Group>
              <RoundedRect x={W - 44} y={300} width={24} height={300} r={10} color="rgba(0,0,0,0.35)" />
              <RoundedRect x={W - 44} y={300} width={24} height={300 * (1 - BALANCE.overcast)} r={10} color={C.bad} />
              <RoundedRect x={W - 42} y={600 - 296 * t.power} width={20} height={296 * t.power} r={8} color={t.power > BALANCE.overcast ? C.bad : C.gold} />
            </Group>
          ) : null}
          {/* reel: keep tension inside the green zone; fill the progress bar to land it */}
          {reel ? (
            <Group>
              <RoundedRect x={40} y={120} width={W - 80} height={28} r={12} color="rgba(0,0,0,0.4)" />
              <RoundedRect x={40 + (W - 80) * reel.zoneLow} y={120} width={(W - 80) * reel.zoneWidth} height={28} r={10} color="rgba(76,174,90,0.85)" />
              <Rect x={40 + (W - 80) * reel.tension - 3} y={114} width={6} height={40} color={reel.inZone ? '#fff' : C.bad} />
              <RoundedRect x={40} y={162} width={W - 80} height={12} r={6} color="rgba(0,0,0,0.35)" />
              <RoundedRect x={40} y={162} width={(W - 80) * Math.max(0, Math.min(1, reel.progress))} height={12} r={6} color={C.gold} />
            </Group>
          ) : null}
        </Group>
      </Canvas>
      {/* HUD and messages (React Native text on top of the Skia scene) */}
      <View style={styles.hud} pointerEvents="box-none">
        <Text style={styles.chip}>Casts {t.castsLeft}/{t.casts}</Text>
        <Text style={styles.chip}>{t.chain >= 2 ? `Chain ×${t.chain}` : `Caught ${t.catches.length}`}</Text>
        <CloseButton onPress={() => (t.castsLeft = 0, t.phase !== 'done' && !t.puzzle && finishTripNow(t), nav.back())} />
      </View>
      <View style={styles.center} pointerEvents="none">
        {level && t.phase === 'aim' ? <Text style={styles.small}>Puzzle: {fishingGoalText(level)}</Text> : null}
        {t.phase === 'aim' ? <Text style={styles.big}>HOLD to aim, release to cast</Text> : null}
        {t.hungryFish && t.phase === 'aim' ? <Text style={[styles.small, { color: C.gold }]}>A hungry fish rose! Catch it next to chain</Text> : null}
        {t.phase === 'bite' ? <Text style={[styles.big, { color: C.gold }]}>BITE! TAP!</Text> : null}
        {t.phase === 'reel' ? <Text style={styles.small}>Hold to pull · let go to ease off · stay in the green</Text> : null}
        {t.message ? <Text style={styles.msg}>{t.message}</Text> : null}
      </View>
      {t.card && sp ? (
        <View style={styles.card} pointerEvents="none">
          <Text style={[styles.rarity, { color: RARITY_COLOR[sp.rarity] }]}>{RARITY_LABEL[sp.rarity]}{t.card.isNew ? ' · NEW!' : ''}</Text>
          <Text style={styles.cardName}>{sp.name}</Text>
          <Text style={styles.cardLocal}>{sp.local} · {t.card.fish.size} cm</Text>
          <Text style={styles.cardStars}>{'★'.repeat(t.card.fish.freshness >= 0.8 ? 3 : t.card.fish.freshness >= 0.5 ? 2 : 1)}</Text>
          {t.card.link ? <Text style={[styles.rarity, { color: C.accent }]}>{t.card.link}</Text> : null}
          <Text style={styles.small}>Tap to continue</Text>
        </View>
      ) : null}
      {t.phase === 'done' ? (
        <View style={styles.card}>
          <Text style={styles.cardName}>{t.result ? (t.result.met ? `Solved! ${'★'.repeat(t.result.stars)}` : 'Not this time') : 'Back to the village'}</Text>
          <Text style={styles.cardLocal}>{t.result ? t.result.reward : `${t.catches.length} fish in the bucket${t.chainCoins ? ` · chains +${t.chainCoins}` : ''}`}</Text>
          <GameButton testID="dock" label="Dock" color={C.good} onPress={nav.back} />
        </View>
      ) : null}
    </View>
  );
}

/** Leaving early still counts the trip (but only full trips age jars: no shortcut). */
function finishTripNow(t: Trip): void {
  finishTrip(game.state, false);
  analytics.track('trip_end', { sea: game.state.sea, catches: t.catches.length, early: true, app: 'react-native' });
  game.commit();
}

const styles = StyleSheet.create({
  hud: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { backgroundColor: C.paper, borderRadius: 16, borderWidth: 3, borderColor: C.ink, paddingHorizontal: 12, paddingVertical: 6, fontWeight: '900', color: C.ink, overflow: 'hidden', flex: 1, textAlign: 'center' },
  center: { position: 'absolute', top: '42%', left: 0, right: 0, alignItems: 'center', gap: 8 },
  big: { color: '#fff', fontSize: 26, fontWeight: '900', textShadowColor: C.ink, textShadowRadius: 4, textAlign: 'center' },
  small: { color: '#fff', fontSize: 14, fontWeight: '800', textShadowColor: C.ink, textShadowRadius: 3, textAlign: 'center' },
  msg: { color: '#fff', backgroundColor: 'rgba(43,33,24,0.75)', fontSize: 15, fontWeight: '900', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, overflow: 'hidden' },
  card: { position: 'absolute', top: '28%', left: 30, right: 30, backgroundColor: C.paper, borderRadius: 22, borderWidth: 4, borderColor: C.ink, padding: 20, alignItems: 'center', gap: 6 },
  rarity: { fontWeight: '900', fontSize: 14 },
  cardName: { fontSize: 28, fontWeight: '900', color: C.ink },
  cardLocal: { fontSize: 14, fontWeight: '700', color: 'rgba(43,33,24,0.7)' },
  cardStars: { fontSize: 26, color: C.gold },
});
