// The app's screens: a tiny stack (no router needed for a game's handful of scenes).
export type Screen =
  | { name: 'village' }
  | { name: 'fishing'; puzzle?: number }
  | { name: 'seas' }
  | { name: 'settings' }
  | { name: 'fill'; jar: number }
  | { name: 'reveal'; jar: number }
  | { name: 'market' }
  | { name: 'island'; tile?: number }
  | { name: 'team'; focus?: string }
  | { name: 'production' }
  | { name: 'brand' }
  | { name: 'road' }
  | { name: 'business' }
  | { name: 'dog' }
  | { name: 'puzzles' }
  | { name: 'salt'; level: number }
  | { name: 'shop'; level: number };

export interface Nav {
  go(s: Screen): void;
  back(): void;
}
