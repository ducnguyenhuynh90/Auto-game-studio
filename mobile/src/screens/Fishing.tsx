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
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, GameButton } from '../ui';
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
  card: { fish: CaughtFish; isNew: boolean } | null = null;
  message = '';
  private nextId = 1;

  constructor(readonly casts: number) {
    this.castsLeft = casts;
    for (let i = 0; i < 5; i++) this.spawn(true);
  }

  get reach(): number {
    return BALANCE.lineReach[game.state.upgrades.line];
  }

  spawn(anywhere = false): void {
    const s = game.state;
    const spec = rollShadow(game.rng, s.sea, s.upgrades.bait);
    const sp = SPECIES_BY_ID[spec.species];
    const dir = game.rng() < 0.5 ? 1 : -1;
    this.shadows.push({
      id: this.nextId++,
      ...spec,
      x: anywhere ? range(game.rng, 40, W - 40) : dir > 0 ? -60 : W + 60,
      y: depthToY(spec.depth),
      dir,
      speed: range(game.rng, 22, 42) * (sp.treasure ? 0.3 : 1) * (1 + sp.difficulty * 0.6),
      state: 'swim',
    });
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
  }

  private landed(): void {
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
    this.reel = new Reel({ difficulty: sp.difficulty, rodLevel: s.upgrades.rod, hookLevel: s.upgrades.hook, assist: s.stats.catches < 1 }, game.rng);
    this.phase = 'reel';
    buzz(Haptics.ImpactFeedbackStyle.Medium);
    analytics.track('hook', { species: sp.id, reaction: Math.round((BALANCE.hookBite[s.upgrades.hook] - this.biteTimer) * 1000) });
  }

  private land(): void {
    const t = this.target!;
    const s = game.state;
    const res = addCatch(s, t.species, t.size, this.reel!.freshness, s.sea, game.rng);
    this.catches.push(res.fish);
    this.shadows = this.shadows.filter((x) => x !== t);
    this.card = { fish: res.fish, isNew: res.isNew };
    this.phase = 'card';
    buzz(Haptics.ImpactFeedbackStyle.Heavy);
    const sp = SPECIES_BY_ID[t.species];
    analytics.track('catch', { species: sp.id, rarity: sp.rarity, size: t.size, fresh: Math.round(res.fish.freshness * 100) / 100, isNew: res.isNew, sea: s.sea, app: 'react-native' });
    analytics.funnelStep('first_catch', { species: sp.id });
    game.commit();
    this.spawn();
  }

  private lose(why: string, reason: string): void {
    if (this.target) this.target.state = 'flee';
    analytics.track('fish_lost', { reason, species: this.target?.species ?? '' });
    this.say(why);
    this.next();
  }

  private closeCard(): void {
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
    for (const sh of this.shadows) {
      if (sh.state === 'swim') {
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
    while (this.shadows.filter((x) => x.state === 'swim' || x.state === 'approach').length < 5) this.spawn();
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

export function FishingScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  const { width, height } = useWindowDimensions();
  const trip = useRef<Trip | null>(null);
  trip.current ??= new Trip(castsPerTrip(s));
  const [, setFrame] = useState(0);
  useEffect(() => {
    analytics.track('trip_start', { sea: s.sea, trip: s.stats.trips + 1, app: 'react-native' });
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
  const sea = SEAS_BY_ID[s.sea];
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
            <Path key={sh.id} path={fishPath(sh.x, sh.y, 30 + Math.min(70, sh.size * 0.9), sh.dir)} color={sh.depth > t.reach + 0.02 ? 'rgba(10,40,60,0.18)' : 'rgba(10,40,60,0.42)'} />
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
        <Text style={styles.chip}>Caught {t.catches.length}</Text>
        <CloseButton onPress={() => (t.castsLeft = 0, t.phase !== 'done' && trip.current && finishTripNow(t), nav.back())} />
      </View>
      <View style={styles.center} pointerEvents="none">
        {t.phase === 'aim' ? <Text style={styles.big}>HOLD to aim, release to cast</Text> : null}
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
          <Text style={styles.small}>Tap to continue</Text>
        </View>
      ) : null}
      {t.phase === 'done' ? (
        <View style={styles.card}>
          <Text style={styles.cardName}>Back to the village</Text>
          <Text style={styles.cardLocal}>{t.catches.length} fish in the bucket</Text>
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
