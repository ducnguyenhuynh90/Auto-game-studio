// The village hub: goal banner, the jars (fill / ageing / open), the bucket, and the way out to sea.
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { careerTitle } from '@core/career';
import { BALANCE } from '@core/data';
import { goalPair, progressLabel } from '@core/goals';
import { levelForXp, levelProgress } from '@core/progression';
import { SEAS_BY_ID } from '@core/seas';
import { agingLevel, canFerment, type Jar } from '@core/state';
import { islandUnlocked } from '@core/island';
import { teamCap, teamSize } from '@core/team';
import { dogPresent } from '@core/dog';
import { C } from '../theme';
import { LivingVillage } from '../scene/LivingVillage';
import { game, useGame } from '../store';
import { CoinChip, GameButton, Panel } from '../ui';
import type { Nav } from '../nav';

function jarState(s: ReturnType<typeof useGame>, j: Jar, now: number): 'empty' | 'ageing' | 'ready' {
  if (!j.sealed) return 'empty';
  return agingLevel(s, j, now) >= 1 ? 'ready' : 'ageing';
}

export function VillageScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  const { width, height } = useWindowDimensions();
  const now = Date.now();
  const { current, next } = goalPair(s);
  const lvl = levelForXp(s.xp);
  const fermentable = s.bucket.filter(canFerment).length;
  // story beats that belong to the hub (the intro, first sale, chapters) play when you're back here
  useEffect(() => game.checkStory('village'), [s.stats.casts, s.stats.sold, s.stats.trips]);
  return (
    <View style={{ flex: 1 }}>
      <LivingVillage w={width} h={height} s={s} />
      <View style={styles.top}>
        <CoinChip />
        <View style={styles.level}>
          <View style={styles.levelDot}>
            <Text style={styles.levelNum}>{lvl}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {careerTitle(s)}
            </Text>
            <View style={styles.xpBar}>
              <View style={[styles.xpFill, { width: `${Math.round(levelProgress(s.xp) * 100)}%` }]} />
            </View>
          </View>
        </View>
        <Pressable testID="settings" accessibilityLabel="Settings" hitSlop={10} onPress={() => nav.go({ name: 'settings' })} style={styles.gear}>
          <Text style={{ fontSize: 20 }}>⚙</Text>
        </Pressable>
      </View>
      {current ? (
        <Panel style={styles.goal}>
          <Text style={styles.goalText}>🎯 {current.text}</Text>
          {current.progress ? <Text style={styles.goalProg}>{progressLabel(current)}</Text> : null}
          {next ? <Text style={styles.goalNext}>Next: {next.text}</Text> : null}
        </Panel>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tools}>
        <GameButton testID="seas" label="🧭 Seas" size={13} color={C.sea} onPress={() => nav.go({ name: 'seas' })} />
        {s.stats.trips >= 1 ? <GameButton testID="sort" label="🛒 Market Sort" size={13} color="#d4a017" onPress={() => nav.go({ name: 'sort' })} /> : null}
        {s.stats.trips >= 1 ? <GameButton testID="puzzles" label="🧩 Puzzles" size={13} color={C.purple} onPress={() => nav.go({ name: 'puzzles' })} /> : null}
      {islandUnlocked(s) ? (
        <>
          <GameButton testID="island" label="🏝 Island" size={13} color={C.good} onPress={() => nav.go({ name: 'island' })} />
          <GameButton testID="team" label={`Team ${teamSize(s)}/${teamCap(s)}`} size={13} color={C.good} onPress={() => nav.go({ name: 'team' })} />
          <GameButton testID="how" label="How it’s made" size={13} color={C.accent} onPress={() => nav.go({ name: 'production' })} />
          <GameButton testID="road" label="Road" size={13} color="#d4a017" onPress={() => nav.go({ name: 'road' })} />
          {dogPresent(s) ? <GameButton testID="dog" label="🐕 Mực" size={13} color="#6b4a2a" onPress={() => nav.go({ name: 'dog' })} /> : null}
        </>
      ) : null}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.jars}>
        {s.jars.map((j, i) => {
          const st = jarState(s, j, now);
          const age = j.sealed ? agingLevel(s, j, now) : 0;
          return (
            <Panel key={i} style={styles.jar}>
              <View style={[styles.pot, { backgroundColor: st === 'empty' ? '#c98444' : '#8f5229' }]} />
              <Text style={styles.jarLabel}>{st === 'empty' ? 'Empty jar' : st === 'ready' ? `Ready ${'★'.repeat(age)}` : 'Fermenting…'}</Text>
              {st === 'empty' ? (
                <GameButton testID={`fill_${i}`} label="Fill" size={14} disabled={fermentable < BALANCE.jarSlots} onPress={() => nav.go({ name: 'fill', jar: i })} />
              ) : st === 'ready' ? (
                <GameButton testID={`open_${i}`} label="Open!" size={14} color={C.gold} onPress={() => nav.go({ name: 'reveal', jar: i })} />
              ) : (
                <Text style={styles.jarHint}>Go fishing: a full trip ages it</Text>
              )}
            </Panel>
          );
        })}
      </ScrollView>
      <View style={styles.bottom}>
        <Panel style={styles.bucket}>
          <Text style={styles.bucketNum}>{s.bucket.length}</Text>
          <Text style={styles.bucketLabel}>fish</Text>
        </Panel>
        <GameButton testID="go_fishing" label="GO FISHING" sub={SEAS_BY_ID[s.sea].name} color={C.sea} size={22} style={{ flex: 1 }} onPress={() => nav.go({ name: 'fishing' })} />
        <GameButton testID="market" label="Market" sub={s.shelf.length ? `${s.shelf.length} to sell` : undefined} color={C.wood} size={15} onPress={() => nav.go({ name: 'market' })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  level: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.paper, borderRadius: 22, borderWidth: 3, borderColor: C.ink, paddingHorizontal: 8, paddingVertical: 4, gap: 8 },
  levelDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  levelNum: { color: '#fff', fontWeight: '900', fontSize: 15 },
  title: { fontSize: 11, fontWeight: '800', color: 'rgba(43,33,24,0.7)' },
  xpBar: { height: 7, borderRadius: 4, backgroundColor: 'rgba(43,33,24,0.12)', marginTop: 3, overflow: 'hidden' },
  xpFill: { height: 7, backgroundColor: C.purple },
  gear: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.paper, borderWidth: 3, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  goal: { marginHorizontal: 12, marginTop: 8 },
  tools: { gap: 6, paddingHorizontal: 12, paddingTop: 8 },
  goalText: { fontSize: 17, fontWeight: '900', color: C.ink },
  goalProg: { fontSize: 14, fontWeight: '800', color: C.good, marginTop: 4 },
  goalNext: { fontSize: 12, fontWeight: '700', color: 'rgba(43,33,24,0.7)', marginTop: 4 },
  jars: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, paddingTop: 110, justifyContent: 'center' },
  jar: { width: 150, alignItems: 'center', gap: 6 },
  pot: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: C.ink },
  jarLabel: { fontWeight: '900', color: C.ink },
  jarHint: { fontSize: 11, fontWeight: '700', color: 'rgba(43,33,24,0.65)', textAlign: 'center' },
  bottom: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'stretch' },
  bucket: { width: 80, alignItems: 'center', justifyContent: 'center', padding: 6 },
  bucketNum: { fontSize: 26, fontWeight: '900', color: C.ink },
  bucketLabel: { fontSize: 12, fontWeight: '800', color: C.ink },
});
