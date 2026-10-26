// The village hub: goal banner, the jars (fill / ageing / open), the bucket, and the way out to sea.
import { Canvas, Circle, LinearGradient, Oval, Path, Rect, vec } from '@shopify/react-native-skia';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { careerTitle } from '@core/career';
import { BALANCE } from '@core/data';
import { goalPair, progressLabel } from '@core/goals';
import { levelForXp, levelProgress } from '@core/progression';
import { SEAS_BY_ID } from '@core/seas';
import { agingLevel, canFerment, type Jar } from '@core/state';
import { C } from '../theme';
import { useGame } from '../store';
import { CoinChip, GameButton, Panel } from '../ui';
import type { Nav } from '../nav';

function jarState(s: ReturnType<typeof useGame>, j: Jar, now: number): 'empty' | 'ageing' | 'ready' {
  if (!j.sealed) return 'empty';
  return agingLevel(s, j, now) >= 1 ? 'ready' : 'ageing';
}

/** The scenery behind the hub: sky, sea, beach, a palm and Bà Năm's hut (Skia). */
function Scenery({ w, h }: { w: number; h: number }) {
  const beach = h * 0.52;
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={w} height={h}>
        <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={['#ffc98f', '#ffeccc', '#2aa3b9', '#1b6f8a']} positions={[0, 0.28, 0.3, 0.5]} />
      </Rect>
      <Circle cx={w * 0.78} cy={h * 0.12} r={34} color="#fff3c4" />
      <Oval x={-w * 0.2} y={beach - 30} width={w * 1.4} height={h} color={C.sand} />
      <Oval x={-w * 0.1} y={beach + 40} width={w * 1.2} height={h} color={C.grass} />
      <Path path={`M ${w * 0.16} ${beach + 60} Q ${w * 0.2} ${beach - 40} ${w * 0.26} ${beach - 90}`} color="#7a5230" style="stroke" strokeWidth={9} />
      {[0, 1, 2, 3, 4].map((k) => {
        const a = -Math.PI / 2 + (k - 2) * 0.55;
        const x0 = w * 0.26;
        const y0 = beach - 90;
        return <Path key={k} path={`M ${x0} ${y0} Q ${x0 + Math.cos(a) * 40} ${y0 + Math.sin(a) * 40 - 10} ${x0 + Math.cos(a) * 70} ${y0 + Math.sin(a) * 70 + 18}`} color="#4f9a48" style="stroke" strokeWidth={10} strokeCap="round" />;
      })}
      <Rect x={w * 0.6} y={beach - 10} width={w * 0.28} height={60} color="#e8c58a" />
      <Path path={`M ${w * 0.56} ${beach - 6} L ${w * 0.74} ${beach - 60} L ${w * 0.92} ${beach - 6} Z`} color="#c0392b" />
    </Canvas>
  );
}

export function VillageScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  const { width, height } = useWindowDimensions();
  const now = Date.now();
  const { current, next } = goalPair(s);
  const lvl = levelForXp(s.xp);
  const fermentable = s.bucket.filter(canFerment).length;
  return (
    <View style={{ flex: 1 }}>
      <Scenery w={width} h={height} />
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
      </View>
      {current ? (
        <Panel style={styles.goal}>
          <Text style={styles.goalText}>🎯 {current.text}</Text>
          {current.progress ? <Text style={styles.goalProg}>{progressLabel(current)}</Text> : null}
          {next ? <Text style={styles.goalNext}>Next: {next.text}</Text> : null}
        </Panel>
      ) : null}
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
  goal: { marginHorizontal: 12, marginTop: 8 },
  goalText: { fontSize: 17, fontWeight: '900', color: C.ink },
  goalProg: { fontSize: 14, fontWeight: '800', color: C.good, marginTop: 4 },
  goalNext: { fontSize: 12, fontWeight: '700', color: 'rgba(43,33,24,0.7)', marginTop: 4 },
  jars: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, paddingTop: 140, justifyContent: 'center' },
  jar: { width: 150, alignItems: 'center', gap: 6 },
  pot: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: C.ink },
  jarLabel: { fontWeight: '900', color: C.ink },
  jarHint: { fontSize: 11, fontWeight: '700', color: 'rgba(43,33,24,0.65)', textAlign: 'center' },
  bottom: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'stretch' },
  bucket: { width: 80, alignItems: 'center', justifyContent: 'center', padding: 6 },
  bucketNum: { fontSize: 26, fontWeight: '900', color: C.ink },
  bucketLabel: { fontSize: 12, fontWeight: '800', color: C.ink },
});
