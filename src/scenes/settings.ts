// Settings & account: sign-in for cloud save, save-conflict choice, sound, graphics quality, privacy.
import { AccountManager, type SocialProvider } from '../auth/account';
import { isMusicOn, isMuted, setMusic, setMuted } from '../render/audio';
import { loadQualitySetting, type QualitySetting } from '../render3d/quality';
import { COLORS, H, W, clamp01, ease, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

const PROVIDER_STYLE: Record<SocialProvider, { label: string; color: string; dark: string; text: string }> = {
  google: { label: 'Continue with Google', color: '#ffffff', dark: '#c9c9c9', text: '#2b2118' },
  apple: { label: 'Continue with Apple', color: '#1d1d1f', dark: '#000000', text: '#ffffff' },
  facebook: { label: 'Continue with Facebook', color: '#1877f2', dark: '#0f56b3', text: '#ffffff' },
};

export class SettingsOverlay implements Scene {
  name = 'settings';
  covers3d = true;
  t = 0;
  /** Account deletion needs a second tap within a few seconds. */
  private confirmDeleteUntil = 0;

  constructor(private game: Game) {
    game.account?.prepareSocial();
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    const acc = this.game.account;
    ctx.fillStyle = 'rgba(20,15,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(this.t / 0.3));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(k, k);
    ctx.translate(-W / 2, -H / 2);
    panel(ctx, 12, 40, W - 24, 780, COLORS.paper, 24);
    outlinedText(ctx, 'Settings', W / 2, 78, 28, '#fff', COLORS.ink, 6);
    ctx.restore();
    this.game.button(ctx, 'close', W - 66, 54, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });

    // ----- Account -----
    let y = 120;
    text(ctx, 'ACCOUNT', 30, y, 12, 'rgba(43,33,24,0.6)', 'left', 900);
    y += 14;
    const cardH = !acc ? 110 : acc.conflict ? 250 : acc.canLink ? 236 : acc.signedIn ? 146 : acc.socialProviders.length ? 222 : 104;
    ctx.fillStyle = '#fff';
    rr(ctx, 26, y, W - 52, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(43,33,24,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!acc) return;
    if (acc.conflict) {
      this.drawConflict(ctx, acc, y);
      y += cardH + 30;
    } else if (acc.canLink) {
      // a backed-up guest (Supabase): progress is already safe; a social login carries it to other devices
      text(ctx, 'Guest · backed up to the cloud', 44, y + 24, 16, COLORS.ink, 'left', 900);
      const ago = acc.lastSynced ? Math.max(0, Math.round((Date.now() - acc.lastSynced) / 1000)) : -1;
      text(ctx, ago < 0 ? 'Not synced yet' : `Last saved ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)} min`} ago`, 44, y + 44, 11, 'rgba(43,33,24,0.6)', 'left', 600);
      text(ctx, 'Link an account to keep this village on any phone:', 44, y + 64, 11, COLORS.ink, 'left', 700);
      acc.socialProviders.forEach((p, i) => {
        const st = PROVIDER_STYLE[p];
        this.game.button(ctx, `link_${p}`, 44, y + 78 + i * 46, W - 88, 40, st.label, () => void acc.signIn(p), { color: st.color, dark: st.dark, textColor: st.text, size: 15, disabled: acc.busy });
      });
      if (acc.status) text(ctx, acc.status, W / 2, y + cardH - 10, 11, COLORS.bad, 'center', 700);
      y += cardH + 30;
    } else if (acc.signedIn) {
      text(ctx, `Signed in as ${acc.info.name}`, 44, y + 26, 16, COLORS.ink, 'left', 900);
      const via = acc.info.kind === 'claude' ? 'your Claude account' : PROVIDER_STYLE[acc.info.provider!].label.replace('Continue with ', '');
      text(ctx, `Progress is saved to the cloud via ${via}.`, 44, y + 50, 12, COLORS.ink, 'left', 600);
      const ago = acc.lastSynced ? Math.max(0, Math.round((Date.now() - acc.lastSynced) / 1000)) : -1;
      text(ctx, ago < 0 ? 'Not synced yet' : `Last synced ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)} min`} ago`, 44, y + 72, 11, 'rgba(43,33,24,0.6)', 'left', 600);
      this.game.button(ctx, 'syncnow', 44, y + 92, 140, 40, 'Sync now', () => {
        this.game.state.rev = (this.game.state.rev ?? 0); // no-op touch; flush uploads the latest
        this.game.commit();
        void acc.flush();
      }, { color: '#3a8fd9', dark: '#22609e', size: 15 });
      if (acc.info.kind === 'social') this.game.button(ctx, 'signout', 196, y + 92, 150, 40, 'Sign out', () => void acc.signOut(), { color: '#8a7a66', dark: '#5f5244', size: 15 });
      y += cardH + 30;
    } else {
      text(ctx, 'Playing as Guest', 44, y + 24, 16, COLORS.ink, 'left', 900);
      const providers = acc.socialProviders;
      if (providers.length) {
        text(ctx, 'Sign in to back up your village and play on any device.', 44, y + 46, 11, COLORS.ink, 'left', 600);
        providers.forEach((p, i) => {
          const st = PROVIDER_STYLE[p];
          this.game.button(ctx, `login_${p}`, 44, y + 62 + i * 46, W - 88, 40, st.label, () => void acc.signIn(p), { color: st.color, dark: st.dark, textColor: st.text, size: 15, disabled: acc.busy });
        });
      } else {
        text(ctx, 'Your progress is saved on this device.', 44, y + 48, 12, COLORS.ink, 'left', 600);
        text(ctx, 'Social sign-in (Google, Apple, Facebook) is coming', 44, y + 70, 11, 'rgba(43,33,24,0.6)', 'left', 600);
        text(ctx, 'to the app version of Mắm Village.', 44, y + 86, 11, 'rgba(43,33,24,0.6)', 'left', 600);
      }
      if (acc.status) text(ctx, acc.status, W / 2, y + cardH - 12, 11, COLORS.bad, 'center', 700);
      y += cardH + 30;
    }

    // ----- Sound -----
    text(ctx, 'SOUND', 30, y, 12, 'rgba(43,33,24,0.6)', 'left', 900);
    this.game.button(ctx, 'sound', W - 150, y - 16, 120, 34, isMuted() ? 'Off' : 'On', () => setMuted(!isMuted()), { color: isMuted() ? '#8a7a66' : COLORS.good, dark: isMuted() ? '#5f5244' : '#2f7a3b', size: 15 });
    y += 46;
    // the slow melody over the waves; the surf stays with Sound
    const mus = isMusicOn() && !isMuted();
    text(ctx, 'MUSIC', 30, y, 12, 'rgba(43,33,24,0.6)', 'left', 900);
    text(ctx, 'calm melody over the waves', 84, y, 10.5, 'rgba(43,33,24,0.5)', 'left', 600);
    this.game.button(ctx, 'music', W - 150, y - 16, 120, 34, mus ? 'On' : 'Off', () => setMusic(!isMusicOn()), { color: mus ? COLORS.good : '#8a7a66', dark: mus ? '#2f7a3b' : '#5f5244', size: 15, disabled: isMuted() });
    y += 46;

    // ----- Graphics -----
    text(ctx, 'GRAPHICS', 30, y, 12, 'rgba(43,33,24,0.6)', 'left', 900);
    const current = loadQualitySetting();
    const opts: [QualitySetting, string][] = [
      ['auto', 'Auto'],
      ['low', 'Low'],
      ['medium', 'Medium'],
      ['high', 'High'],
    ];
    const bw = (W - 60) / 4;
    opts.forEach(([q, label], i) => {
      const active = current === q;
      this.game.button(ctx, `q_${q}`, 30 + i * bw, y + 12, bw - 6, 40, label, () => this.game.setQuality(q), {
        color: active ? COLORS.accent : '#e8dcc6',
        dark: active ? COLORS.accentDark : '#b8a98f',
        textColor: active ? '#fff' : COLORS.ink,
        size: 14,
      });
    });
    const tier = this.game.world?.quality ?? 'high';
    text(ctx, current === 'auto' ? `Auto chose ${tier} for this device. Slow? Pick Low.` : 'Low saves battery and runs smoothly on old phones.', 30, y + 70, 11, 'rgba(43,33,24,0.65)', 'left', 600);
    y += 96;

    // ----- Privacy -----
    text(ctx, 'PRIVACY', 30, y, 12, 'rgba(43,33,24,0.6)', 'left', 900);
    const lines = [
      'We keep your game save and anonymous play statistics',
      '(which screens, how far you got) to improve the game.',
      'Accounts store a player id, your first name and how you sign in.',
      'No ads. We never use or sell your email (the login keeps it).',
    ];
    lines.forEach((l, i) => text(ctx, l, 30, y + 20 + i * 15, 11, COLORS.ink, 'left', 600));
    if (acc?.canDelete) {
      const armed = this.t < this.confirmDeleteUntil;
      this.game.button(ctx, 'delete_account', 30, y + 88, W - 60, 40, armed ? 'Tap again: delete everything' : 'Delete my account and progress', () => {
        if (!armed) {
          this.confirmDeleteUntil = this.t + 4;
          return;
        }
        this.confirmDeleteUntil = 0;
        void acc.deleteAccount().then((ok) => {
          if (ok) this.game.toast('Account deleted', COLORS.bad, 'Your cloud save is gone. A new village starts here.');
        });
      }, { color: armed ? COLORS.bad : '#e8dcc6', dark: armed ? '#8a2d22' : '#b8a98f', textColor: armed ? '#fff' : COLORS.bad, size: 14, disabled: acc.busy });
    }
  }

  private drawConflict(ctx: Ctx, acc: AccountManager, y: number): void {
    const c = acc.conflict!;
    text(ctx, 'Two saves found. Which village do you keep?', 44, y + 24, 14, COLORS.ink, 'left', 900);
    text(ctx, 'The other one will be replaced.', 44, y + 44, 11, COLORS.bad, 'left', 700);
    this.game.button(ctx, 'keep_local', 44, y + 62, W - 88, 76, 'This device', () => void acc.resolveConflict('local'), { color: '#2a9db5', dark: '#16677a', size: 18, sub: AccountManager.describe(c.local.state) });
    this.game.button(ctx, 'keep_cloud', 44, y + 152, W - 88, 76, 'Cloud save', () => void acc.resolveConflict('cloud'), { color: '#a35bd6', dark: '#6f3a96', size: 18, sub: AccountManager.describe(c.cloud.state) });
  }
}
