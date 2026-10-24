import { newState, type GameState } from './state';

const KEY = 'mam_save_v1';

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as GameState;
      if (s.version === 1) {
        // Older saves predate seas, gear, gadgets and missions: fill in every new field.
        const base = newState();
        const legacy = s as GameState & { zone?: string };
        const merged: GameState = { ...base, ...s, stats: { ...base.stats, ...s.stats }, upgrades: { ...base.upgrades, ...s.upgrades } };
        if (!s.sea) merged.sea = legacy.zone === 'reef' ? 'reef' : 'lagoon';
        delete (merged as GameState & { zone?: string }).zone;
        return merged;
      }
    }
  } catch {
    /* corrupted or unavailable save: start fresh */
  }
  return newState();
}

export function saveState(s: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function resetSave(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('mam_funnel');
  } catch {
    /* ignore */
  }
}
