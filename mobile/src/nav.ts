// The app's screens: a tiny stack (no router needed for a game's handful of scenes).
export type Screen = { name: 'village' } | { name: 'fishing' } | { name: 'fill'; jar: number } | { name: 'reveal'; jar: number } | { name: 'market' };

export interface Nav {
  go(s: Screen): void;
  back(): void;
}
