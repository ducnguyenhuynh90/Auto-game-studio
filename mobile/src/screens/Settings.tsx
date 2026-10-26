// Settings: sound effects and the beach music (stored like the web game: mam_muted / mam_music).
import { StyleSheet, Text, View } from 'react-native';
import { isMusicOn, isMuted, setMuted, setMusic } from '../audio';
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, GameButton, Panel } from '../ui';
import type { Nav } from '../nav';

export function SettingsScreen({ nav }: { nav: Nav }) {
  useGame();
  const muted = isMuted();
  const music = isMusicOn();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.h1}>Settings</Text>
        <CloseButton onPress={nav.back} />
      </View>
      <Panel style={{ gap: 12 }}>
        <View style={styles.row}>
          <Text style={styles.label}>Sound effects</Text>
          <GameButton testID="set_sound" label={muted ? 'Off' : 'On'} size={15} color={muted ? '#8a7a66' : C.good} onPress={() => (setMuted(!muted), game.changed())} />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Beach music & waves</Text>
          <GameButton testID="set_music" label={music ? 'On' : 'Off'} size={15} color={music ? C.good : '#8a7a66'} onPress={() => (setMusic(!music), game.changed())} />
        </View>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.paperDark, padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  h1: { fontSize: 26, fontWeight: '900', color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 16, fontWeight: '800', color: C.ink },
});
