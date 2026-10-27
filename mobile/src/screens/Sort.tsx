// Market Sort (rules in ../src/core/sort.ts, shared with the web game): the 50-level map and the board.
// Tap a good to pick it up, tap a shelf to put it there. Three of a kind sell. Boosters cost game coins.
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { analytics } from '@core/analytics';
import {
  GOODS,
  SORT_BOOSTERS,
  SORT_LEVELS,
  buySortBooster,
  freeSlot,
  goodsLeft,
  smartHint,
  sortBoard,
  sortComplete,
  sortLevelSpec,
  sortMove,
  sortOpen,
  sortReward,
  sortShuffle,
  sortStars,
  sortStarsOf,
  sortStuck,
  sortWon,
  type HintPlan,
  type SortBoard,
  type SortBooster,
} from '@core/sort';
import { sfx } from '../audio';
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, CoinChip, GameButton, Panel, tap } from '../ui';
import type { Nav } from '../nav';

const TIER_COLOR: Record<string, string> = { 'super easy': '#5cb85c', easy: '#3a8fd9', medium: '#e67e22', hard: '#c0392b' };

export function SortMenuScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  useEffect(() => analytics.track('sort_menu', { cleared: s.sort.filter((x) => x > 0).length, app: 'react-native' }), []);
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.h1}>Market Sort</Text>
        <CloseButton onPress={nav.back} />
      </View>
      <Text style={styles.small}>Bà Năm's stall is a mess! Three of a kind on a shelf sell. 50 stalls, from super easy to hard.</Text>
      <ScrollView contentContainerStyle={styles.levels}>
        {Array.from({ length: SORT_LEVELS }, (_, i) => {
          const open = sortOpen(s, i);
          const st = sortStarsOf(s, i);
          const tier = sortLevelSpec(i).tier;
          return (
            <Pressable key={i} testID={`sort_lvl_${i + 1}`} disabled={!open} onPress={() => (tap(), nav.go({ name: 'sortgame', level: i }))} style={[styles.level, { backgroundColor: open ? (st > 0 ? TIER_COLOR[tier] : '#fff') : '#d8cfbf' }]}>
              <Text style={[styles.levelNum, { color: st > 0 ? '#fff' : C.ink }]}>{open ? i + 1 : '🔒'}</Text>
              <Text style={styles.levelStars}>{'★'.repeat(st)}{'☆'.repeat(3 - st)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

interface Result {
  won: boolean;
  why: string;
  stuck: boolean;
  stars: number;
  coins: number;
}

export function SortGameScreen({ nav, level }: { nav: Nav; level: number }) {
  const s = useGame();
  const [board] = useState<SortBoard>(() => sortBoard(level));
  const plan = useRef<HintPlan>({ states: [], moves: [] });
  const [, setTick] = useState(0);
  const [left, setLeft] = useState(board.time);
  const [picked, setPicked] = useState<{ s: number; c: number } | null>(null);
  const [hint, setHint] = useState<[number, number, number, number] | null>(null);
  const [freeHint, setFreeHint] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const redraw = () => setTick((t) => t + 1);
  const spec = sortLevelSpec(level);
  // browser QA only: the test bot reads the board the way the web game's hook allows
  if (Platform.OS === 'web') (globalThis as unknown as { __mamSort?: unknown }).__mamSort = { board, plan: plan.current, result, hint: () => smartHint(board, plan.current) };

  useEffect(() => analytics.track('puzzle_start', { section: 'sort', level: level + 1, goods: goodsLeft(board), app: 'react-native' }), []);
  // the clock runs while the board is open and no result is showing
  useEffect(() => {
    if (result) return;
    const id = setInterval(() => setLeft((x) => Math.max(0, x - 0.25)), 250);
    return () => clearInterval(id);
  }, [result]);
  useEffect(() => {
    if (left <= 0 && !result) finish(false, "Time's up!");
  }, [left]);

  function finish(won: boolean, why: string, stuck = false) {
    const stars = won ? sortStars(left, board.time) : 0;
    const r = won ? sortComplete(game.state, level, stars) : { first: false, coins: 0 };
    analytics.track(stuck ? 'sort_stuck' : 'puzzle_end', { section: 'sort', level: level + 1, stars, moves: board.moves, left: Math.round(left), why, app: 'react-native' });
    if (won) sfx.upgrade();
    else sfx.fail();
    setResult({ won, why, stuck, stars, coins: r.coins });
    game.commit();
  }

  function after() {
    if (sortWon(board)) finish(true, 'Stall cleared!');
    else if (sortStuck(board)) finish(false, 'No room left on the shelves', true);
  }

  function tapShelf(si: number, c: number | null) {
    if (result) return;
    const sh = board.shelves[si];
    if (sh.lock > 0) {
      sfx.fail();
      game.toast(`Tied up: sell ${sh.lock} more`, '#8a7a66', 'Every sale loosens the rope');
      return;
    }
    const row = sh.rows[0];
    if (!picked) {
      if (c !== null && row[c] !== null) {
        tap();
        setPicked({ s: si, c });
      }
      return;
    }
    if (picked.s === si && (c === null || c === picked.c)) return setPicked(null);
    const to = c !== null && row[c] === null ? c : freeSlot(board, si);
    if (to < 0) {
      if (c !== null && row[c] !== null) setPicked({ s: si, c });
      return;
    }
    const r = sortMove(board, picked.s, picked.c, si, to);
    setPicked(null);
    setHint(null);
    if (!r.ok) return;
    sfx.plop();
    if (r.sold !== null) sfx.coin();
    redraw();
    after();
  }

  function booster(k: SortBooster) {
    const free = k === 'hint' && freeHint > 0;
    if (!free && !buySortBooster(game.state, k)) {
      sfx.fail();
      game.toast(`Needs ${SORT_BOOSTERS[k].cost} coins`, C.bad, 'Earn coins by fishing and selling sauce');
      return;
    }
    if (free) setFreeHint((n) => n - 1);
    analytics.track('sort_booster', { booster: k, level: level + 1, free, app: 'react-native' });
    if (k === 'hint') setHint(smartHint(board, plan.current));
    if (k === 'shuffle') {
      sortShuffle(board, game.rng);
      setPicked(null);
      setHint(null);
      after();
    }
    if (k === 'time') setLeft((x) => x + 60);
    tap();
    redraw();
    game.commit();
  }

  function rescue() {
    if (!buySortBooster(game.state, 'shuffle')) return;
    analytics.track('sort_booster', { booster: 'shuffle', level: level + 1, free: false, rescue: true, app: 'react-native' });
    sortShuffle(board, game.rng);
    setResult(null);
    redraw();
    game.commit();
    after();
  }

  const rows = Math.ceil(board.shelves.length / 3);
  const shelfH = Math.min(118, 540 / rows);
  const mm = Math.floor(left / 60);
  const ss = Math.floor(left % 60);
  return (
    <View style={styles.game}>
      <View style={styles.bar}>
        <View style={[styles.chip, { backgroundColor: '#7a4a2a' }]}>
          <Text style={styles.chipText}>Lv {level + 1}</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: left < 20 ? C.bad : '#b03a2e', flex: 1 }]}>
          <Text testID="sort_timer" style={styles.chipText}>
            ⏱ {mm}:{String(ss).padStart(2, '0')}
          </Text>
        </View>
        <View style={[styles.chip, { backgroundColor: C.paper }]}>
          <Text style={[styles.chipText, { color: C.ink, fontSize: 13 }]}>{goodsLeft(board)} left</Text>
        </View>
        <CloseButton onPress={nav.back} />
      </View>
      <Text style={styles.tier}>{spec.tier} · three of a kind sell</Text>
      <View style={styles.stall}>
        {board.shelves.map((sh, si) => (
          <Pressable key={si} testID={`sort_shelf_${si}`} onPress={() => tapShelf(si, null)} style={[styles.shelf, { height: shelfH }]}>
            <View style={styles.box}>
            {sh.rows.length > 2 ? <Text style={styles.more}>+{sh.rows.length - 1} rows</Text> : null}
            <View style={styles.backRow}>
              {(sh.rows[1] ?? [null, null, null]).map((g, c) => (
                <View key={c} style={[styles.good, styles.goodBack, g === null ? styles.empty : { backgroundColor: GOODS[g].color }]}>
                  <Text style={styles.emojiBack}>{g === null ? '' : GOODS[g].emoji}</Text>
                </View>
              ))}
            </View>
            <View style={styles.frontRow}>
              {sh.rows[0].map((g, c) => {
                const isPicked = picked?.s === si && picked.c === c;
                const isHint = !!hint && ((hint[0] === si && hint[1] === c) || (hint[2] === si && hint[3] === c));
                return (
                  <Pressable
                    key={c}
                    testID={`sort_${si}_${c}`}
                    hitSlop={4}
                    onPress={() => tapShelf(si, c)}
                    style={[styles.good, g === null ? styles.empty : { backgroundColor: GOODS[g].color }, isPicked && styles.picked, isHint && styles.hint]}
                  >
                    <Text style={styles.emoji}>{g === null ? '' : GOODS[g].emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.plank} />
            </View>
            {sh.lock > 0 ? (
              <View style={styles.lock} pointerEvents="none">
                <View style={styles.lockDot}>
                  <Text style={styles.lockText}>{sh.lock}</Text>
                </View>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
      <View style={styles.boosters}>
        {(['hint', 'shuffle', 'time'] as const).map((k) => {
          const bs = SORT_BOOSTERS[k];
          const label = k === 'hint' && freeHint > 0 ? `${bs.icon} ${bs.name} free` : `${bs.icon} ${bs.name} ${bs.cost}`;
          return <GameButton key={k} testID={`sort_${k}`} label={label} size={13} color={C.purple} style={{ flex: 1, paddingHorizontal: 4 }} disabled={!!result} onPress={() => booster(k)} />;
        })}
      </View>
      <View style={{ alignItems: 'center', marginTop: 6 }}>
        <CoinChip />
      </View>
      {result ? (
        <View style={styles.resultBack}>
          <Panel style={styles.result}>
            <Text style={styles.resultTitle}>{result.won ? 'Sold out!' : 'Oh no…'}</Text>
            <Text style={styles.resultWhy}>{result.why}</Text>
            <Text style={styles.resultStars}>{'★'.repeat(result.stars)}{'☆'.repeat(3 - result.stars)}</Text>
            <Text style={styles.resultWhy}>{result.coins ? `+${result.coins} coins` : result.won ? 'Best kept' : `First clear pays ${sortReward(level)} coins`}</Text>
            {result.stuck ? (
              <GameButton testID="sort_continue" label={`🔀 Shuffle & keep going  ${SORT_BOOSTERS.shuffle.cost}`} size={15} color={C.good} disabled={s.coins < SORT_BOOSTERS.shuffle.cost} onPress={rescue} />
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <GameButton testID="sort_retry" label="Retry" size={15} color="#8a7a66" style={{ flex: 1 }} onPress={() => (nav.back(), nav.go({ name: 'sortgame', level }))} />
              {result.won && level + 1 < SORT_LEVELS ? (
                <GameButton testID="sort_next" label={`Level ${level + 2} ›`} size={15} color={C.good} style={{ flex: 1 }} onPress={() => (nav.back(), nav.go({ name: 'sortgame', level: level + 1 }))} />
              ) : null}
            </View>
            <GameButton testID="sort_back" label="All levels" size={14} color={C.purple} onPress={nav.back} />
          </Panel>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f3e0c0', padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  h1: { fontSize: 26, fontWeight: '900', color: C.ink },
  small: { fontSize: 12, fontWeight: '700', color: 'rgba(43,33,24,0.8)', marginBottom: 8 },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingBottom: 30 },
  level: { width: 58, height: 58, borderRadius: 14, borderWidth: 3, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  levelNum: { fontSize: 18, fontWeight: '900' },
  levelStars: { fontSize: 10, color: C.gold, fontWeight: '900' },
  game: { flex: 1, backgroundColor: '#c98f5c', padding: 10 },
  bar: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chip: { borderRadius: 14, borderWidth: 3, borderColor: C.ink, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center' },
  chipText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  tier: { color: '#fff', fontWeight: '900', textAlign: 'center', marginVertical: 6 },
  stall: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', backgroundColor: '#f3e0c0', borderRadius: 16, padding: 4 },
  shelf: { width: '33.33%', padding: 3 },
  box: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#f7e7cc', borderWidth: 4, borderColor: '#a0683a', borderRadius: 10, paddingBottom: 4 },
  more: { position: 'absolute', top: 8, right: 10, fontSize: 9, fontWeight: '900', color: 'rgba(43,33,24,0.55)' },
  backRow: { flexDirection: 'row', justifyContent: 'space-around', opacity: 0.4, marginBottom: -14, paddingHorizontal: 6 },
  frontRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 2 },
  good: { width: 32, height: 32, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(43,33,24,0.5)', alignItems: 'center', justifyContent: 'center' },
  goodBack: { width: 26, height: 26 },
  empty: { backgroundColor: 'transparent', borderColor: 'rgba(43,33,24,0.12)' },
  picked: { transform: [{ translateY: -10 }], borderColor: C.ink, borderWidth: 3 },
  hint: { borderColor: C.gold, borderWidth: 4 },
  emoji: { fontSize: 20 },
  emojiBack: { fontSize: 15 },
  plank: { height: 5, backgroundColor: '#c98444', borderRadius: 3, marginTop: 3, marginHorizontal: 4 },
  lock: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, backgroundColor: 'rgba(60,45,30,0.55)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lockDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.blue, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  lockText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  boosters: { flexDirection: 'row', gap: 6, marginTop: 8 },
  resultBack: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', padding: 24 },
  result: { gap: 10, alignItems: 'stretch' },
  resultTitle: { fontSize: 30, fontWeight: '900', color: C.ink, textAlign: 'center' },
  resultWhy: { fontSize: 14, fontWeight: '800', color: C.ink, textAlign: 'center' },
  resultStars: { fontSize: 34, color: C.gold, textAlign: 'center' },
});
