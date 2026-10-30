import { describe, expect, it } from 'vitest';
import { INVITE_REWARD, WELCOME_GIFT, bestSauce, grantInviteRewards, grantWelcome, inviteUrl, parseInvite, shareText, tasteOff } from '../src/core/social';
import { newState } from '../src/core/state';

describe('friends and invites (core rules)', () => {
  it('reads a friend code from a typed code or a shared link, and nothing else', () => {
    expect(parseInvite(' k7m2qx ')).toBe('K7M2QX');
    expect(parseInvite(inviteUrl('K7M2QX'))).toBe('K7M2QX');
    expect(parseInvite('Come fish! https://x.io/?invite=AB34CD&utm=1')).toBe('AB34CD');
    expect(parseInvite('?invite=AB34CD')).toBe('AB34CD');
    expect(parseInvite('K7M2Q')).toBeNull(); // too short
    expect(parseInvite('K7M2Q0')).toBeNull(); // 0 is never used in codes
    expect(parseInvite('')).toBeNull();
    expect(parseInvite(null)).toBeNull();
  });

  it('the share message brags about your best sauce and carries the code', () => {
    expect(shareText('K7M2QX', 0)).toContain('K7M2QX');
    expect(shareText('K7M2QX', 0)).not.toContain('°N');
    expect(shareText('K7M2QX', 31.24)).toMatch(/31\.2°N/);
  });

  it('best sauce and the taste-off', () => {
    expect(bestSauce({ cellar: {} })).toEqual({ degrees: 0, recipe: null });
    expect(bestSauce({ cellar: { classic: 22, premium: 31 } })).toEqual({ degrees: 31, recipe: 'premium' });
    expect(tasteOff(31, 22)).toBe('win');
    expect(tasteOff(22, 31)).toBe('lose');
    expect(tasteOff(30.02, 30)).toBe('tie');
  });

  it('rewards are coins only, counted as earned', () => {
    const s = newState();
    const c0 = s.coins;
    expect(grantWelcome(s, 'Lan')).toBe(WELCOME_GIFT);
    expect(grantInviteRewards(s, 2)).toBe(2 * INVITE_REWARD);
    expect(grantInviteRewards(s, 0)).toBe(0);
    expect(s.coins).toBe(c0 + WELCOME_GIFT + 2 * INVITE_REWARD);
    expect(s.stats.earned).toBe(WELCOME_GIFT + 2 * INVITE_REWARD);
  });
});
