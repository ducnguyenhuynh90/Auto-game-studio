// Asks once whether play statistics may go to Google Analytics (builds with GA only; src/ga.ts).
// Shown in the village after the first catch, like the web game, so the first screen is the game.
import { StyleSheet, Text, View } from 'react-native';
import { ga } from '../ga';
import { C } from '../theme';
import { game } from '../store';
import { GameButton } from '../ui';

export function ConsentCard() {
  const answer = (yes: boolean) => (ga.setConsent(yes), game.changed());
  return (
    <View style={styles.back}>
      <View style={styles.card}>
        <Text style={styles.h1}>Help us improve?</Text>
        <Text style={styles.body}>
          We’d like to send anonymous play statistics to Google Analytics: which screens you use, how far you get, where it gets hard. It helps us make the game better.
        </Text>
        <Text style={styles.body}>No ads. No name or email. You can change this any time in Settings.</Text>
        <GameButton testID="consent_yes" label="Yes, happy to help" size={17} color={C.good} onPress={() => answer(true)} />
        <GameButton testID="consent_no" label="No thanks" size={14} color="#bdb3a3" onPress={() => answer(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,15,10,0.5)', justifyContent: 'flex-end', padding: 14, paddingBottom: 30 },
  card: { backgroundColor: C.paper, borderRadius: 22, borderWidth: 3, borderColor: C.ink, padding: 18, gap: 10 },
  h1: { fontSize: 22, fontWeight: '900', color: C.ink, textAlign: 'center' },
  body: { fontSize: 13.5, fontWeight: '700', color: C.ink, lineHeight: 19, textAlign: 'center' },
});
