import { describe, expect, it } from 'vitest';
import { chooseSave } from '../src/auth/merge';
import { addCatch, newState } from '../src/core/state';

const blob = (catches: number, saveId?: string, rev = 1) => {
  const s = newState();
  for (let i = 0; i < catches; i++) addCatch(s, 'anchovy', 10, 0.9);
  s.saveId = saveId;
  s.rev = rev;
  return { state: s, savedAt: 1000 };
};

describe('cloud save merge', () => {
  it('uploads when there is no cloud save', () => expect(chooseSave(blob(3, 'a'), null)).toBe('local'));
  it('a brand-new device takes the cloud save', () => expect(chooseSave(blob(0, 'b'), blob(10, 'a'))).toBe('cloud'));
  it('a fresh cloud never overwrites real progress', () => expect(chooseSave(blob(5, 'a'), blob(0, 'x'))).toBe('local'));
  it('same journey: the newer revision wins', () => {
    expect(chooseSave(blob(5, 'a', 9), blob(3, 'a', 4))).toBe('local');
    expect(chooseSave(blob(3, 'a', 4), blob(5, 'a', 9))).toBe('cloud');
  });
  it('two different journeys with progress: ask the player', () => expect(chooseSave(blob(5, 'a'), blob(8, 'b'))).toBe('ask'));
});
