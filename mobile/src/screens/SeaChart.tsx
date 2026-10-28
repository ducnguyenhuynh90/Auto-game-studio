// The Sea Chart (core/seas.ts): five seas in story order. Each shows its missions, relic and why it's locked.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { analytics } from '@core/analytics';
import { RELICS } from '@core/items';
import { SEAS, missionDone, seaComplete, seaLock } from '@core/seas';
import { sfx } from '../audio';
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, GameButton, Panel } from '../ui';
import type { Nav } from '../nav';
import { goGoal } from '../goto';

export function SeaChartScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.h1}>Sea Chart</Text>
        <CloseButton onPress={nav.back} />
      </View>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
        {SEAS.map((sea) => {
          const lock = seaLock(s, sea);
          const here = s.sea === sea.id;
          const done = seaComplete(s, sea);
          const relic = RELICS[sea.relic];
          return (
            <Panel key={sea.id} style={[{ gap: 6, borderLeftWidth: 12, borderLeftColor: sea.look.water }, lock ? { opacity: 0.75 } : null]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.h2}>
                    {lock ? '🔒 ' : done ? '✓ ' : ''}
                    {sea.name}
                    {here ? '  ⚓ here' : ''}
                  </Text>
                  <Text style={styles.local}>{sea.local}</Text>
                </View>
                <GameButton
                  testID={`sail_${sea.id}`}
                  label={here ? 'Fish here' : 'Sail'}
                  size={14}
                  color={C.sea}
                  disabled={!!lock}
                  whyNot={lock}
                  onPress={() => {
                    analytics.track('sail', { from: s.sea, to: sea.id, app: 'react-native' });
                    sfx.cast();
                    if (!here) {
                      s.sea = sea.id;
                      game.commit();
                      game.toast(`Sailed to ${sea.name}`, C.sea, sea.blurb);
                    }
                    nav.back();
                    nav.go({ name: 'fishing' });
                  }}
                />
              </View>
              <Text style={styles.small}>{sea.blurb}</Text>
              {lock ? <Text style={[styles.small, { color: C.purple }]}>{lock}</Text> : null}
              {sea.missions.map((m) => {
                const [c, t] = m.progress(s);
                const ok = s.missionsDone.includes(m.id) || missionDone(s, m);
                const row = (
                  <Text style={[styles.mission, ok && { color: C.good }]}>
                    {ok ? '✓' : '•'} {m.text} {ok ? '' : `(${c}/${t})`}  +{m.reward.coins}
                    {!ok && !lock ? <Text style={styles.go}>   Go ›</Text> : null}
                  </Text>
                );
                if (ok || lock) return <View key={m.id}>{row}</View>;
                // tap a mission to go where it is done (fishing here, or sail there first)
                return (
                  <Pressable key={m.id} testID={`mission_${m.id}`} hitSlop={6} onPress={() => (nav.back(), goGoal(nav, { id: m.id, text: m.text, progress: [c, t], reward: m.reward.coins, chapter: sea.name }))}>
                    {row}
                  </Pressable>
                );
              })}
              <Text style={[styles.small, { color: relic.color }]}>
                Story relic: {relic.name}{s.relics.includes(sea.relic) ? ' ✓' : ''}. {relic.desc}
              </Text>
            </Panel>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#d7eef2', padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  h1: { fontSize: 26, fontWeight: '900', color: C.ink },
  h2: { fontSize: 17, fontWeight: '900', color: C.ink },
  local: { fontSize: 11, fontWeight: '700', color: 'rgba(43,33,24,0.6)' },
  small: { fontSize: 12, fontWeight: '700', color: 'rgba(43,33,24,0.8)' },
  go: { color: C.blue, fontWeight: '900' },
  mission: { fontSize: 12.5, fontWeight: '800', color: C.ink },
});
