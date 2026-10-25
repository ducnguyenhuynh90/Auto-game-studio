// Brand: the name on the bottle. Every bottle sold earns reputation; spending coins on the next brand
// stage (once the reputation is there) raises the price of every bottle, sold by you or by your staff.
// Stage 4 is real: Phú Quốc fish sauce carries a protected geographical indication.
import type { GameState } from './state';

export interface BrandStage {
  name: string;
  local: string;
  desc: string;
  /** Price multiplier on fish sauce. */
  mult: number;
  /** Reputation needed before this stage can be bought. */
  rep: number;
  cost: number;
}

export const BRAND_STAGES: BrandStage[] = [
  { name: 'Homemade Mắm', local: 'Mắm nhà làm', desc: 'Sold from the jar at the roadside.', mult: 1, rep: 0, cost: 0 },
  { name: 'Hand-drawn Label', local: 'Nhãn vẽ tay', desc: 'Lan draws a little fish on every bottle.', mult: 1.1, rep: 20, cost: 120 },
  { name: 'Mắm Bà Năm', local: 'Thương hiệu Bà Năm', desc: "Grandma's name on the label. People trust it.", mult: 1.25, rep: 80, cost: 500 },
  { name: 'Market Favourite', local: 'Được ưa chuộng', desc: 'Regulars ask for it by name.', mult: 1.4, rep: 250, cost: 1800 },
  { name: 'Phú Quốc Origin Seal', local: 'Chỉ dẫn địa lý Phú Quốc', desc: "Certified Phú Quốc origin: the island's protected name.", mult: 1.6, rep: 700, cost: 6000 },
  { name: 'Famous Across Vietnam', local: 'Nổi tiếng cả nước', desc: 'From Hà Nội to Sài Gòn, kitchens want it.', mult: 1.85, rep: 2000, cost: 15000 },
];

export interface BrandState {
  level: number;
  rep: number;
}

export function newBrand(): BrandState {
  return { level: 0, rep: 0 };
}

export function brandMult(s: GameState): number {
  return BRAND_STAGES[s.brand?.level ?? 0]?.mult ?? 1;
}

/** Stronger sauce builds the name faster: reputation per bottle grows with °N. */
export function repFor(degrees: number): number {
  return Math.max(1, Math.round(degrees / 5));
}

export function addReputation(s: GameState, degrees: number): number {
  const r = repFor(degrees);
  s.brand.rep += r;
  return r;
}

/** Why the next brand stage can't be bought yet (null = it can; 'max' at the top). */
export function brandProblem(s: GameState): string | null {
  const next = BRAND_STAGES[s.brand.level + 1];
  if (!next) return 'max';
  if (s.brand.rep < next.rep) return `Needs ${next.rep} reputation (sell more bottles)`;
  if (s.coins < next.cost) return `Needs ${next.cost} coins`;
  return null;
}

export function upgradeBrand(s: GameState): boolean {
  if (brandProblem(s)) return false;
  s.coins -= BRAND_STAGES[s.brand.level + 1].cost;
  s.brand.level++;
  return true;
}
