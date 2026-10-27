// Puzzles (core/puzzles.ts): clearing level N lets that section's staff train to level N+1.
// Salt Field: turn channels until sea water reaches every pan. Shop: give every customer a bottle they
// accept, for the best total. Fishing: a fixed school and a goal (the trip screen in puzzle mode).
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { analytics } from '@core/analytics';
import { RECIPES_BY_ID } from '@core/data';
import {
  SALT_LEVELS,
  SECTION_INFO,
  SHOP_LEVELS,
  accepts,
  completeLevel,
  levelCount,
  levelOpen,
  saleValue,
  saltBoard,
  saltPar,
  saltSolved,
  saltStars,
  shopBest,
  shopStars,
  stars,
  turnCell,
  watered,
  type SaltBoard,
} from '@core/puzzles';
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, GameButton, Panel } from '../ui';
import type { Nav } from '../nav';

export function PuzzleHubScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.h1}>Puzzles</Text>
        <CloseButton onPress={nav.back} />
      </View>
      <Text style={styles.small}>Staff do the routine. You solve the hard problems: each level you clear lets staff train one level higher.</Text>
      <ScrollView contentContainerStyle={{ gap: 10, paddingVertical: 10 }}>
        <GameButton testID="hub_sort" label="🛒 Market Sort" sub="50 stalls to sort, three of a kind sell" color="#d4a017" onPress={() => nav.go({ name: 'sort' })} />
        {(['fishing', 'salt', 'shop'] as const).map((sec) => (
          <Panel key={sec} style={{ gap: 8 }}>
            <Text style={[styles.h2, { color: SECTION_INFO[sec].dark }]}>
              {SECTION_INFO[sec].title} · {SECTION_INFO[sec].local}
            </Text>
            <Text style={styles.small}>
              {SECTION_INFO[sec].blurb} Trains: {SECTION_INFO[sec].trains}.
            </Text>
            <View style={styles.levels}>
              {Array.from({ length: levelCount(sec) }, (_, i) => {
                const open = levelOpen(s, sec, i);
                const st = stars(s, sec, i);
                return (
                  <Pressable key={i} testID={`level_${sec}_${i + 1}`} disabled={!open} onPress={() => nav.go(sec === 'fishing' ? { name: 'fishing', puzzle: i } : { name: sec, level: i })} style={[styles.level, { backgroundColor: open ? SECTION_INFO[sec].color : '#d6cdbd' }]}>
                    <Text style={styles.levelNum}>{open ? i + 1 : '🔒'}</Text>
                    <Text style={styles.levelStars}>{'★'.repeat(st)}{'☆'.repeat(3 - st)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Panel>
        ))}
      </ScrollView>
    </View>
  );
}

function finish(section: 'salt' | 'shop', index: number, st: number): string {
  const r = completeLevel(game.state, section, index, st);
  analytics.track('puzzle_end', { section, level: index + 1, stars: st, app: 'react-native' });
  game.commit();
  return r.first ? `+${r.coins} coins${r.salt ? `, +${r.salt} salt` : ''}` : 'Best kept';
}

// ---------- Salt channels ----------
const N = 1;
const E = 2;
const S = 4;
const Wd = 8;

function Cell({ mask, wet, kind, size }: { mask: number; wet: boolean; kind: string; size: number }) {
  const color = wet ? '#3aa7d9' : '#a07a52';
  const t = size * 0.22;
  const arm = (side: number) => {
    if (!(mask & side)) return null;
    const style =
      side === N ? { left: (size - t) / 2, top: 0, width: t, height: size / 2 + t / 2 } : side === S ? { left: (size - t) / 2, top: size / 2 - t / 2, width: t, height: size / 2 + t / 2 } : side === E ? { top: (size - t) / 2, left: size / 2 - t / 2, height: t, width: size / 2 + t / 2 } : { top: (size - t) / 2, left: 0, height: t, width: size / 2 + t / 2 };
    return <View key={side} style={[{ position: 'absolute', backgroundColor: color, borderRadius: t / 2 }, style]} />;
  };
  if (kind === 'pan') return <View style={[styles.pan, { width: size * 0.8, height: size * 0.8, backgroundColor: wet ? '#bfe6f5' : '#f3f0e6' }]}><Text style={styles.panText}>SALT</Text></View>;
  return <View style={{ width: size, height: size }}>{[N, E, S, Wd].map(arm)}{kind === 'gate' ? <View style={[styles.gate, { left: size / 2 - 14, top: size / 2 - 14 }]}><Text style={styles.gateText}>SEA</Text></View> : null}</View>;
}

export function SaltPuzzleScreen({ nav, level }: { nav: Nav; level: number }) {
  const { width } = useWindowDimensions();
  useEffect(() => analytics.track('puzzle_start', { section: 'salt', level: level + 1, app: 'react-native' }), [level]);
  const [board, setBoard] = useState<SaltBoard>(() => saltBoard(level));
  const [taps, setTaps] = useState(0);
  const [done, setDone] = useState<{ stars: number; reward: string } | null>(null);
  const par = useMemo(() => saltPar(saltBoard(level)), [level]);
  const wet = watered(board);
  // browser QA only (web build): the test bot reads the board like a player's eyes would
  if (Platform.OS === 'web') (globalThis as unknown as { __mamSalt?: SaltBoard }).__mamSalt = board;
  const size = Math.floor(Math.min(64, (width - 40) / board.w));
  const lvl = SALT_LEVELS[level];
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.h1} numberOfLines={1}>
          Salt {level + 1} · {lvl.title}
        </Text>
        <CloseButton onPress={nav.back} />
      </View>
      <Text style={styles.small}>{lvl.hint}</Text>
      <Text style={styles.h2}>
        Taps {taps} · ★★★ in {par}
      </Text>
      <View style={[styles.board, { width: size * board.w + 12 }]}>
        {board.cells.map((c, i) => (
          <Pressable
            key={i}
            testID={`cell_${i}`}
            disabled={!!done || c.kind !== 'pipe'}
            onPress={() => {
              const b = { ...board, cells: board.cells.map((x) => ({ ...x })) };
              if (!turnCell(b, i)) return;
              setBoard(b);
              setTaps((t) => t + 1);
              if (saltSolved(b)) {
                const st = saltStars(taps + 1, par);
                setDone({ stars: st, reward: finish('salt', level, st) });
              }
            }}
            style={[styles.cell, { width: size, height: size }]}
          >
            <Cell mask={c.kind === 'pipe' || c.kind === 'gate' ? c.mask : 0} wet={wet.has(i)} kind={c.kind} size={size} />
          </Pressable>
        ))}
      </View>
      {done ? (
        <Panel style={{ alignItems: 'center', gap: 6 }}>
          <Text style={[styles.h1, { color: C.good }]}>Solved! {'★'.repeat(done.stars)}</Text>
          <Text style={styles.p}>{done.reward}</Text>
          <GameButton testID="puzzle_done" label="Back to puzzles" color={C.good} onPress={nav.back} />
        </Panel>
      ) : (
        <GameButton testID="reset" label="Reset" color={C.blue} onPress={() => (setBoard(saltBoard(level)), setTaps(0))} />
      )}
    </View>
  );
}

// ---------- Shop orders ----------
export function ShopPuzzleScreen({ nav, level }: { nav: Nav; level: number }) {
  const l = SHOP_LEVELS[level];
  useEffect(() => analytics.track('puzzle_start', { section: 'shop', level: level + 1, app: 'react-native' }), [level]);
  const [sel, setSel] = useState<number | null>(null);
  const [given, setGiven] = useState<Map<number, number>>(new Map());
  const [done, setDone] = useState<{ stars: number; reward: string; total: number; best: number } | null>(null);
  const all = given.size === l.customers.length;
  if (Platform.OS === 'web') (globalThis as unknown as { __mamShop?: unknown }).__mamShop = { l, accepts, saleValue };
  const serve = () => {
    let total = 0;
    let ok = true;
    given.forEach((bi, ci) => {
      if (!accepts(l.customers[ci], l.bottles[bi])) ok = false;
      else total += saleValue(l.customers[ci], l.bottles[bi]);
    });
    const best = shopBest(l) ?? total;
    const st = shopStars(total, best, ok && all);
    setDone({ stars: st, total, best, reward: st > 0 ? finish('shop', level, st) : 'Someone left unhappy: try again' });
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.h1} numberOfLines={1}>
          Shop {level + 1} · {l.title}
        </Text>
        <CloseButton onPress={nav.back} />
      </View>
      <Text style={styles.small}>{l.hint}</Text>
      <ScrollView contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
        {l.customers.map((c, ci) => {
          const bi = given.get(ci);
          return (
            <Pressable
              key={ci}
              testID={`customer_${ci}`}
              disabled={!!done}
              onPress={() => {
                if (sel === null) return;
                const g = new Map(given);
                for (const [k, v] of g) if (v === sel) g.delete(k);
                g.set(ci, sel);
                setGiven(g);
                setSel(null);
              }}
              style={[styles.customer, sel !== null && { borderColor: C.accent }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.h2}>{c.name}</Text>
                <Text style={styles.small}>“{c.says}”</Text>
              </View>
              <Text style={styles.p}>{bi !== undefined ? `${RECIPES_BY_ID[l.bottles[bi].recipe]?.name ?? ''} ${l.bottles[bi].degrees}°N` : '—'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.label}>{sel === null ? 'Tap a bottle…' : '…then tap the customer for it'}</Text>
      <View style={styles.shelf}>
        {l.bottles.map((b, bi) => {
          const used = [...given.values()].includes(bi);
          return (
            <Pressable key={bi} testID={`bottle_${bi}`} disabled={!!done} onPress={() => setSel(sel === bi ? null : bi)} style={[styles.bottle, sel === bi && { borderColor: C.gold, transform: [{ translateY: -6 }] }, used && { opacity: 0.4 }]}>
              <Text style={styles.bottleDeg}>{b.degrees}°N</Text>
              <Text style={styles.bottleName} numberOfLines={1}>
                {(RECIPES_BY_ID[b.recipe]?.name ?? b.recipe).split(' ')[0]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {done ? (
        <Panel style={{ alignItems: 'center', gap: 6 }}>
          <Text style={[styles.h1, { color: done.stars ? C.good : C.bad }]}>{done.stars ? `Served! ${'★'.repeat(done.stars)}` : 'Not quite'}</Text>
          <Text style={styles.p}>
            Earned {done.total} of a best {done.best} · {done.reward}
          </Text>
          <GameButton testID="puzzle_done" label={done.stars ? 'Back to puzzles' : 'Try again'} color={C.good} onPress={() => (done.stars ? nav.back() : (setDone(null), setGiven(new Map())))} />
        </Panel>
      ) : (
        <GameButton testID="serve" label={all ? 'Serve!' : `Serve (${given.size}/${l.customers.length})`} color={C.good} disabled={!all} onPress={serve} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.paper, padding: 14, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  h1: { fontSize: 22, fontWeight: '900', color: C.ink, flexShrink: 1 },
  h2: { fontSize: 15, fontWeight: '900', color: C.ink },
  p: { fontSize: 13, fontWeight: '700', color: C.ink },
  small: { fontSize: 12, fontWeight: '700', color: 'rgba(43,33,24,0.7)' },
  label: { fontSize: 12, fontWeight: '900', color: 'rgba(43,33,24,0.6)', textAlign: 'center' },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  level: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.ink },
  levelNum: { color: '#fff', fontWeight: '900', fontSize: 16 },
  levelStars: { color: '#fff3c4', fontSize: 9 },
  board: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', backgroundColor: '#e8d6b0', borderRadius: 14, borderWidth: 3, borderColor: C.ink, padding: 3, marginVertical: 10 },
  cell: { alignItems: 'center', justifyContent: 'center' },
  pan: { borderRadius: 8, borderWidth: 2, borderColor: '#8a7a66', alignItems: 'center', justifyContent: 'center' },
  panText: { fontSize: 9, fontWeight: '900', color: '#6e5a40' },
  gate: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: '#2a9db5', alignItems: 'center', justifyContent: 'center' },
  gateText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  customer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14, borderWidth: 2, borderColor: 'rgba(43,33,24,0.2)', padding: 10 },
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', backgroundColor: '#b98a52', borderRadius: 14, padding: 8 },
  bottle: { width: 64, paddingVertical: 8, borderRadius: 12, borderWidth: 3, borderColor: 'rgba(0,0,0,0.25)', backgroundColor: '#7a4a24', alignItems: 'center' },
  bottleDeg: { color: '#fff', fontWeight: '900', fontSize: 14 },
  bottleName: { color: '#fff8e8', fontWeight: '800', fontSize: 10 },
});
