// Tapping a goal or a mission goes where it can be done now (rules: goalTarget in core/goals.ts).
// If it can't be done yet (coins, fish), it goes to the step that gets there and says why.
import { analytics } from '../core/analytics';
import { UPGRADES_BY_ID } from '../core/data';
import { goalTarget, type GoalView } from '../core/goals';
import { agingLevel } from '../core/state';
import { COLORS } from '../render/draw';
import type { Game } from '../game';
import { goToGoal } from './career';
import { DogOverlay } from './dog';
import { JarFillOverlay, RevealOverlay } from './jar';
import { MarketOverlay } from './market';
import { MissionsOverlay } from './missions';

export function goGoal(game: Game, g: GoalView): void {
  const s = game.state;
  const t = goalTarget(s, g);
  analytics.track('goal_go', { goal: g.id, to: t.to, upgrade: t.upgrade ?? '' });
  if (t.why) game.toast(t.why, COLORS.accent, t.hint);
  const now = Date.now();
  switch (t.to) {
    case 'career':
      goToGoal(game, g.career!);
      break;
    case 'fish':
      game.goFishing(s.sea);
      break;
    case 'fill': {
      const i = s.jars.findIndex((j) => !j.sealed);
      if (i >= 0) game.push(new JarFillOverlay(game, i));
      break;
    }
    case 'open': {
      const i = s.jars.findIndex((j) => j.sealed && agingLevel(s, j, now) >= 1);
      if (i >= 0) game.push(new RevealOverlay(game, i));
      break;
    }
    case 'sell':
    case 'shop':
      game.push(new MarketOverlay(game, t.upgrade ? UPGRADES_BY_ID[t.upgrade].kind : undefined));
      break;
    case 'dog':
      game.push(new DogOverlay(game));
      break;
    case 'map':
      game.goMap();
      break;
    case 'missions':
      game.push(new MissionsOverlay(game));
      break;
  }
}
