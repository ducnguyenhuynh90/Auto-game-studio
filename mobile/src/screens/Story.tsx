// Story scenes (core/story.ts): a chapter card, then one speaker line at a time. Tap to go on, Skip ends it.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CAST } from '@core/story';
import { C } from '../theme';
import { game, useGame } from '../store';
import { tap } from '../ui';

export function StoryCard() {
  useGame();
  const sc = game.story[0];
  // -1 is the chapter card (when the scene has one)
  const [i, setI] = useState(-1);
  useEffect(() => setI(sc?.chapter ? -1 : 0), [sc?.id]);
  if (!sc) return null;
  const line = i >= 0 ? sc.lines[i] : null;
  const who = line ? CAST[line.who] : null;
  const next = () => {
    tap();
    if (i + 1 >= sc.lines.length) game.storyDone(false);
    else setI(i + 1);
  };
  return (
    <View style={styles.back}>
      <Pressable testID="story_next" accessibilityLabel="Next" style={styles.fill} onPress={next} />
      {line && who ? (
        <View style={styles.card} pointerEvents="none">
          <View style={[styles.tag, { backgroundColor: who.color }]}>
            <Text style={styles.tagName}>{who.name}</Text>
            <Text style={styles.tagTitle}>{who.title}</Text>
          </View>
          <Text style={styles.line}>{line.text}</Text>
          <Text style={styles.hint}>
            Tap to continue · {i + 1}/{sc.lines.length}
          </Text>
        </View>
      ) : sc.chapter ? (
        <View style={styles.chapter} pointerEvents="none">
          <Text style={styles.chNum}>{sc.chapter.number}</Text>
          <Text style={styles.chTitle}>{sc.chapter.title}</Text>
          <Text style={styles.hint}>Tap to begin</Text>
        </View>
      ) : null}
      <Pressable testID="story_skip" hitSlop={14} style={styles.skip} onPress={() => (tap(), game.storyDone(true))}>
        <Text style={styles.skipText}>Skip ▸▸</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,15,10,0.6)', justifyContent: 'flex-end', padding: 16, paddingBottom: 40 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: { backgroundColor: C.paper, borderRadius: 20, borderWidth: 3, borderColor: C.ink, padding: 18, paddingTop: 26, gap: 10 },
  tag: { position: 'absolute', top: -18, left: 16, borderRadius: 12, borderWidth: 3, borderColor: C.ink, paddingHorizontal: 12, paddingVertical: 3, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  tagName: { color: '#fff', fontWeight: '900', fontSize: 16 },
  tagTitle: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 11 },
  line: { fontSize: 17, fontWeight: '800', color: C.ink, lineHeight: 24 },
  hint: { fontSize: 11, fontWeight: '700', color: 'rgba(43,33,24,0.55)', textAlign: 'right' },
  chapter: { alignSelf: 'center', marginBottom: 200, backgroundColor: C.paper, borderRadius: 20, borderWidth: 3, borderColor: C.ink, paddingVertical: 22, paddingHorizontal: 34, alignItems: 'center', gap: 6 },
  chNum: { fontSize: 14, fontWeight: '800', color: C.purple, letterSpacing: 2 },
  chTitle: { fontSize: 28, fontWeight: '900', color: C.ink },
  skip: { position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(255,248,236,0.9)', borderRadius: 14, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 14, paddingVertical: 8 },
  skipText: { fontWeight: '900', color: C.ink },
});
