// The island business map (7×9 plots of Phú Quốc, core/island.ts LAYOUT): buy land next to yours,
// build, upgrade, hire and train. Specials stay disguised until bought (the map is fixed; nothing is
// rolled when you pay), with an honest "locals say…" hint.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { analytics } from '@core/analytics';
import {
  BUILDINGS,
  BUILDINGS_BY_ID,
  COLS,
  DISCOVERY,
  HOME,
  ROLE,
  ROWS,
  bucketCap,
  buildingAt,
  build,
  buildingUpgradeCost,
  buyPlot,
  canExpand,
  dismiss,
  hire,
  islandLevel,
  placeProblem,
  plotCost,
  saltCap,
  slots,
  staffAt,
  staffUpgradeCost,
  terrain,
  trainProblem,
  trainStaff,
  upgradeBuilding,
  wage,
  type BuildingId,
  type Terrain,
} from '@core/island';
import { hireProblem, jobRate } from '@core/team';
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, CoinChip, GameButton, Panel } from '../ui';
import type { Nav } from '../nav';

export const BUILDING_ICON: Record<BuildingId, string> = { dock: '⚓', saltfield: '🧂', brewhouse: '🏺', shop: '🏪', warehouse: '📦', tradepost: '⛵', touroffice: '🎫', lantern: '🏮', shrine: '⛩️' };

/** How a plot looks; unbought specials look like their neighbours (beach or grass). */
function look(t: Terrain, owned: boolean): { bg: string; mark: string } {
  const shown: Terrain = owned ? t : t === 't' || t === 'w' ? 'g' : t === 'c' || t === 's' || t === 'p' ? 'b' : t;
  switch (shown) {
    case '~':
      return { bg: C.sea, mark: '' };
    case 'b':
      return { bg: C.sand, mark: '' };
    case 'f':
      return { bg: '#6fae55', mark: '🌴' };
    case 'H':
      return { bg: '#e8c58a', mark: '🏠' };
    case 'c':
      return { bg: '#9fd3d8', mark: '🐟' };
    case 's':
      return { bg: '#f3f0e6', mark: '✨' };
    case 'p':
      return { bg: '#c9a36a', mark: '🪵' };
    case 't':
      return { bg: C.grass, mark: '💰' };
    case 'w':
      return { bg: C.grass, mark: '🙋' };
    default:
      return { bg: C.grass, mark: '' };
  }
}

export function IslandScreen({ nav, tile: start }: { nav: Nav; tile?: number }) {
  const s = useGame();
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState<number | null>(start ?? null);
  const size = Math.floor(Math.min(56, (width - 24) / COLS));
  const tools: [string, () => void, string][] = [
    ['Team', () => nav.go({ name: 'team' }), C.good],
    ['How it’s made', () => nav.go({ name: 'production' }), C.accent],
    ['Business', () => nav.go({ name: 'business' }), C.blue],
    ['Brand', () => nav.go({ name: 'brand' }), C.purple],
    ['Road', () => nav.go({ name: 'road' }), '#d4a017'],
    ['Puzzles', () => nav.go({ name: 'puzzles' }), '#8e5bd6'],
  ];
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <CoinChip />
        <Text style={styles.lvl}>Island Lv {islandLevel(s)}</Text>
        <CloseButton onPress={nav.back} />
      </View>
      <Text style={styles.stats}>
        Fish {s.bucket.length}/{bucketCap(s)} · Salt {s.island.salt}/{saltCap(s)} · Staff {s.island.staff.length}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tools}>
        {tools.map(([label, fn, color]) => (
          <GameButton key={label} testID={`tool_${label}`} label={label} size={13} color={color} onPress={fn} />
        ))}
      </ScrollView>
      <View style={[styles.grid, { width: size * COLS, height: size * ROWS }]}>
        {Array.from({ length: COLS * ROWS }, (_, i) => {
          const t = terrain(i);
          const owned = s.island.owned.includes(i);
          const open = canExpand(s, i);
          const b = buildingAt(s, i);
          const lk = look(t, owned);
          const fog = t !== '~' && !owned && !open;
          return (
            <Pressable
              key={i}
              testID={`tile_${i}`}
              disabled={t === '~'}
              onPress={() => setSel(i)}
              style={[styles.tile, { width: size - 2, height: size - 2, backgroundColor: fog ? '#8a9a8a' : lk.bg, opacity: t === '~' ? 0.5 : 1 }, sel === i && styles.selected, owned && styles.owned]}
            >
              {b ? <Text style={styles.icon}>{BUILDING_ICON[b.id]}</Text> : lk.mark && owned ? <Text style={styles.icon}>{lk.mark}</Text> : null}
              {b && b.level > 1 ? <Text style={styles.badge}>{b.level}</Text> : null}
              {open ? <Text style={styles.price}>+{plotCost(s)}</Text> : null}
              {open && DISCOVERY[t] ? <Text style={styles.hint}>?</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <ScrollView style={styles.panelWrap} contentContainerStyle={{ paddingBottom: 24 }}>
        {sel === null ? <Text style={styles.tip}>Tap a plot: buy land next to yours, then build on it.</Text> : <TilePanel tile={sel} nav={nav} />}
      </ScrollView>
    </View>
  );
}

function TilePanel({ tile, nav }: { tile: number; nav: Nav }) {
  const s = useGame();
  const t = terrain(tile);
  const owned = s.island.owned.includes(tile);
  const b = buildingAt(s, tile);
  if (tile === HOME) return <Panel><Text style={styles.h2}>Mắm Village</Text><Text style={styles.p}>Bà Năm’s home and your jars. Build around it.</Text></Panel>;
  if (!owned) {
    if (!canExpand(s, tile)) return <Panel><Text style={styles.p}>Buy the land next to it first.</Text></Panel>;
    const cost = plotCost(s);
    return (
      <Panel style={{ gap: 8 }}>
        <Text style={styles.h2}>Land for sale</Text>
        {DISCOVERY[t] ? <Text style={[styles.p, { color: '#b8860b' }]}>Locals say there is something special here…</Text> : null}
        <GameButton
          testID="buy_plot"
          label={`Buy ${cost}`}
          color={C.good}
          disabled={s.coins < cost}
          whyNot={`Needs ${cost} coins`}
          onPress={() => {
            const r = buyPlot(s, tile);
            if (!r.ok) return;
            analytics.track('plot_buy', { tile, cost, found: r.found?.name ?? '' });
            game.toast(r.found ? `You found: ${r.found.name}!` : 'Land bought!', C.good, r.found?.desc ?? 'Now build something on it');
            game.commit();
          }}
        />
      </Panel>
    );
  }
  if (b) {
    const def = BUILDINGS_BY_ID[b.id];
    const up = buildingUpgradeCost(b);
    const team = staffAt(s, tile);
    const hp = def.role ? hireProblem(s, def.role) : null;
    return (
      <Panel style={{ gap: 8 }}>
        <View style={styles.row}>
          <Text style={[styles.h2, { flex: 1 }]}>
            {BUILDING_ICON[b.id]} {def.name} · Lv {b.level}
          </Text>
          {up !== null ? (
            <GameButton
              testID="upgrade_building"
              label={`Lv ${b.level + 1}: ${up}`}
              size={13}
              color={C.blue}
              disabled={s.coins < up}
              whyNot={`Needs ${up} coins`}
              onPress={() => {
                if (!upgradeBuilding(s, tile)) return;
                analytics.track('building_upgrade', { id: b.id, level: b.level });
                game.toast(`${def.name} Lv ${b.level}!`, C.blue, def.role ? 'Room for one more worker' : def.desc);
                game.commit();
              }}
            />
          ) : null}
        </View>
        <Text style={styles.p}>{def.desc}</Text>
        {def.role ? (
          <>
            <Text style={styles.label}>
              STAFF {team.length}/{slots(b)} · {ROLE[def.role].title}: {jobRate(def.role, 1)} at Lv 1
            </Text>
            {team.map((st) => {
              const tp = trainProblem(s, st);
              const tc = staffUpgradeCost(st);
              return (
                <View key={st.uid} style={styles.staff}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffName}>
                      {st.name} · Lv {st.level}
                    </Text>
                    <Text style={styles.small}>
                      {ROLE[st.role].perk(st.level)} · wage {wage(st)}/h
                    </Text>
                  </View>
                  {tc !== null ? (
                    <GameButton
                      testID={`train_${st.uid}`}
                      label={`Train ${tc}`}
                      size={12}
                      color={C.purple}
                      disabled={!!tp}
                      whyNot={tp}
                      onPress={() => {
                        if (!trainStaff(s, st.uid)) return;
                        analytics.track('staff_train', { role: st.role, level: st.level, cost: tc });
                        game.toast(`${st.name} is now Lv ${st.level}!`, C.purple, jobRate(st.role, st.level));
                        game.commit();
                      }}
                    />
                  ) : null}
                  <GameButton testID={`dismiss_${st.uid}`} label="×" size={13} color="#bdb3a3" onPress={() => (dismiss(s, st.uid), game.toast(`${st.name} has gone home`, '#8a7a66', 'Their wage stops'), game.commit())} />
                </View>
              );
            })}
            <GameButton
              testID="hire"
              label={`Hire ${ROLE[def.role].title}`}
              color={C.good}
              disabled={!!hp}
              whyNot={hp}
              onPress={() => {
                const st = hire(s, tile);
                if (!st) return;
                analytics.track('staff_hire', { role: st.role, staff: s.island.staff.length, from: 'island' });
                game.toast(`${st.name} joined!`, C.good, jobRate(st.role, 1));
                game.commit();
              }}
            />
          </>
        ) : null}
      </Panel>
    );
  }
  // an empty plot you own: what can go here
  return (
    <Panel style={{ gap: 6 }}>
      <Text style={styles.h2}>Build here</Text>
      {BUILDINGS.map((def) => {
        const problem = placeProblem(s, tile, def.id);
        return (
          <View key={def.id} style={styles.buildRow}>
            <Text style={styles.icon}>{BUILDING_ICON[def.id]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.staffName}>{def.name}</Text>
              <Text style={styles.small} numberOfLines={2}>
                {def.desc}
              </Text>
            </View>
            <GameButton
              testID={`build_${def.id}`}
              label={`${def.cost}`}
              size={13}
              color={C.good}
              disabled={!!problem}
              whyNot={problem}
              onPress={() => {
                if (!build(s, tile, def.id)) return;
                analytics.track('building_build', { id: def.id, terrain: terrain(tile), level: islandLevel(s), cost: def.cost });
                game.toast(`${def.name} built!`, C.good, def.role ? `Now hire a ${ROLE[def.role].title}` : def.desc);
                game.commit();
                void nav;
              }}
            />
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#1b6f8a', padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lvl: { color: '#fff', fontWeight: '900', fontSize: 18 },
  stats: { color: '#fff', fontWeight: '800', fontSize: 12, marginTop: 6, textAlign: 'center' },
  tools: { gap: 6, paddingVertical: 8, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  tile: { margin: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  owned: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  selected: { borderWidth: 3, borderColor: C.gold },
  icon: { fontSize: 22 },
  badge: { position: 'absolute', top: 1, right: 3, fontSize: 10, fontWeight: '900', color: C.ink },
  price: { position: 'absolute', bottom: 1, fontSize: 10, fontWeight: '900', color: C.ink },
  hint: { position: 'absolute', top: 1, right: 3, fontSize: 11, fontWeight: '900', color: '#b8860b' },
  panelWrap: { flex: 1, marginTop: 8 },
  tip: { color: '#fff', fontWeight: '800', textAlign: 'center', marginTop: 10 },
  h2: { fontSize: 17, fontWeight: '900', color: C.ink },
  p: { fontSize: 13, fontWeight: '700', color: C.ink },
  label: { fontSize: 11, fontWeight: '900', color: 'rgba(43,33,24,0.6)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staff: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, padding: 8 },
  staffName: { fontSize: 14, fontWeight: '900', color: C.ink },
  small: { fontSize: 11, fontWeight: '700', color: 'rgba(43,33,24,0.7)' },
  buildRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, padding: 8 },
});
