import { describe, expect, it } from 'vitest';
import { backAction } from '../src/native/back';

describe('Android back button', () => {
  it('closes menus, returns to the village, and leaves the app from the village', () => {
    expect(backAction('island', ['business'])).toBe('close_overlay');
    expect(backAction('village', ['settings'])).toBe('close_overlay');
    expect(backAction('island', ['puzzles', 'salt_puzzle'])).toBe('close_overlay');
    expect(backAction('island', [])).toBe('go_village');
    expect(backAction('map', [])).toBe('go_village');
    expect(backAction('village', [])).toBe('exit');
  });

  it('never skips an outcome: reveals, story beats and trips ignore it', () => {
    expect(backAction('village', ['reveal'])).toBe('ignore');
    expect(backAction('village', ['jar_fill'])).toBe('ignore');
    expect(backAction('fishing', ['story'])).toBe('ignore');
    expect(backAction('fishing', [])).toBe('ignore');
  });
});
