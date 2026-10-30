// Friends: a friends board (whose sauce is best), the world's best sauces, invites with rewards, and
// visits to a friend's village. Server rules in supabase/migrations/*_friends.sql; coins in core/social.ts.
import { analytics } from '../core/analytics';
import { SPECIES, TIERS, tierFor } from '../core/data';
import { INVITE_REWARD, WELCOME_GIFT, bestSauce, grantInviteRewards, grantWelcome, inviteUrl, parseInvite, recipeName, shareText, tasteOff } from '../core/social';
import { BUILDINGS_BY_ID, type BuildingId } from '../core/island';
import { askText } from '../render/ask';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, drawCoin, ease, islandImage, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import { copyText, facebookShareUrl, openShareUrl, shareInvite, whatsappShareUrl } from '../native/share';
import type { BoardRow, MySocial, TopRow, Visit } from '../auth/social';
import type { Game, Scene } from '../game';

const PENDING_KEY = 'mam_invite';

/** An invite link opened the game (?invite=CODE): remember the code until the account is ready. */
export function captureInvite(search: string): void {
  const code = parseInvite(search);
  if (!code) return;
  try {
    localStorage.setItem(PENDING_KEY, code);
  } catch {
    /* private mode: the player can still type the code */
  }
  analytics.track('invite_opened');
}

/**
 * At launch and when Friends opens: join with a remembered invite, and collect invite rewards.
 * The server decides both (once per player / once per friend), so this is safe to run any time.
 */
export async function checkSocial(game: Game): Promise<void> {
  const api = await game.account?.socialApi();
  if (!api) return;
  let pending: string | null = null;
  try {
    pending = localStorage.getItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
  if (pending) {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    await redeem(game, pending, true);
  }
  const n = await api.claimInviteRewards().catch(() => 0);
  if (n > 0) {
    const coins = grantInviteRewards(game.state, n);
    game.coinPulse = 1;
    game.commit();
    sfx.upgrade();
    game.toast(`Invite reward  +${coins}`, COLORS.good, n === 1 ? 'A friend you invited sold their first bottle!' : `${n} friends you invited sold their first bottles!`);
  }
}

/** Join a friend's crew with their code: both become friends and the new player gets a welcome gift. */
async function redeem(game: Game, code: string, quiet = false): Promise<boolean> {
  const api = await game.account?.socialApi();
  if (!api) return false;
  try {
    const inviter = await api.redeemInvite(code);
    const coins = grantWelcome(game.state, inviter);
    game.coinPulse = 1;
    game.commit();
    sfx.upgrade();
    game.toast(`Welcome to ${inviter}'s crew!  +${coins}`, COLORS.good, 'You are now friends. Compare your sauce in Friends.');
    return true;
  } catch (e) {
    const msg = (e as Error).message;
    // an old village opening an invite link just becomes friends instead
    if (/new villages|already joined/.test(msg)) {
      const name = await api.addFriend(code).catch(() => null);
      if (name) game.toast(`You and ${name} are now friends`, COLORS.good, quiet ? 'From the invite link you opened' : undefined);
      return !!name;
    }
    if (!quiet) game.toast('Could not use that code', COLORS.bad, msg);
    return false;
  }
}

type Tab = 'friends' | 'world' | 'invite';

export class FriendsOverlay implements Scene {
  name = 'friends';
  covers3d = true;
  t = 0;
  private tab: Tab = 'friends';
  private me: MySocial | null = null;
  private board: BoardRow[] | null = null;
  private top: TopRow[] | null = null;
  private error = '';
  private busy = false;

  constructor(private game: Game, tab: Tab = 'friends') {
    this.tab = tab;
    analytics.track('friends_open', { tab });
    void this.load();
  }

  private async load(): Promise<void> {
    const api = await this.game.account?.socialApi();
    if (!api) {
      this.error = 'Friends need the online account. Check your connection, then open Friends again.';
      return;
    }
    try {
      await checkSocial(this.game);
      [this.me, this.board] = await Promise.all([api.mySocial(), api.friendsBoard()]);
      this.error = '';
    } catch (e) {
      const msg = (e as Error).message;
      // the database hasn't got the friends functions yet (supabase/migrations/*_friends.sql)
      this.error = /function|schema cache/i.test(msg) ? 'Friends are almost ready: the server is being updated. Please try again later.' : `Could not reach the server (${msg}).`;
    }
  }

  private async loadTop(): Promise<void> {
    const api = await this.game.account?.socialApi();
    if (!api || this.top) return;
    this.top = await api.topBoard().catch(() => []);
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    ctx.fillStyle = 'rgba(20,15,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(this.t / 0.3));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(k, k);
    ctx.translate(-W / 2, -H / 2);
    panel(ctx, 12, 40, W - 24, 780, COLORS.paper, 24);
    outlinedText(ctx, 'Friends', W / 2, 78, 28, '#fff', COLORS.ink, 6);
    ctx.restore();
    this.game.button(ctx, 'close', W - 66, 54, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });

    const tabs: [Tab, string][] = [
      ['friends', 'Friends'],
      ['world', 'World top'],
      ['invite', 'Invite +🪙'],
    ];
    tabs.forEach(([id, label], i) => {
      const on = this.tab === id;
      this.game.button(ctx, `ftab_${id}`, 26 + i * 114, 108, 108, 38, label, () => this.setTab(id), {
        color: on ? '#3a8fd9' : '#e9dfcf',
        dark: on ? '#235f96' : '#b9ab95',
        size: 14,
        textColor: on ? '#fff' : COLORS.ink,
        pulse: id === 'invite' && !!this.me && this.me.friends === 0,
      });
    });

    if (this.error) {
      this.message(ctx, this.error);
      this.game.button(ctx, 'friends_retry', W / 2 - 70, 330, 140, 44, 'Try again', () => {
        this.error = '';
        this.me = null;
        void this.load();
      }, { color: '#3a8fd9', dark: '#235f96', size: 16 });
      return;
    }
    if (!this.me) return this.message(ctx, 'Loading…');
    if (this.tab === 'friends') this.drawFriends(ctx);
    else if (this.tab === 'world') this.drawWorld(ctx);
    else this.drawInvite(ctx);
  }

  private setTab(t: Tab): void {
    this.tab = t;
    sfx.tap();
    analytics.track('friends_tab', { tab: t });
    if (t === 'world') void this.loadTop();
  }

  private message(ctx: Ctx, msg: string): void {
    wrapText(ctx, msg, W - 80).forEach((l, i) => text(ctx, l, W / 2, 230 + i * 22, 16, COLORS.ink, 'center', 800));
  }

  // ---------- friends board ----------
  private drawFriends(ctx: Ctx): void {
    const rows = this.board ?? [];
    text(ctx, 'Whose fish sauce is best?', W / 2, 170, 15, 'rgba(43,33,24,0.7)', 'center', 800);
    const shown = rows.slice(0, 8);
    shown.forEach((r, i) => this.boardRow(ctx, 186 + i * 62, i + 1, r.name, r.best_degrees, `Lv ${r.captain_level} · ${r.dex} fish`, r.me, r.me ? null : () => this.game.push(new FriendVisitOverlay(this.game, r))));
    const y = 186 + shown.length * 62 + 14;
    if (rows.length <= 1) {
      text(ctx, 'No friends yet.', W / 2, y + 20, 18, COLORS.ink, 'center', 900);
      text(ctx, `Invite one: they get ${WELCOME_GIFT} coins, you get ${INVITE_REWARD}.`, W / 2, y + 46, 14, 'rgba(43,33,24,0.75)', 'center', 800);
      this.game.button(ctx, 'friends_go_invite', W / 2 - 100, y + 70, 200, 46, 'Invite friends', () => this.setTab('invite'), { color: COLORS.good, dark: '#2f7a3b', size: 17, pulse: true });
    }
    this.game.button(ctx, 'friend_add', 30, 742, W - 60, 46, '+ Add a friend by code', () => void this.addByCode(), { color: '#3a8fd9', dark: '#235f96', size: 16 });
  }

  private boardRow(ctx: Ctx, y: number, rank: number, name: string, deg: number, sub: string, me: boolean, visit: (() => void) | null): void {
    ctx.fillStyle = me ? '#fff3c4' : '#fff';
    rr(ctx, 26, y, W - 52, 56, 12);
    ctx.fill();
    ctx.strokeStyle = me ? COLORS.gold : 'rgba(43,33,24,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const medal = ['#f0b429', '#b8c2cc', '#cd8a4f'][rank - 1];
    if (medal) {
      ctx.fillStyle = medal;
      ctx.beginPath();
      ctx.arc(52, y + 28, 15, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, String(rank), 52, y + 29, 15, medal ? '#fff' : COLORS.ink, 'center', 900);
    text(ctx, me ? `${name} (you)` : name, 76, y + 21, 16, COLORS.ink, 'left', 900);
    text(ctx, sub, 76, y + 41, 12, 'rgba(43,33,24,0.6)', 'left', 800);
    const t = deg > 0 ? tierFor(deg) : null;
    const dx = visit ? W - 128 : W - 44;
    text(ctx, deg > 0 ? `${deg.toFixed(1)}°N` : '—', dx, y + 22, 17, t ? t.color : 'rgba(43,33,24,0.4)', 'right', 900);
    text(ctx, t ? t.name : 'no sauce yet', dx, y + 41, 11, 'rgba(43,33,24,0.6)', 'right', 800);
    if (visit) this.game.button(ctx, `visit_${rank}`, W - 116, y + 10, 80, 36, 'Visit', visit, { color: '#5cb85c', dark: '#2f7a3b', size: 14 });
  }

  private async addByCode(): Promise<void> {
    const raw = await askText({ title: "Your friend's code", placeholder: 'e.g. K7M2QX', maxLength: 60, autocapitalize: 'characters', ok: 'Add friend' });
    const code = parseInvite(raw);
    if (!raw) return;
    if (!code) return this.game.toast('That is not a friend code', COLORS.bad, 'Codes are 6 letters and numbers');
    const api = await this.game.account?.socialApi();
    if (!api) return;
    try {
      const name = await api.addFriend(code);
      analytics.track('friend_added');
      sfx.upgrade();
      this.game.toast(`${name} is now your friend!`, COLORS.good, 'Visit their village to compare sauce');
      this.board = await api.friendsBoard();
      this.me = await api.mySocial();
    } catch (e) {
      this.game.toast('Could not add friend', COLORS.bad, (e as Error).message);
    }
  }

  // ---------- world top ----------
  private drawWorld(ctx: Ctx): void {
    text(ctx, "The world's best fish sauce", W / 2, 170, 15, 'rgba(43,33,24,0.7)', 'center', 800);
    if (!this.top) return this.message(ctx, 'Loading…');
    if (!this.top.length) return this.message(ctx, 'No sauce on the board yet. Open a jar and be the first!');
    const rows = this.top.filter((r) => r.rank <= 8 || r.me).slice(0, 9);
    rows.forEach((r, i) => this.boardRow(ctx, 186 + i * 62, r.rank, r.name, r.best_degrees, `Captain Lv ${r.captain_level}`, r.me, null));
    text(ctx, 'Players who aren’t your friends are shown by code.', W / 2, 780, 11, 'rgba(43,33,24,0.55)', 'center', 800);
  }

  // ---------- invite ----------
  private drawInvite(ctx: Ctx): void {
    const me = this.me!;
    const best = bestSauce(this.game.state).degrees;
    const url = inviteUrl(me.code);
    // your code
    ctx.fillStyle = '#fff';
    rr(ctx, 26, 162, W - 52, 118, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(43,33,24,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, 'YOUR FRIEND CODE', W / 2, 184, 12, 'rgba(43,33,24,0.6)', 'center', 900);
    outlinedText(ctx, me.code.split('').join(' '), W / 2, 220, 34, '#ffd34d', COLORS.ink, 6);
    this.game.button(ctx, 'copy_code', W / 2 - 60, 240, 120, 32, 'Copy code', () => void this.copy(me.code, 'Code copied'), { color: '#e9dfcf', dark: '#b9ab95', size: 13, textColor: COLORS.ink });

    // the deal
    text(ctx, 'Invite friends, both of you get coins:', 30, 304, 14, COLORS.ink, 'left', 900);
    drawCoin(ctx, 44, 330, 9);
    text(ctx, `${WELCOME_GIFT} for your friend when they join`, 60, 331, 13, COLORS.ink, 'left', 800);
    drawCoin(ctx, 44, 356, 9);
    text(ctx, `${INVITE_REWARD} for you when they sell their first bottle`, 60, 357, 13, COLORS.ink, 'left', 800);
    text(ctx, `Friends you invited: ${me.invites}`, 30, 384, 12, 'rgba(43,33,24,0.6)', 'left', 800);

    // share
    const msg = shareText(me.code, best);
    this.game.button(ctx, 'share_invite', 30, 400, W - 60, 52, '📤  Share invite (Zalo, Messenger…)', () => void this.share(msg, url, 'sheet'), { color: COLORS.good, dark: '#2f7a3b', size: 16, pulse: me.invites === 0 });
    this.game.button(ctx, 'share_fb', 30, 464, (W - 72) / 3, 42, 'Facebook', () => void this.share(msg, url, 'facebook'), { color: '#1877f2', dark: '#0f56b3', size: 14 });
    this.game.button(ctx, 'share_wa', 36 + (W - 72) / 3, 464, (W - 72) / 3, 42, 'WhatsApp', () => void this.share(msg, url, 'whatsapp'), { color: '#25a244', dark: '#1a7a32', size: 14 });
    this.game.button(ctx, 'share_copy', 42 + ((W - 72) / 3) * 2, 464, (W - 72) / 3, 42, 'Copy link', () => void this.copy(`${msg}\n${url}`, 'Invite copied'), { color: '#e9dfcf', dark: '#b9ab95', size: 14, textColor: COLORS.ink });

    // your name
    ctx.fillStyle = '#fff';
    rr(ctx, 26, 524, W - 52, 58, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(43,33,24,0.2)';
    ctx.stroke();
    text(ctx, 'Your captain name (friends see it)', 40, 544, 11, 'rgba(43,33,24,0.6)', 'left', 800);
    text(ctx, me.name, 40, 566, 18, COLORS.ink, 'left', 900);
    this.game.button(ctx, 'rename', W - 118, 534, 82, 36, 'Change', () => void this.rename(), { color: '#8a7a66', dark: '#5f5244', size: 14 });

    // joined with a code yet?
    if (me.can_redeem) {
      text(ctx, 'New here? Did a friend send you a code?', W / 2, 612, 14, COLORS.ink, 'center', 900);
      this.game.button(ctx, 'redeem', W / 2 - 120, 628, 240, 46, `Enter code  +${WELCOME_GIFT}`, () => void this.enterInvite(), { color: '#d4a017', dark: '#9c7410', size: 16, pulse: true });
    } else if (me.invited) text(ctx, 'You joined with a friend’s invite ✓', W / 2, 620, 13, COLORS.good, 'center', 900);
    text(ctx, 'Rewards are game coins only, paid once per friend.', W / 2, 780, 11, 'rgba(43,33,24,0.55)', 'center', 800);
  }

  private async share(msg: string, url: string, how: 'sheet' | 'facebook' | 'whatsapp'): Promise<void> {
    analytics.track('invite_share', { how });
    if (how === 'facebook') return openShareUrl(facebookShareUrl(url));
    if (how === 'whatsapp') return openShareUrl(whatsappShareUrl(msg, url));
    const r = await shareInvite(msg, url);
    if (r === 'copied') this.game.toast('Invite copied', COLORS.good, 'Paste it in Zalo, Messenger or any chat');
  }

  private async copy(s: string, what: string): Promise<void> {
    const ok = await copyText(s);
    this.game.toast(ok ? what : 'Could not copy', ok ? COLORS.good : COLORS.bad, ok ? 'Paste it in any chat' : undefined);
  }

  private async rename(): Promise<void> {
    const api = await this.game.account?.socialApi();
    const name = await askText({ title: 'Your captain name', initial: this.me?.name === 'Captain' ? '' : this.me?.name, placeholder: 'e.g. Captain Lan', maxLength: 20, ok: 'Save' });
    if (!api || !name || this.busy) return;
    this.busy = true;
    try {
      const saved = await api.setName(name);
      if (this.me) this.me.name = saved;
      this.board = await api.friendsBoard();
      this.game.toast('Name saved', COLORS.good, saved);
    } catch (e) {
      this.game.toast('Could not save that name', COLORS.bad, (e as Error).message);
    } finally {
      this.busy = false;
    }
  }

  private async enterInvite(): Promise<void> {
    const raw = await askText({ title: "Your friend's invite code", placeholder: 'e.g. K7M2QX', maxLength: 60, autocapitalize: 'characters', ok: 'Join' });
    if (!raw) return;
    const code = parseInvite(raw);
    if (!code) return this.game.toast('That is not a friend code', COLORS.bad, 'Codes are 6 letters and numbers');
    if (await redeem(this.game, code)) {
      const api = await this.game.account?.socialApi();
      if (api) [this.me, this.board] = await Promise.all([api.mySocial(), api.friendsBoard()]);
      this.tab = 'friends';
    }
  }
}

/** A friend's village: their best sauce against yours, their buildings, and fish they've caught that you haven't. */
export class FriendVisitOverlay implements Scene {
  name = 'friend_visit';
  covers3d = true;
  t = 0;
  private v: Visit | null = null;
  private error = '';

  constructor(
    private game: Game,
    private row: BoardRow,
  ) {
    analytics.track('friend_visit');
    void game.account
      ?.socialApi()
      .then((api) => api?.visitFriend(row.id))
      .then((v) => {
        this.v = v ?? null;
        if (v) sfx.upgrade();
      })
      .catch((e: Error) => (this.error = e.message));
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    ctx.fillStyle = 'rgba(20,15,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    panel(ctx, 12, 40, W - 24, 780, COLORS.paper, 24);
    outlinedText(ctx, `${this.row.name}'s village`, W / 2, 78, 24, '#fff', COLORS.ink, 6);
    this.game.button(ctx, 'close', W - 66, 54, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    if (this.error) return void text(ctx, this.error, W / 2, 240, 15, COLORS.bad, 'center', 800);
    const v = this.v;
    if (!v) return void text(ctx, 'Sailing over…', W / 2, 240, 16, COLORS.ink, 'center', 800);
    const s = this.game.state;
    text(ctx, `Captain Lv ${v.captain_level} · Brand ${v.brand_level} · Island ${v.island_level} · ${v.staff} staff${v.dog ? ' · has a dog' : ''}`, W / 2, 112, 12, 'rgba(43,33,24,0.7)', 'center', 800);

    // taste-off
    const mine = bestSauce(s);
    const theirs = bestSauce({ cellar: v.cellar });
    const res = tasteOff(mine.degrees, theirs.degrees);
    const k = ease.outBack(clamp01(this.t / 0.6));
    text(ctx, 'TASTE-OFF', W / 2, 140, 13, 'rgba(43,33,24,0.6)', 'center', 900);
    this.bottle(ctx, W / 2 - 92, 240, mine.degrees, 'You', recipeName(mine.recipe), res === 'win', k);
    this.bottle(ctx, W / 2 + 92, 240, theirs.degrees, this.row.name, recipeName(theirs.recipe), res === 'lose', k);
    outlinedText(ctx, 'vs', W / 2, 232, 22, '#fff', COLORS.ink, 5);
    const verdict = res === 'tie' ? 'A perfect tie!' : res === 'win' ? 'Your sauce wins!' : `${this.row.name}'s sauce wins!`;
    outlinedText(ctx, verdict, W / 2, 352, 22 * (0.9 + 0.1 * k), res === 'win' ? COLORS.gold : res === 'tie' ? '#fff' : '#ff9a7a', COLORS.ink, 5);
    if (res === 'lose') {
      text(ctx, `Brew ${(theirs.degrees - mine.degrees + 0.1).toFixed(1)}°N more to beat it.`, W / 2, 378, 12, 'rgba(43,33,24,0.75)', 'center', 900);
      text(ctx, 'Perfect catches, more salt and longer aging make stronger sauce.', W / 2, 394, 10, 'rgba(43,33,24,0.6)', 'center', 800);
    }

    // their buildings
    text(ctx, 'THEIR VILLAGE', 30, 418, 12, 'rgba(43,33,24,0.6)', 'left', 900);
    const bs = v.buildings.slice(0, 10);
    if (!bs.length) text(ctx, 'Just a fishing hut so far.', 30, 444, 13, COLORS.ink, 'left', 800);
    bs.forEach((b, i) => {
      const x = 30 + (i % 5) * 66;
      const y = 430 + Math.floor(i / 5) * 84;
      const img = islandImage('building', b.id, b.level);
      if (img) ctx.drawImage(img, x, y, 60, 60);
      text(ctx, `${BUILDINGS_BY_ID[b.id as BuildingId]?.name ?? b.id}`, x + 30, y + 66, 10, COLORS.ink, 'center', 800);
      text(ctx, `Lv ${b.level}`, x + 30, y + 78, 9, 'rgba(43,33,24,0.6)', 'center', 800);
    });

    // their Fishdex vs yours
    const mineDex = new Set(Object.keys(s.dex));
    const newToMe = v.dex.filter((id) => !mineDex.has(id));
    const y0 = 610;
    text(ctx, `FISHDEX  ${v.dex.length}/${SPECIES.length}  (you: ${mineDex.size})`, 30, y0, 12, 'rgba(43,33,24,0.6)', 'left', 900);
    if (newToMe.length) {
      text(ctx, `They caught ${newToMe.length} fish you haven't:`, 30, y0 + 24, 13, COLORS.ink, 'left', 900);
      const names = newToMe.map((id) => SPECIES.find((x) => x.id === id)?.name ?? id).slice(0, 6).join(', ');
      wrapText(ctx, names + (newToMe.length > 6 ? '…' : ''), W - 60).forEach((l, i) => text(ctx, l, 30, y0 + 46 + i * 18, 12, '#3a8fd9', 'left', 800));
    } else text(ctx, 'You have caught every fish they have. Nice!', 30, y0 + 24, 13, COLORS.good, 'left', 900);
    this.game.button(ctx, 'visit_back', W / 2 - 80, 744, 160, 46, 'Sail home', () => this.game.pop(this), { color: '#3a8fd9', dark: '#235f96', size: 16 });
  }

  private bottle(ctx: Ctx, x: number, y: number, deg: number, who: string, recipe: string, winner: boolean, k: number): void {
    const t = deg > 0 ? tierFor(deg) : TIERS[0];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    if (winner) {
      ctx.fillStyle = 'rgba(255,211,77,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 70 + Math.sin(this.t * 4) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // a simple bottle in the tier colour
    ctx.fillStyle = deg > 0 ? t.color : '#d6cfc2';
    rr(ctx, -24, -40, 48, 80, 14);
    ctx.fill();
    rr(ctx, -10, -64, 20, 28, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    rr(ctx, -24, -40, 48, 80, 14);
    ctx.stroke();
    rr(ctx, -10, -64, 20, 28, 6);
    ctx.stroke();
    ctx.fillStyle = '#fff8ec';
    rr(ctx, -20, -10, 40, 26, 6);
    ctx.fill();
    text(ctx, deg > 0 ? `${deg.toFixed(1)}°` : '—', 0, 3, 13, COLORS.ink, 'center', 900);
    ctx.restore();
    text(ctx, who, x, y + 60, 15, COLORS.ink, 'center', 900);
    text(ctx, deg > 0 ? `${t.name} · ${recipe}` : 'No sauce yet', x, y + 78, 11, 'rgba(43,33,24,0.65)', 'center', 800);
  }
}

function wrapText(ctx: Ctx, s: string, max: number): string[] {
  ctx.font = '800 15px "Trebuchet MS", system-ui, sans-serif';
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
