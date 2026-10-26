// The game for React Native: the same GameState and rules as the web game (../src/core), the same save
// format (so cloud saves can move between web and app later), and a tiny subscribe API for React.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { analytics } from '@core/analytics';
import { checkCareer } from '@core/career';
import { checkGoals } from '@core/goals';
import { catchUp, tickIsland } from '@core/island';
import { makeRng, type Rng } from '@core/rng';
import { loadState, saveState } from '@core/save';
import { checkMissions, type GameState } from '@core/state';

export interface Toast {
  id: number;
  title: string;
  sub?: string;
  color: string;
}

class GameStore {
  state: GameState = loadState();
  readonly rng: Rng = makeRng(Date.now() % 1e9);
  toasts: Toast[] = [];
  private version = 0;
  private listeners = new Set<() => void>();
  private toastId = 0;

  constructor() {
    this.welcomeBack();
    analytics.funnelStep('first_launch');
    analytics.track('session_start', { trips: this.state.stats.trips, coins: this.state.coins, returning: this.state.stats.catches > 0, app: 'react-native' });
    // island staff keep working: a light tick every second, and a catch-up after the app was away
    setInterval(() => {
      if (!this.state.stats.sold) return;
      const r = tickIsland(this.state, 1, this.rng, Date.now());
      this.state.island.lastTick = Date.now();
      if (r.fish + r.salt + r.jars + r.bottles + r.coins > 0) this.changed();
    }, 1000);
    AppState.addEventListener('change', (st) => {
      if (st === 'active') this.welcomeBack();
      else saveState(this.state);
    });
  }

  /** Island staff output for the time the app was closed or in the background (capped by the rules). */
  welcomeBack(): void {
    const away = catchUp(this.state, this.rng, Date.now());
    if (away.fish + away.salt + away.jars + away.bottles + away.tourists > 0)
      this.toast('While you were away…', '#3a8fd9', `Staff: +${away.fish} fish, +${away.salt} salt, ${away.jars} jars, +${away.coins} coins`);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  snapshot = () => this.version;

  /** Something changed on screen (no rule checks). */
  changed(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** After a meaningful change: goals, missions, Road stages, then save (same order as the web game). */
  commit(): void {
    const s = this.state;
    for (const g of checkGoals(s)) {
      analytics.track('goal_complete', { goal: g.id, reward: g.reward });
      this.toast('Goal complete!', '#4cae5a', g.reward > 0 ? `${g.text}  +${g.reward}` : g.text);
    }
    for (const m of checkMissions(s)) {
      analytics.track('mission_complete', { mission: m.mission.id, sea: m.sea.id });
      this.toast(`Mission complete!  +${m.mission.reward.coins}`, '#3a8fd9', m.mission.text);
    }
    for (const up of checkCareer(s)) {
      analytics.track('career_stage', { stage: up.index + 1, title: up.stage.title });
      this.toast(`New title: ${up.stage.title}!`, '#e0a526', `+${up.stage.reward.coins} coins`);
    }
    saveState(s);
    this.changed();
  }

  toast(title: string, color: string, sub?: string): void {
    const t = { id: ++this.toastId, title, sub, color };
    this.toasts = [...this.toasts, t].slice(-3);
    this.changed();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.changed();
    }, 2600);
  }
}

export const game = new GameStore();
// browser QA only (web build): the test bot reads state the way the web game's __mam hook allows
if (typeof window !== 'undefined' && typeof document !== 'undefined') (globalThis as unknown as { __mamApp?: GameStore }).__mamApp = game;

/** Re-renders the component whenever the game changes; returns the live state. */
export function useGame(): GameState {
  useSyncExternalStore(game.subscribe, game.snapshot, game.snapshot);
  return game.state;
}
