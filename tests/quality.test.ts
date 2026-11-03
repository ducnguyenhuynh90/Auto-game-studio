import { beforeEach, describe, expect, it } from 'vitest';
import { AUTO_TTL_MS, loadAutoQuality, saveAutoQuality } from '../src/render3d/quality';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Pick<Storage, 'getItem' | 'setItem'> }).localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, v),
};

describe('remembered auto quality', () => {
  beforeEach(() => store.clear());
  const t0 = 1_800_000_000_000;

  it('a fresh step-down is remembered for the next launch', () => {
    saveAutoQuality('low', t0);
    expect(loadAutoQuality(t0 + 60_000)).toBe('low');
    expect(loadAutoQuality(t0 + AUTO_TTL_MS - 1)).toBe('low');
  });

  it('expires, so one slow session (battery saver) does not keep a fast phone on low for good', () => {
    saveAutoQuality('low', t0);
    expect(loadAutoQuality(t0 + AUTO_TTL_MS + 1)).toBeNull();
  });

  it('a weak phone that steps down again is remembered again from that day', () => {
    saveAutoQuality('medium', t0);
    saveAutoQuality('low', t0 + AUTO_TTL_MS + 5);
    expect(loadAutoQuality(t0 + AUTO_TTL_MS + 10)).toBe('low');
  });

  it('an undated result from an older version, a broken value or a clock set back counts as none', () => {
    store.set('mam_quality_auto', 'low');
    expect(loadAutoQuality(t0)).toBeNull();
    store.set('mam_quality_auto', '{oops');
    expect(loadAutoQuality(t0)).toBeNull();
    saveAutoQuality('low', t0);
    expect(loadAutoQuality(t0 - 1000)).toBeNull();
  });
});
