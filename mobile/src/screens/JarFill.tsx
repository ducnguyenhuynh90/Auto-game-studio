// Fill a jar: pick 3 fish (or "Best 3"); the recipe and a °N estimate update as you choose.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { analytics } from '@core/analytics';
import { BALANCE, RECIPES_BY_ID, SPECIES_BY_ID } from '@core/data';
import { baseDegrees, bestJarFill, canFerment, recipeFor, sealJar } from '@core/state';
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, GameButton, Panel, tap } from '../ui';
import type { Nav } from '../nav';

export function JarFillScreen({ nav, jar }: { nav: Nav; jar: number }) {
  const s = useGame();
  const [picked, setPicked] = useState<number[]>([]);
  const fish = s.bucket.filter(canFerment);
  const chosen = fish.filter((f) => picked.includes(f.uid));
  const ready = chosen.length === BALANCE.jarSlots;
  const recipe = ready ? RECIPES_BY_ID[recipeFor(chosen)] : null;
  const toggle = (uid: number) => {
    tap();
    setPicked((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : p.length < BALANCE.jarSlots ? [...p, uid] : p));
  };
  const seal = () => {
    if (!sealJar(s, jar, picked, game.rng, Date.now())) return;
    analytics.track('jar_seal', { recipe: s.jars[jar].recipe, app: 'react-native' });
    analytics.funnelStep('first_seal');
    game.toast('Jar sealed!', C.good, 'A full fishing trip ages it: go fishing while it ferments');
    game.commit();
    nav.back();
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.h1}>Fill your jar</Text>
        <CloseButton onPress={nav.back} />
      </View>
      <Text style={styles.sub}>Pick 3 fish. Fresher fish make better sauce.</Text>
      <Panel style={{ marginVertical: 10 }}>
        <Text style={styles.recipe}>{recipe ? `${recipe.name} · about ${baseDegrees(chosen, s.upgrades.salt).toFixed(0)}°N before aging` : `${chosen.length}/${BALANCE.jarSlots} fish`}</Text>
      </Panel>
      <ScrollView contentContainerStyle={styles.grid}>
        {fish.map((f) => {
          const sp = SPECIES_BY_ID[f.species];
          const on = picked.includes(f.uid);
          return (
            <Pressable key={f.uid} testID={`fish_${f.uid}`} onPress={() => toggle(f.uid)} style={[styles.fish, on && { borderColor: C.good, backgroundColor: '#eaf6e4' }]}>
              <View style={[styles.fishDot, { backgroundColor: sp.color }]} />
              <Text style={styles.fishName}>{sp.name}</Text>
              <Text style={styles.fishStars}>{'★'.repeat(f.freshness >= 0.8 ? 3 : f.freshness >= 0.5 ? 2 : 1)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.row}>
        <GameButton testID="best3" label="Best 3" color={C.blue} onPress={() => setPicked(bestJarFill(s))} style={{ flex: 1 }} />
        <GameButton testID="seal" label="Seal jar" color={C.good} disabled={!ready} onPress={seal} style={{ flex: 1.4 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.paper, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 28, fontWeight: '900', color: C.ink },
  sub: { fontSize: 13, fontWeight: '700', color: 'rgba(43,33,24,0.7)' },
  recipe: { fontSize: 15, fontWeight: '900', color: C.ink, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingBottom: 12 },
  fish: { width: 104, padding: 8, borderRadius: 14, borderWidth: 3, borderColor: 'rgba(43,33,24,0.2)', backgroundColor: '#fff', alignItems: 'center' },
  fishDot: { width: 44, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.ink },
  fishName: { fontSize: 12, fontWeight: '800', color: C.ink, marginTop: 4 },
  fishStars: { color: C.gold, fontSize: 14 },
  row: { flexDirection: 'row', gap: 10, paddingTop: 8 },
});
