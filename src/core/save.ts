import { newState, type GameState } from './state';

const KEY = 'mam_save_v1';

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as GameState;
      if (s.version === 1) return { ...newState(), ...s };
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
