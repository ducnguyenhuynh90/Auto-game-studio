// Open a jar: knock three times, watch the °N count up, then sell or keep the bottle.
// Honest randomness: the quality is fixed by the rules before the animation starts (core/state.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { analytics } from '@core/analytics';
import { RECIPES_BY_ID, tierFor } from '@core/data';
import { jarDegrees, openJar, productPrice, sellProduct, type Product } from '@core/state';
import { C, TIER_COLOR } from '../theme';
import { game, useGame } from '../store';
import { GameButton, tap } from '../ui';
import type { Nav } from '../nav';

export function RevealScreen({ nav, jar }: { nav: Nav; jar: number }) {
  const s = useGame();
  // decided before the show begins
  const degrees = useMemo(() => jarDegrees(s, s.jars[jar], Date.now()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const recipe = useMemo(() => RECIPES_BY_ID[s.jars[jar].recipe], []); // eslint-disable-line react-hooks/exhaustive-deps
  const [knocks, setKnocks] = useState(0);
  const [shown, setShown] = useState(0);
  const [product, setProduct] = useState<Product | null>(null);
  const started = useRef(0);
  useEffect(() => {
    if (knocks < 3 || product) return;
    started.current = Date.now();
    const id = setInterval(() => {
      const k = Math.min(1, (Date.now() - started.current) / 2200);
      setShown(degrees * (1 - Math.pow(1 - k, 3)));
      if (k >= 1) {
        clearInterval(id);
        const res = openJar(s, jar, Date.now());
        if (!res) return;
        delete res.product.auto;
        setProduct(res.product);
        analytics.track('jar_open', { recipe: res.product.recipe, degrees, tier: tierFor(degrees).id, app: 'react-native' });
        analytics.funnelStep('first_reveal', { tier: tierFor(degrees).id });
        game.commit();
      }
    }, 33);
    return () => clearInterval(id);
  }, [knocks]); // eslint-disable-line react-hooks/exhaustive-deps
  const tier = tierFor(product ? degrees : shown);
  return (
    <Pressable
      testID="knock"
      style={styles.wrap}
      onPress={() => {
        if (knocks >= 3) return;
        tap();
        setKnocks((k) => k + 1);
      }}
    >
      <Text style={styles.recipe}>{recipe?.name ?? 'Your jar'}</Text>
      {knocks >= 3 ? <Text style={[styles.deg, { color: TIER_COLOR[tier.id] ?? '#fff' }]}>{shown.toFixed(1)}°N</Text> : null}
      {product ? <Text style={[styles.tier, { backgroundColor: TIER_COLOR[tier.id] }]}>{tier.name.toUpperCase()}</Text> : null}
      <View style={[styles.jar, { transform: [{ rotate: `${knocks % 2 ? 6 : -6}deg` }, { scale: 1 + knocks * 0.05 }] }]} />
      {knocks < 3 ? <Text style={styles.tapText}>TAP to knock! ({3 - knocks})</Text> : null}
      {product ? (
        <View style={styles.row}>
          <GameButton
            testID="sell"
            label={`Sell ${productPrice(s, product)}`}
            color={C.good}
            style={{ flex: 1.3 }}
            onPress={() => {
              const price = sellProduct(s, product.uid);
              analytics.track('sell_product', { recipe: product.recipe, degrees: product.degrees, price, where: 'reveal' });
              analytics.funnelStep('first_sale');
              game.commit();
              nav.back();
            }}
          />
          <GameButton testID="keep" label="Store" sub="sell later" color={C.wood} style={{ flex: 1 }} onPress={() => (analytics.track('keep_product', { degrees: product.degrees }), nav.back())} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#2b1d12', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 },
  recipe: { color: '#fff', fontSize: 30, fontWeight: '900' },
  deg: { fontSize: 60, fontWeight: '900' },
  tier: { color: '#fff', fontWeight: '900', fontSize: 22, paddingHorizontal: 30, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },
  jar: { width: 170, height: 190, borderRadius: 85, backgroundColor: '#b06a32', borderWidth: 5, borderColor: '#1a120b' },
  tapText: { color: '#fff', fontSize: 26, fontWeight: '900' },
  row: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
});
