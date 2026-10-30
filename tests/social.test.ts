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

describe('viral loop rewards', async () => {
  const { INVITE_MILESTONES, GIFT_COINS, grantGifts, nextMilestone, payMilestones, bragHeadline } = await import('../src/core/social');
  it('milestones pay once each, in order, even when several are reached at once', () => {
    const s = newState();
    const c0 = s.coins;
    expect(payMilestones(s, 0)).toEqual([]);
    expect(payMilestones(s, 3).map((m) => m.friends)).toEqual([1, 3]);
    expect(s.coins).toBe(c0 + INVITE_MILESTONES[0].coins + INVITE_MILESTONES[1].coins);
    expect(s.gadgets.pearl).toBe(2);
    expect(s.gadgets.sonar).toBe(3);
    expect(payMilestones(s, 3)).toEqual([]); // already paid
    expect(payMilestones(s, 5).map((m) => m.friends)).toEqual([5]);
    expect(nextMilestone(5)?.friends).toBe(10);
    expect(nextMilestone(10)).toBeNull();
  });
  it('gifts pay coins per friend; the brag line names the sauce tier', () => {
    const s = newState();
    const c0 = s.coins;
    expect(grantGifts(s, ['Lan', 'Tư'])).toBe(2 * GIFT_COINS);
    expect(grantGifts(s, [])).toBe(0);
    expect(s.coins).toBe(c0 + 2 * GIFT_COINS);
    expect(bragHeadline('sauce', 38.24, '')).toMatch(/^38\.2°N \w+ fish sauce!$/);
    expect(bragHeadline('fish', 0, 'Golden Anchovy')).toBe('I caught a Golden Anchovy!');
  });
});

describe('share messages follow the phone language', async () => {
  const { bragMessage, shareText } = await import('../src/core/social');
  it('Vietnamese phones get Vietnamese text, others English; both carry the code', () => {
    expect(shareText('K7M2QX', 31.2, 'vi-VN')).toMatch(/Nhập mã K7M2QX/);
    expect(shareText('K7M2QX', 31.2, 'en-US')).toMatch(/my code K7M2QX/);
    expect(bragMessage('38.2°N!', 'K7M2QX', 'vi')).toMatch(/K7M2QX/);
    expect(bragMessage('38.2°N!', null, 'en')).toMatch(/Play free/);
  });
});
