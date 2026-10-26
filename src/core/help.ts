// "How do I get this?": every requirement the game shows ("Needs 80 reputation", "Island Lv 2",
// "Shore only", "🔒 Stage 3", ...) explained with the player's own numbers and a button to the place
// that fixes it. Scenes show it with an ⓘ (scenes/info.ts).
import { BRAND_STAGES, repFor } from './brand';
import { CAREER, career } from './career';
import { islandLevel } from './island';
import { nextTeamGrowth } from './team';
import type { GameState } from './state';

export type HelpAction = 'market' | 'production' | 'island' | 'road' | 'puzzles' | 'fish' | 'map' | 'brand' | 'dog' | 'missions';

export interface Help {
  title: string;
  lines: string[];
  actions: { label: string; action: HelpAction }[];
}

const bestDeg = (s: GameState) => Math.max(0, ...s.shelf.map((p) => p.degrees), ...Object.values(s.cellar));

function coins(s: GameState, need: number): Help {
  return {
    title: 'How to earn coins',
    lines: [
      `You have ${s.coins} of the ${need} coins needed (${Math.max(0, need - s.coins)} to go).`,
      '• Sell fish sauce at the Market: stronger sauce (°N) sells for more.',
      '• A Sauce Shop with a Shopkeeper sells your staff’s bottles for you.',
      '• Goals, missions and chain catches pay coins too.',
    ],
    actions: [
      { label: 'Sell at Market', action: 'market' },
      { label: 'How it’s made', action: 'production' },
    ],
  };
}

function reputation(s: GameState, need: number): Help {
  const per = repFor(Math.max(15, bestDeg(s)));
  const left = Math.max(0, need - s.brand.rep);
  return {
    title: 'How to earn reputation',
    lines: [
      `You have ${s.brand.rep} of ${need} reputation.`,
      '• Every bottle sold adds reputation: by you at the Market, by your Shopkeeper, as a souvenir to tourists.',
      `• Stronger sauce adds more: °N ÷ 5 per bottle (a 20°N bottle = 4, a 35°N bottle = 7).`,
      `• About ${Math.ceil(left / per)} more bottles like your best (${per} each) gets you there.`,
      '• Export orders add 3 per bottle; tour groups spread the word too.',
    ],
    actions: [
      { label: 'Sell at Market', action: 'market' },
      { label: 'Stronger sauce', action: 'production' },
    ],
  };
}

/** Explains a requirement message from the rules (core/*Problem, seaLock, careerLock). */
export function explain(s: GameState, problem: string): Help {
  let m: RegExpMatchArray | null;
  if ((m = problem.match(/Needs (\d+) reputation/))) return reputation(s, Number(m[1]));
  if ((m = problem.match(/Needs (\d+) coins/))) return coins(s, Number(m[1]));
  if ((m = problem.match(/island level (\d+)|Island Lv (\d+)/i))) {
    const need = Number(m[1] ?? m[2]);
    return {
      title: 'How your island grows',
      lines: [
        `Your island is level ${islandLevel(s)}; this needs level ${need}.`,
        'Island level = 1, +1 for every 3 plots of land you buy, +1 for every 3 building levels (build or upgrade).',
        '• Buy land: tap a “+” plot next to your land.',
        '• Build something new, or upgrade a building (tap it).',
      ],
      actions: [{ label: 'Go to the island', action: 'island' }],
    };
  }
  if (/shore/i.test(problem) && /Keep this special shore|Shore jobs/.test(problem))
    return {
      title: 'Special shore plots',
      lines: ['This plot touches the sea. Shore plots are kept for jobs that need the water: a Fishing Dock or a Salt Field.', 'Build shops and houses on inland (green) plots.'],
      actions: [],
    };
  if (/shore/i.test(problem))
    return {
      title: 'Needs a shore plot',
      lines: ['Fishing Docks and Salt Fields must touch the sea.', '• Pick a sandy plot on the coast (the edge of the island).', '• No free shore plot? Buy one: tap a “+” plot on the beach next to your land.'],
      actions: [{ label: 'Go to the island', action: 'island' }],
    };
  if (/Old Pier/i.test(problem))
    return {
      title: 'The Old Pier',
      lines: ['The Trading Post can only be built on the Old Pier: a special coastal plot.', '• Buy land along the coast towards it; plots marked “?” hide something.', '• Locals say the old pier is on the island’s coast past the cove.'],
      actions: [{ label: 'Go to the island', action: 'island' }],
    };
  if (/Buy this plot/.test(problem))
    return { title: 'Buy the plot first', lines: ['Tap the plot, then Buy. You can buy plots that touch land you already own.'], actions: [] };
  if ((m = problem.match(/Unlocks when you are “(.*)”|Stage (\d+)/))) {
    const i = m[1] ? CAREER.findIndex((c) => c.title === m![1]) : Number(m[2]) - 1;
    const st = CAREER[i];
    return {
      title: `Unlocks at Stage ${i + 1}: ${st.title}`,
      lines: [
        `This opens when you become “${st.title}” on the Road to the World’s Best. You are at Stage ${career(s).stage + 1}.`,
        `${st.title} needs: ${st.goals.map((g) => g.text.toLowerCase()).join('; ')}.`,
        'Finish each stage’s four goals to become more famous and unlock more.',
      ],
      actions: [{ label: 'Open the Road', action: 'road' }],
    };
  }
  if ((m = problem.match(/Clear (\w+) puzzle (\d+)/)))
    return {
      title: 'Train staff with puzzles',
      lines: [
        `Staff can only learn what you can do: clear ${m[1]} puzzle ${m[2]} to train them to the next level.`,
        `Fishing puzzles train Fishers; Salt puzzles train Salt Makers and Brewers; Shop puzzles train Shopkeepers.`,
      ],
      actions: [{ label: 'Open Puzzles', action: 'puzzles' }],
    };
  if ((m = problem.match(/Feed Mực (\d+)/)))
    return { title: 'Mực needs to trust you', lines: [`Feed him ${m[1]} more fish first: tap Mực in the village. He eats the least valuable fish in your bucket.`], actions: [{ label: 'Go fishing', action: 'fish' }] };
  if (/better boat/.test(problem))
    return { title: 'A better boat', lines: ['Farther seas need a stronger boat.', '• Market → Gear → Boat: buy the next boat with coins.'], actions: [{ label: 'Open Market', action: 'market' }] };
  if (/story first/.test(problem))
    return { title: 'Finish the story here first', lines: ['Each sea has 4 missions. Finish them to earn its relic and open the next sea.', 'Captain’s Log shows them, with progress.'], actions: [{ label: 'Captain’s Log', action: 'missions' }] };
  if ((m = problem.match(/Team full \((\d+)\/(\d+)\)/)))
    return {
      title: 'Your team is full',
      lines: [
        `You have ${m[1]} staff and room for ${m[2]}. Your team grows as you get famous:`,
        '• Start: room for 2.',
        '• +2 for every stage of the Road to the World’s Best.',
        '• +1 for every brand stage.',
        `Next: ${nextTeamGrowth(s)}.`,
      ],
      actions: [
        { label: 'Open the Road', action: 'road' },
        { label: 'Brand', action: 'brand' },
      ],
    };
  if ((m = problem.match(/Build a (.*) first/)))
    return {
      title: `First, build a ${m[1]}`,
      lines: [`Staff need a place to work. Build a ${m[1]} on your island, then hire here.`, 'Each building has places for staff: 1 at Lv 1, one more for every upgrade.'],
      actions: [{ label: 'Go to the island', action: 'island' }],
    };
  if ((m = problem.match(/Every place at your (.*) is taken/)))
    return {
      title: `Your ${m[1]} is full`,
      lines: [`Each building has room for as many staff as its level. Upgrade your ${m[1]} (tap it on the island) or build a second one.`],
      actions: [{ label: 'Go to the island', action: 'island' }],
    };
  if (/Top level/.test(problem)) return { title: 'Top level', lines: ['This staff member is fully trained. More levels come with more puzzle levels.'], actions: [] };
  return { title: 'What’s needed', lines: [problem], actions: [] };
}

/** The brand screen's next stage: both needs, explained at once. */
export function explainBrand(s: GameState): Help {
  const next = BRAND_STAGES[s.brand.level + 1];
  if (!next) return { title: 'Top brand', lines: ['Your name is known across Vietnam. Nothing left to buy here.'], actions: [] };
  const rep = reputation(s, next.rep);
  const lines = [`“${next.name}” makes every bottle sell for ×${next.mult.toFixed(2)}.`, `It needs ${next.rep} reputation and ${next.cost} coins.`];
  if (s.brand.rep < next.rep) lines.push(...rep.lines);
  else lines.push('✓ Reputation is there.');
  if (s.coins < next.cost) lines.push(`• Coins: you have ${s.coins} of ${next.cost}. Sell bottles, or let your shop sell staff bottles.`);
  else lines.push('✓ You have the coins.');
  return { title: `Next: ${next.name}`, lines, actions: rep.actions };
}
