// Special finds. Gadgets are consumables found in Mystery Crates (and as mission rewards);
// relics are permanent abilities earned by completing a sea's story missions.

export type GadgetId = 'sonar' | 'rocket' | 'octo' | 'pearl' | 'salt';
export type RelicId = 'turtle' | 'compass' | 'dragonjar' | 'kite' | 'pearlheart';

export interface Gadget {
  id: GadgetId;
  name: string;
  /** What it does, shown on the card and the item button. */
  desc: string;
  icon: string; // short glyph drawn on the button
  color: string;
  /** 'trip' lasts the current fishing trip; 'catch' applies to the next catch; 'jar' to the next sealed jar. */
  scope: 'trip' | 'catch' | 'jar';
}

export const GADGETS: Record<GadgetId, Gadget> = {
  sonar: { id: 'sonar', name: 'Sonar Shell', desc: 'Hold it to your ear: every fish name shows over its shadow this trip.', icon: 'S', color: '#3aa0d9', scope: 'trip' },
  rocket: { id: 'rocket', name: 'Rocket Bobber', desc: 'A firework-powered bobber: casts reach the deepest water this trip, any line.', icon: 'R', color: '#e8553a', scope: 'trip' },
  octo: { id: 'octo', name: 'Octo Net', desc: 'Eight arms, eight hands: your next catch comes up doubled.', icon: 'O', color: '#a35bd6', scope: 'catch' },
  pearl: { id: 'pearl', name: 'Calm Pearl', desc: 'Calms the water: the green reel zone is 50% wider this trip.', icon: 'P', color: '#5fd3c4', scope: 'trip' },
  salt: { id: 'salt', name: 'Magic Salt', desc: 'Glittering salt: +6°N on the next jar you seal.', icon: 'M', color: '#f2c14e', scope: 'jar' },
};

export interface Relic {
  id: RelicId;
  name: string;
  desc: string;
  color: string;
}

export const RELICS: Record<RelicId, Relic> = {
  turtle: { id: 'turtle', name: 'Turtle Buddy', desc: 'An old sea turtle joins your boat: +1 cast every trip.', color: '#5fae52' },
  compass: { id: 'compass', name: 'Ancient Compass', desc: 'Rare and better fish glow under the water.', color: '#c99b4a' },
  dragonjar: { id: 'dragonjar', name: 'Dragon Jar Glaze', desc: 'Jars age twice as fast on fishing trips.', color: '#2f8f6a' },
  kite: { id: 'kite', name: 'Storm Kite', desc: 'Fish rush to your bait: waits are half as long.', color: '#5a7ac9' },
  pearlheart: { id: 'pearlheart', name: 'Heart of the Sea', desc: '+3°N on every batch, forever. The sea remembers you.', color: '#e0a21a' },
};

export function hasRelic(relics: string[], id: RelicId): boolean {
  return relics.includes(id);
}
