// Cloud-save merge rules (pure, unit-tested). Never silently throw away real progress.
import type { GameState } from '../core/state';

export interface SaveBlob {
  state: GameState;
  savedAt: number;
}

/** A rough "how far along" number, shown to the player when they must choose between saves. */
export function progressScore(s: GameState): number {
  return s.xp + s.missionsDone.length * 100 + s.relics.length * 500 + s.stats.catches;
}

export function isFresh(s: GameState): boolean {
  return s.stats.catches === 0 && s.xp === 0 && s.stats.jarsOpened === 0;
}

/**
 * - no cloud save                      → upload this device ('local')
 * - one side is brand new              → keep the other
 * - same journey (same saveId)         → the higher revision wins
 * - two different journeys with progress → ask the player
 */
export function chooseSave(local: SaveBlob, cloud: SaveBlob | null): 'local' | 'cloud' | 'ask' {
  if (!cloud) return 'local';
  if (isFresh(local.state)) return 'cloud';
  if (isFresh(cloud.state)) return 'local';
  if (local.state.saveId && local.state.saveId === cloud.state.saveId) {
    return (local.state.rev ?? 0) >= (cloud.state.rev ?? 0) ? 'local' : 'cloud';
  }
  return 'ask';
}
