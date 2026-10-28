// Tapping a goal or a mission goes where it can be done now (rules: goalTarget in ../src/core/goals.ts).
import { analytics } from '@core/analytics';
import { goalTarget, type GoalView } from '@core/goals';
import { agingLevel } from '@core/state';
import type { Nav } from './nav';
import { goTo } from './screens/Business';
import { game } from './store';
import { C } from './theme';

/** Tapping the goal goes where it can be done now (or to the step that gets there, with a note). */
export function goGoal(nav: Nav, g: GoalView): void {
  const s = game.state;
  const t = goalTarget(s, g);
  analytics.track('goal_go', { goal: g.id, to: t.to, upgrade: t.upgrade ?? '', app: 'react-native' });
  if (t.why) game.toast(t.why, C.accent, t.hint);
  const now = Date.now();
  switch (t.to) {
    case 'career':
      return goTo(nav, g.career!);
    case 'fish':
      return nav.go({ name: 'fishing' });
    case 'fill': {
      const i = s.jars.findIndex((j) => !j.sealed);
      if (i >= 0) nav.go({ name: 'fill', jar: i });
      return;
    }
    case 'open': {
      const i = s.jars.findIndex((j) => j.sealed && agingLevel(s, j, now) >= 1);
      if (i >= 0) nav.go({ name: 'reveal', jar: i });
      return;
    }
    case 'sell':
      return nav.go({ name: 'market', tab: 'sell' });
    case 'shop':
      return nav.go({ name: 'market', tab: 'gear', focus: t.upgrade });
    case 'dog':
      return nav.go({ name: 'dog' });
    case 'map':
      return nav.go({ name: 'seas' });
    case 'missions':
      return nav.go({ name: 'seas' });
  }
}
