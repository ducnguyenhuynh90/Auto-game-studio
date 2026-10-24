import { newState, type GameState } from './state';

const KEY = 'mam_save_v1';

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return loadFromBlob(JSON.parse(raw) as GameState);
  } catch {
    /* corrupted or unavailable save: start fresh */
  }
  return newState();
}

/** Migrates a save of any version (local or from the cloud) to the current shape. */
export function loadFromBlob(s: GameState): GameState {
  if (s?.version !== 1) return newState();
  // Older saves predate seas, gear, gadgets and missions: fill in every new field.
  const base = newState();
  const legacy = s as GameState & { zone?: string };
  const merged: GameState = {
    ...base,
    ...s,
    stats: { ...base.stats, ...s.stats },
    upgrades: { ...base.upgrades, ...s.upgrades },
    island: { ...base.island, ...s.island, made: { ...base.island.made, ...s.island?.made } },
    puzzles: { ...base.puzzles, ...s.puzzles },
  };
  if (!s.sea) merged.sea = legacy.zone === 'reef' ? 'reef' : 'lagoon';
  delete (merged as GameState & { zone?: string }).zone;
  return merged;
}

/** Called after every local save (cloud sync listens here). */
let onSaved: ((s: GameState) => void) | null = null;
export function setOnSaved(fn: (s: GameState) => void): void {
  onSaved = fn;
}

export function saveState(s: GameState): void {
  s.saveId ??= Math.random().toString(36).slice(2, 12);
  s.rev = (s.rev ?? 0) + 1;
  s.savedAt = Date.now();
  onSaved?.(s);
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
