// Small shared pieces: chunky game buttons (big touch targets), panels, the coin chip and toasts.
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { C } from './theme';
import { game, useGame } from './store';

export function tap(): void {
  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function GameButton(props: { label: string; sub?: string; onPress: () => void; color?: string; disabled?: boolean; style?: ViewStyle; size?: number; testID?: string }) {
  const color = props.disabled ? '#bdb3a3' : (props.color ?? C.accent);
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      hitSlop={10}
      onPress={() => {
        if (props.disabled) return;
        tap();
        props.onPress();
      }}
      style={({ pressed }) => [styles.btn, { backgroundColor: color, transform: [{ translateY: pressed ? 3 : 0 }], opacity: props.disabled ? 0.7 : 1 }, props.style]}
    >
      <Text style={[styles.btnText, { fontSize: props.size ?? 18 }]}>{props.label}</Text>
      {props.sub ? <Text style={styles.btnSub}>{props.sub}</Text> : null}
    </Pressable>
  );
}

/** A round close button with a generous touch area (the founder found small X buttons hard to hit). */
export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable testID="close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={16} onPress={() => (tap(), onPress())} style={styles.close}>
      <Text style={styles.closeText}>✕</Text>
    </Pressable>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function CoinChip() {
  const s = useGame();
  return (
    <View style={styles.coin}>
      <View style={styles.coinDot} />
      <Text style={styles.coinText}>{s.coins}</Text>
    </View>
  );
}

export function Toasts() {
  useGame();
  return (
    <View pointerEvents="none" style={styles.toasts}>
      {game.toasts.map((t) => (
        <View key={t.id} style={[styles.toast, { backgroundColor: t.color }]}>
          <Text style={styles.toastTitle}>{t.title}</Text>
          {t.sub ? <Text style={styles.toastSub}>{t.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.ink, borderBottomWidth: 6 },
  btnText: { color: '#fff', fontWeight: '900', textShadowColor: C.ink, textShadowRadius: 2, textShadowOffset: { width: 1, height: 1 } },
  btnSub: { color: 'rgba(255,255,255,0.95)', fontWeight: '700', fontSize: 11, marginTop: 2 },
  close: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#8a7a66', borderWidth: 3, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  panel: { backgroundColor: C.paper, borderRadius: 18, borderWidth: 3, borderColor: C.ink, padding: 14 },
  coin: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.paper, borderRadius: 22, borderWidth: 3, borderColor: C.ink, paddingHorizontal: 12, paddingVertical: 6 },
  coinDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.gold, borderWidth: 2, borderColor: '#b8860b', marginRight: 8 },
  coinText: { fontSize: 20, fontWeight: '900', color: C.ink },
  toasts: { position: 'absolute', top: 110, left: 16, right: 16, alignItems: 'center', gap: 6 },
  toast: { borderRadius: 14, borderWidth: 3, borderColor: C.ink, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', maxWidth: 360 },
  toastTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
  toastSub: { color: '#fff', fontWeight: '700', fontSize: 12, marginTop: 2, textAlign: 'center' },
});
