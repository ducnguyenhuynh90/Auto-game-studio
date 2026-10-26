// The market: sell your bottles and spare fish; buy better gear, more jars, a bigger stall.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { analytics } from '@core/analytics';
import { RECIPES_BY_ID, SPECIES_BY_ID, UPGRADES, tierFor } from '@core/data';
import { buyUpgrade, canFerment, productPrice, sellFish, sellProduct, upgradeCost } from '@core/state';
import { C, TIER_COLOR } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, CoinChip, GameButton, Panel } from '../ui';
import type { Nav } from '../nav';

export function MarketScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  const [tab, setTab] = useState<'sell' | 'gear'>('sell');
  const spare = s.bucket.filter((f) => !canFerment(f));
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.h1}>Market</Text>
        <CoinChip />
        <CloseButton onPress={nav.back} />
      </View>
      <View style={styles.tabs}>
        <GameButton testID="tab_sell" label="Sell" size={15} color={tab === 'sell' ? C.accent : '#bdb3a3'} style={{ flex: 1 }} onPress={() => setTab('sell')} />
        <GameButton testID="tab_gear" label="Upgrades" size={15} color={tab === 'gear' ? C.accent : '#bdb3a3'} style={{ flex: 1 }} onPress={() => setTab('gear')} />
      </View>
      <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>
        {tab === 'sell' ? (
          <>
            {s.shelf.length === 0 && spare.length === 0 ? <Text style={styles.empty}>Nothing to sell yet. Open a jar to make a bottle.</Text> : null}
            {s.shelf.map((p) => {
              const t = tierFor(p.degrees);
              return (
                <Panel key={p.uid} style={styles.row}>
                  <View style={[styles.bottle, { backgroundColor: TIER_COLOR[t.id] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{RECIPES_BY_ID[p.recipe]?.name ?? p.recipe}</Text>
                    <Text style={styles.meta}>
                      {p.degrees.toFixed(1)}°N · {t.name}
                    </Text>
                  </View>
                  <GameButton
                    testID={`sell_${p.uid}`}
                    label={`${productPrice(s, p)}`}
                    size={15}
                    color={C.good}
                    onPress={() => {
                      const price = sellProduct(s, p.uid);
                      analytics.track('sell_product', { recipe: p.recipe, degrees: p.degrees, price, where: 'market' });
                      analytics.funnelStep('first_sale');
                      game.commit();
                    }}
                  />
                </Panel>
              );
            })}
            {spare.map((f) => (
              <Panel key={f.uid} style={styles.row}>
                <Text style={[styles.name, { flex: 1 }]}>{SPECIES_BY_ID[f.species].name} (not for sauce)</Text>
                <GameButton testID={`sellfish_${f.uid}`} label="Sell" size={14} color={C.good} onPress={() => (sellFish(s, f.uid), game.commit())} />
              </Panel>
            ))}
          </>
        ) : (
          UPGRADES.map((u) => {
            const lvl = s.upgrades[u.id];
            const next = u.levels[lvl + 1];
            const cost = upgradeCost(s, u.id);
            return (
              <Panel key={u.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{u.levels[lvl].name}</Text>
                  <Text style={styles.meta}>{next ? `Next: ${next.name}: ${next.desc}` : 'Fully upgraded'}</Text>
                </View>
                {cost !== null ? (
                  <GameButton
                    testID={`up_${u.id}`}
                    label={`${cost}`}
                    size={15}
                    disabled={s.coins < cost}
                    onPress={() => {
                      if (!buyUpgrade(s, u.id)) return;
                      analytics.track('upgrade', { id: u.id, level: s.upgrades[u.id], cost });
                      analytics.funnelStep('first_upgrade');
                      game.toast(`${u.levels[s.upgrades[u.id]].name}!`, C.purple, u.levels[s.upgrades[u.id]].desc);
                      game.commit();
                    }}
                  />
                ) : null}
              </Panel>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.paper, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  h1: { fontSize: 28, fontWeight: '900', color: C.ink },
  tabs: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  empty: { textAlign: 'center', fontWeight: '700', color: 'rgba(43,33,24,0.6)', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  bottle: { width: 26, height: 44, borderRadius: 8, borderWidth: 2, borderColor: C.ink },
  name: { fontSize: 15, fontWeight: '900', color: C.ink },
  meta: { fontSize: 12, fontWeight: '700', color: 'rgba(43,33,24,0.7)' },
});
