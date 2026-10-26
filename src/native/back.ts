// What the Android back button (and the iOS edge swipe, if enabled later) does on each screen.
// Menus close; side scenes return to the village; the village leaves the app (it keeps running in the
// background, staff keep working). Screens with a result in flight (a jar reveal, a trip, a story beat)
// ignore it: those already have their own buttons and must never lose an outcome.

/** Overlays that are plain menus or abandon-able puzzles: back closes them. */
const CLOSABLE = new Set(['brand', 'business', 'dex', 'dog', 'evolution', 'market', 'missions', 'production', 'puzzles', 'settings', 'salt_puzzle', 'shop_puzzle', 'relic', 'career', 'career_up']);
/** Scenes that back returns to the village from. */
const SIDE_SCENES = new Set(['map', 'island']);

export type BackAction = 'close_overlay' | 'go_village' | 'exit' | 'ignore';

export function backAction(scene: string, overlays: string[]): BackAction {
  const top = overlays[overlays.length - 1];
  if (top !== undefined) return CLOSABLE.has(top) ? 'close_overlay' : 'ignore';
  if (SIDE_SCENES.has(scene)) return 'go_village';
  if (scene === 'village') return 'exit';
  return 'ignore';
}
