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
import { HelpSheet, Toasts } from './src/ui';
import { IslandScreen } from './src/screens/Island';
import { BrandScreen, BusinessScreen, DogScreen, ProductionScreen, RoadScreen, StageUpCard, TeamScreen } from './src/screens/Business';
import { PuzzleHubScreen, SaltPuzzleScreen, ShopPuzzleScreen } from './src/screens/Puzzles';
import type { HelpAction } from '@core/help';
import { game, useGame } from './src/store';
import { startAudio } from './src/audio';
import { SeaChartScreen } from './src/screens/SeaChart';
import { SettingsScreen } from './src/screens/Settings';
import { StoryCard } from './src/screens/Story';
import { SortGameScreen, SortMenuScreen } from './src/screens/Sort';
import { ConsentCard } from './src/screens/Consent';
import { cloud } from './src/cloud';
import { ga } from './src/ga';

// optional services (only builds with their EXPO_PUBLIC_* settings turn them on)
ga.setState(() => game.state);
void cloud.start();

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
  const s = useGame();
  const top = stack[stack.length - 1];
  // where the ⓘ cards' buttons go (core/help.ts HelpAction)
  const helpGo = (a: HelpAction) => {
    const to: Record<HelpAction, Screen | null> = {
      market: { name: 'market' },
      production: { name: 'production' },
      island: { name: 'island' },
      road: { name: 'road' },
      puzzles: { name: 'puzzles' },
      fish: { name: 'fishing' },
      map: { name: 'seas' },
      brand: { name: 'brand' },
      missions: null,
      dog: { name: 'dog' },
    };
    const sc = to[a];
    if (sc) go(sc);
  };
  const stageUp = game.stageUps[0];
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']} onTouchStart={startAudio}>
        <StatusBar style="dark" hidden />
        <View style={{ flex: 1 }}>
          {top.name === 'village' ? <VillageScreen nav={nav} /> : null}
          {top.name === 'fishing' ? <FishingScreen nav={nav} puzzle={top.puzzle} key={`fish${top.puzzle ?? ''}`} /> : null}
          {top.name === 'fill' ? <JarFillScreen nav={nav} jar={top.jar} /> : null}
          {top.name === 'reveal' ? <RevealScreen nav={nav} jar={top.jar} /> : null}
          {top.name === 'seas' ? <SeaChartScreen nav={nav} /> : null}
          {top.name === 'sort' ? <SortMenuScreen nav={nav} /> : null}
          {top.name === 'sortgame' ? <SortGameScreen nav={nav} level={top.level} key={`sort${top.level}-${stack.length}`} /> : null}
          {top.name === 'settings' ? <SettingsScreen nav={nav} /> : null}
          {top.name === 'market' ? <MarketScreen nav={nav} /> : null}
          {top.name === 'island' ? <IslandScreen nav={nav} tile={top.tile} /> : null}
          {top.name === 'team' ? <TeamScreen nav={nav} focus={top.focus} /> : null}
          {top.name === 'production' ? <ProductionScreen nav={nav} /> : null}
          {top.name === 'brand' ? <BrandScreen nav={nav} /> : null}
          {top.name === 'road' ? <RoadScreen nav={nav} /> : null}
          {top.name === 'business' ? <BusinessScreen nav={nav} /> : null}
          {top.name === 'dog' ? <DogScreen nav={nav} /> : null}
          {top.name === 'puzzles' ? <PuzzleHubScreen nav={nav} /> : null}
          {top.name === 'salt' ? <SaltPuzzleScreen nav={nav} level={top.level} key={`salt${top.level}`} /> : null}
          {top.name === 'shop' ? <ShopPuzzleScreen nav={nav} level={top.level} key={`shop${top.level}`} /> : null}
          <Toasts />
          <HelpSheet go={helpGo} />
          <StoryCard />
          {ga.askNeeded && top.name === 'village' && s.stats.catches > 0 && !game.story.length && !stageUp ? <ConsentCard /> : null}
          {stageUp && top.name !== 'fishing' && !game.story.length ? (
            <StageUpCard
              up={stageUp}
              onClose={() => (game.stageUps.shift(), game.changed())}
              onBuild={() => (game.stageUps.shift(), game.changed(), go({ name: 'island' }))}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e3d4f' },
});
