// The web game's palette (src/render/draw.ts COLORS), so both versions look like one game.
export const C = {
  ink: '#2b2118',
  paper: '#fff8ec',
  paperDark: '#f1e2c8',
  wood: '#a06a3d',
  woodDark: '#6e4423',
  sea: '#2a9db5',
  seaDeep: '#11607a',
  sand: '#f0d9a6',
  grass: '#8cc265',
  accent: '#f27a3a',
  accentDark: '#c4541d',
  good: '#4cae5a',
  bad: '#d8473b',
  gold: '#f5c242',
  sky: '#ffd9a8',
  blue: '#3a8fd9',
  purple: '#a35bd6',
};

/** Rarity colours (core/data.ts RARITY_COLOR in the web game). */
export const TIER_COLOR: Record<string, string> = { basic: '#a0a6a8', good: '#5cb85c', fine: '#3a8fd9', premium: '#a35bd6', legendary: '#f0a81c' };
