// Mắm Village (React Native). The rules are the web game's (../src/core); this app draws them natively.
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { analytics } from '@core/analytics';
import type { Nav, Screen } from './src/nav';
import { FishingScreen } from './src/screens/Fishing';
import { JarFillScreen } from './src/screens/JarFill';
import { MarketScreen } from './src/screens/Market';
import { RevealScreen } from './src/screens/Reveal';
import { VillageScreen } from './src/screens/Village';
import { Toasts } from './src/ui';

export default function App() {
  const [stack, setStack] = useState<Screen[]>([{ name: 'village' }]);
  const go = useCallback((s: Screen) => {
    analytics.track('screen', { name: s.name });
    setStack((st) => [...st, s]);
  }, []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const nav: Nav = { go, back };
  // Android back button: one screen back; from the village it leaves the app (the default)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack, back]);
  const top = stack[stack.length - 1];
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="dark" hidden />
        <View style={{ flex: 1 }}>
          {top.name === 'village' ? <VillageScreen nav={nav} /> : null}
          {top.name === 'fishing' ? <FishingScreen nav={nav} /> : null}
          {top.name === 'fill' ? <JarFillScreen nav={nav} jar={top.jar} /> : null}
          {top.name === 'reveal' ? <RevealScreen nav={nav} jar={top.jar} /> : null}
          {top.name === 'market' ? <MarketScreen nav={nav} /> : null}
          <Toasts />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e3d4f' },
});
