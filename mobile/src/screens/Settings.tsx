// Settings: sound effects and the beach music (stored like the web game: mam_muted / mam_music), the
// play statistics switch (builds with Google Analytics), and the cloud backup with account deletion
// (builds with Supabase).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isMusicOn, isMuted, setMuted, setMusic } from '../audio';
import { cloud, describeSave } from '../cloud';
import { ga } from '../ga';
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, GameButton, Panel } from '../ui';
import type { Nav } from '../nav';

export function SettingsScreen({ nav }: { nav: Nav }) {
  useGame();
  const muted = isMuted();
  const music = isMusicOn();
  const [confirm, setConfirm] = useState(false);
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
        {ga.configured ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Share play statistics</Text>
              <Text style={styles.small}>Anonymous, to Google Analytics. No name, email or ads.</Text>
            </View>
            <GameButton testID="set_stats" label={ga.enabled ? 'On' : 'Off'} size={15} color={ga.enabled ? C.good : '#8a7a66'} onPress={() => (ga.setConsent(!ga.enabled), game.changed())} />
          </View>
        ) : null}
      </Panel>
      {cloud.configured ? (
        <Panel style={{ gap: 10, marginTop: 12 }}>
          <Text style={styles.label}>Cloud backup</Text>
          <Text style={styles.small}>{cloud.status || 'Your progress is backed up while you play.'}</Text>
          {cloud.conflict ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.small}>Two saves found. Which one do you keep?</Text>
              <GameButton testID="keep_local" label="This phone" sub={describeSave(cloud.conflict.local.state)} size={14} color={C.good} onPress={() => void cloud.resolveConflict('local')} />
              <GameButton testID="keep_cloud" label="Cloud" sub={describeSave(cloud.conflict.cloud.state)} size={14} color={C.blue} onPress={() => void cloud.resolveConflict('cloud')} />
            </View>
          ) : null}
          {cloud.connected ? (
            confirm ? (
              <View style={{ gap: 8 }}>
                <Text style={[styles.small, { color: C.bad }]}>This deletes your account, the cloud save and the progress on this phone. It can’t be undone.</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <GameButton testID="delete_yes" label="Delete" size={14} color={C.bad} style={{ flex: 1 }} disabled={cloud.busy} onPress={() => void cloud.deleteAccount().then(() => setConfirm(false))} />
                  <GameButton testID="delete_no" label="Keep" size={14} color="#8a7a66" style={{ flex: 1 }} onPress={() => setConfirm(false)} />
                </View>
              </View>
            ) : (
              <GameButton testID="delete_account" label="Delete account" size={13} color="#8a7a66" onPress={() => setConfirm(true)} />
            )
          ) : null}
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.paperDark, padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  h1: { fontSize: 26, fontWeight: '900', color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: { fontSize: 16, fontWeight: '800', color: C.ink },
  small: { fontSize: 12, fontWeight: '700', color: 'rgba(43,33,24,0.7)' },
});
