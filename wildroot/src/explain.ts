// "Why?" explanations, event log and discoveries, read straight from the simulation's
// recorded causes (no after-the-fact guessing).
import { SEASONS, checkGoals, type Run, type Snapshot } from './sim';


export type Subject = 'frogs' | 'fish' | 'mosquito' | 'dragonflies' | 'plants' | 'clarity';

export const SUBJECTS: { id: Subject; name: string; icon: string }[] = [
  { id: 'frogs', name: 'Ếch', icon: '🐸' },
  { id: 'fish', name: 'Cá', icon: '🐟' },
  { id: 'mosquito', name: 'Muỗi', icon: '🦟' },
  { id: 'dragonflies', name: 'Chuồn chuồn', icon: '🪰' },
  { id: 'plants', name: 'Cây nước', icon: '🌿' },
  { id: 'clarity', name: 'Nước trong', icon: '💧' },
];

export interface Cause { label: string; share: number; detail: string }
export interface Why { headline: string; causes: Cause[] }

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n = (v: number) => `${Math.round(v)}`;
export const when = (t: number) => (t === 0 ? 'Bắt đầu' : `Năm ${Math.floor((t - 1) / 4) + 1} · ${SEASONS[(t - 1) % 4]}`);

/** The spring snapshot (tadpole season) of the year that contains index i. */
function lastSpring(snaps: Snapshot[], i: number): Snapshot | undefined {
  for (let k = i; k >= 1; k--) if ((k - 1) % 4 === 0) return snaps[k];
  return undefined;
}

export function why(run: Run, i: number, subject: Subject): Why {
  const snaps = run.snaps;
  const s = snaps[i];
  const prev = snaps[Math.max(0, i - 4)];
  const trend = (a: number, b: number) => (b > a * 1.08 ? 'đang tăng' : b < a * 0.92 ? 'đang giảm' : 'khá ổn định');

  switch (subject) {
    case 'frogs': {
      const sp = lastSpring(snaps, Math.max(i, 1)) ?? snaps[1];
      const summer = snaps[Math.min(snaps.length - 1, sp.t + 1)];
      const winter = snaps.slice(1, i + 1).reverse().find((x) => x.winterLoss > 0);
      const causes: Cause[] = [
        { label: 'Nòng nọc bị cá ăn', share: sp.fishPred, detail: `Cá: ${n(sp.fish)} con · cây nước che chở nòng nọc: ${pct(sp.refuge)}` },
        { label: 'Nòng nọc thiếu oxy (tảo)', share: sp.oxygenLoss, detail: `Tảo phủ ${pct(sp.algae)} mặt ao` },
        { label: 'Vùng nước nông khô cạn', share: summer.shallowDry * 0.7, detail: `Hè: ${pct(summer.shallowDry)} vùng nông khô` },
        { label: 'Ếch chết rét mùa đông', share: winter?.winterLoss ?? 0.3, detail: winter && winter.winterLoss < 0.2 ? 'Có gỗ mục để trú đông' : 'Không có chỗ trú đông' },
        { label: 'Thiếu côn trùng để ăn', share: s.hunger * 3, detail: `Muỗi: ${n(s.mosquito)}` },
      ].sort((a, b) => b.share - a.share);
      return { headline: `${n(s.frogs)} con, ${trend(prev.frogs, s.frogs)}. Ếch con mới năm nay: ${n(summer.recruits)}.`, causes };
    }
    case 'fish': {
      const crowd = s.fish / s.fishCap;
      return {
        headline: `${n(s.fish)} con, ${trend(prev.fish, s.fish)}. Sức chứa của ao: ${n(s.fishCap)}.`,
        causes: [
          { label: 'Chỗ ở: diện tích nước sâu', share: crowd, detail: `Đang dùng ${pct(crowd)} sức chứa${run.actions.includes('reeds') ? ' (vùng nông có cây lấy bớt nước sâu)' : ''}` },
          { label: 'Bị người bắt mỗi xuân', share: run.actions.includes('removeFish') ? 0.45 : 0, detail: 'Bắt bớt 45% mỗi năm' },
          { label: 'Được cho ăn', share: run.actions.includes('feedFish') ? 0.6 : 0, detail: 'Sức chứa tăng 60%, nhưng chất thải làm nước giàu dinh dưỡng' },
        ].filter((c) => c.share > 0).sort((a, b) => b.share - a.share),
      };
    }
    case 'mosquito':
      return {
        headline: `${n(s.mosquito)}, ${trend(prev.mosquito, s.mosquito)}. Ba loài kiểm soát muỗi trong ao:`,
        causes: [
          { label: 'Cá ăn bọ gậy', share: s.mosqByFish, detail: `${n(s.fish)} cá · bọ gậy trốn được trong cây nước` },
          { label: 'Ấu trùng chuồn chuồn ăn bọ gậy', share: s.mosqByDragon, detail: `${n(s.dragonflies)} chuồn chuồn` },
          { label: 'Ếch ăn muỗi trưởng thành', share: s.mosqByFrog, detail: `${n(s.frogs)} ếch (không ăn vào mùa đông)` },
        ].sort((a, b) => b.share - a.share),
      };
    case 'dragonflies': {
      const perch = Math.min(1, s.plants * 4);
      const nymph = Math.min(1, 0.012 * s.fish * (1 - s.refuge));
      return {
        headline: `${n(s.dragonflies)} con. Chuồn chuồn cần cây để đẻ trứng và mồi để ăn.`,
        causes: [
          { label: 'Thiếu cây nước để đẻ trứng, đậu', share: 1 - perch, detail: `Cây nước phủ ${pct(s.plants)}` },
          { label: 'Ấu trùng bị cá ăn', share: nymph, detail: `${n(s.fish)} cá` },
          { label: 'Thiếu mồi', share: 1 - s.mosquito / (s.mosquito + 20), detail: `Muỗi: ${n(s.mosquito)}` },
        ].sort((a, b) => b.share - a.share),
      };
    }
    case 'plants': {
      const space = s.plantCap > 0 ? s.plants / s.plantCap : 1;
      return {
        headline: `Cây nước phủ ${pct(s.plants)} mặt ao (tối đa lúc này: ${pct(s.plantCap)}).`,
        causes: [
          { label: 'Thiếu chỗ mọc: chỉ mọc ở nước nông', share: 1 - s.plantCap, detail: run.actions.includes('reeds') ? 'Đã có vùng nông có cây' : 'Bờ ao dốc, ít nước nông' },
          { label: 'Tảo che ánh sáng', share: 0.5 * s.algae, detail: `Tảo ${pct(s.algae)}` },
          { label: 'Bóng cây ven bờ', share: run.actions.includes('shade') ? 0.27 : 0, detail: 'Cây ven bờ che bớt nắng' },
          { label: 'Đã gần kín chỗ', share: space > 0.9 ? 0.3 : 0, detail: `Đã dùng ${pct(space)} chỗ có thể mọc` },
        ].filter((c) => c.share > 0.01).sort((a, b) => b.share - a.share),
      };
    }
    case 'clarity':
      return {
        headline: `Nước trong ${pct(s.clarity)}. Tảo lớn nhanh khi nước giàu dinh dưỡng và nhiều nắng.`,
        causes: [
          { label: 'Chất thải của cá', share: Math.min(1, (0.0012 * s.fish) / 0.1), detail: `${n(s.fish)} cá` },
          { label: 'Thức ăn thừa cho cá', share: run.actions.includes('feedFish') ? 1 : 0, detail: 'Cho cá ăn mỗi mùa' },
          { label: 'Nước mưa cuốn đất xuống ao', share: 0.3 * s.rain, detail: `Mưa ${pct(s.rain)} mức thường` },
          { label: 'Cây nước hút dinh dưỡng (giúp nước trong)', share: Math.min(1, s.plants * 1.5), detail: `Cây nước ${pct(s.plants)}` },
          { label: 'Bóng cây ven bờ (giúp nước trong)', share: run.actions.includes('shade') ? 0.5 : 0, detail: 'Giảm nắng cho tảo' },
        ].filter((c) => c.share > 0.01).sort((a, b) => b.share - a.share),
      };
  }
}

// ---------- events ----------
export interface GameEvent { t: number; text: string; tone: 'good' | 'bad' | 'info'; icon: string; short: string }

export function events(run: Run): GameEvent[] {
  const out: GameEvent[] = [];
  const g = run.level.goal;
  const seen = new Set<string>();
  const once = (key: string, t: number, text: string, tone: GameEvent['tone'], icon = '', short = '') => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ t, text, tone, icon, short });
  };
  const snaps = run.snaps;
  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1];
    const s = snaps[i];
    if (s.recruits >= 25) once(`brood${s.year}`, i, `Lứa ếch con lớn: ${Math.round(s.recruits)} con lên bờ`, 'good', '🐸', `+${Math.round(s.recruits)}`);
    if (s.season === 1 && s.recruits < 4) once(`nobrood${s.year}`, i, 'Gần như không có ếch con nào sống sót', 'bad', '🥚', '×');
    if (a.frogs < g.frogsMin && s.frogs >= g.frogsMin) once('frogGoal', i, `Ếch vượt mục tiêu ${g.frogsMin}`, 'good', '⭐', '');
    if (s.frogs < 12 && a.frogs >= 12) once('frogLow', i, 'Ếch sắp biến mất khỏi ao', 'bad', '🐸', '↓');
    if (s.mosquito > 60 && a.mosquito <= 60) once(`mosq${s.year}`, i, 'Muỗi bùng phát', 'bad', '🦟', '!');
    if (s.dragonflies >= 8 && a.dragonflies < 8) once('drag', i, 'Chuồn chuồn kéo đến đẻ trứng', 'good', '🪰', '+');
    if (s.clarity < 0.5 && a.clarity >= 0.5) once(`bloom${s.year}`, i, 'Tảo nở hoa, nước xanh đục', 'bad', '🟢', '!');
    if (s.clarity >= 0.8 && a.clarity < 0.8) once('clear', i, 'Nước trong trở lại', 'good', '💧', '✓');
    if (s.shallowDry >= 0.4) once(`dry${s.year}`, i, `Vùng nước nông khô ${Math.round(s.shallowDry * 100)}%`, 'bad', '🏜️', '');
    if (s.plants >= 0.3 && a.plants < 0.3) once('plants', i, 'Cây nước phủ kín vùng nông', 'good', '🌿', '+');
  }
  const last = snaps[snaps.length - 1];
  const ok = checkGoals(run.level, last).every((c) => c.ok);
  out.push({ t: snaps.length - 1, text: ok ? 'Đạt mọi mục tiêu sau 5 năm' : 'Chưa đạt mục tiêu sau 5 năm', tone: ok ? 'good' : 'bad', icon: ok ? '🏆' : '', short: '' });
  return out.sort((x, y) => x.t - y.t);
}

// ---------- discoveries (Nature Discovery Journal, GDD 8.1) ----------
export interface Discovery {
  id: string;
  icon: string;
  concept: string;
  observation: string;
  evidence: (run: Run) => string;
  tryNext: string;
  reality: string;
  test: (run: Run) => boolean;
}

const max = (run: Run, k: keyof Snapshot) => Math.max(...run.snaps.map((s) => s[k] as number));
const last = (run: Run) => run.snaps[run.snaps.length - 1];
const has = (run: Run, a: string) => run.actions.includes(a as never);

export const DISCOVERIES: Discovery[] = [
  {
    id: 'predation',
    icon: '🐟',
    concept: 'Săn mồi',
    observation: 'Ếch đẻ trứng mỗi xuân, nhưng gần như không có ếch con.',
    evidence: (r) => `Cá ăn tới ${pct(max(r, 'fishPred'))} số nòng nọc.`,
    tryNext: 'Nòng nọc có thể trốn ở đâu?',
    reality: 'Ngoài tự nhiên, nhiều loài cá ăn trứng và nòng nọc. Ao có cá thường ít lưỡng cư hơn ao không có cá.',
    test: (r) => max(r, 'fishPred') >= 0.8 && last(r).frogs < 20,
  },
  {
    id: 'refuge',
    icon: '🌾',
    concept: 'Nơi ẩn náu',
    observation: 'Có cây nước ở vùng nông, nhiều nòng nọc sống sót hơn dù cá vẫn còn.',
    evidence: (r) => `Cây nước che chở ${pct(max(r, 'refuge'))} nòng nọc; lứa lớn nhất ${Math.round(max(r, 'recruits'))} ếch con.`,
    tryNext: 'Vùng nông có cây còn ảnh hưởng tới loài nào nữa?',
    reality: 'Vùng nước nông nhiều thực vật là nơi sinh sản quan trọng của nhiều loài lưỡng cư.',
    test: (r) => max(r, 'refuge') >= 0.7 && max(r, 'recruits') >= 20,
  },
  {
    id: 'root-cause',
    icon: '🩺',
    concept: 'Sửa nguyên nhân, không sửa triệu chứng',
    observation: 'Thả thêm ếch, nhưng vài năm sau ếch lại giảm.',
    evidence: (r) => `Bắt đầu 55 ếch, sau 5 năm còn ${Math.round(last(r).frogs)}.`,
    tryNext: 'Điều gì khiến ếch con không lớn được?',
    reality: 'Thả động vật không giải quyết được nguyên nhân khiến chúng suy giảm. Đừng thả sinh vật ra môi trường thật.',
    test: (r) => has(r, 'addFrogs') && last(r).frogs < 40,
  },
  {
    id: 'side-effect',
    icon: '🦟',
    concept: 'Hệ quả ngoài ý muốn',
    observation: 'Bớt cá thì ếch tăng, nhưng muỗi cũng tăng.',
    evidence: (r) => `Muỗi lên tới ${Math.round(max(r, 'mosquito'))} khi cá ít đi.`,
    tryNext: 'Loài nào khác cũng ăn bọ gậy?',
    reality: 'Cá ăn bọ gậy. Loại bỏ một loài săn mồi có thể làm con mồi của nó tăng lên.',
    test: (r) => has(r, 'removeFish') && max(r, 'mosquito') >= 45,
  },
  {
    id: 'eutrophication',
    icon: '🟢',
    concept: 'Phú dưỡng',
    observation: 'Cho cá ăn, nước chuyển xanh đục.',
    evidence: (r) => `Nước trong thấp nhất ${pct(Math.min(...r.snaps.map((s) => s.clarity)))}.`,
    tryNext: 'Cái gì có thể hút bớt dinh dưỡng trong nước?',
    reality: 'Thức ăn thừa và chất thải làm nước giàu dinh dưỡng, tảo phát triển mạnh và làm giảm oxy.',
    test: (r) => has(r, 'feedFish') && Math.min(...r.snaps.map((s) => s.clarity)) < 0.5,
  },
  {
    id: 'biocontrol',
    icon: '🪰',
    concept: 'Thiên địch',
    observation: 'Chuồn chuồn kéo đến và giữ muỗi ở mức thấp.',
    evidence: (r) => `Cao nhất ${Math.round(max(r, 'dragonflies'))} chuồn chuồn; ấu trùng ăn tới ${pct(max(r, 'mosqByDragon'))} bọ gậy.`,
    tryNext: 'Chuồn chuồn cần gì để ở lại?',
    reality: 'Ấu trùng chuồn chuồn sống dưới nước và ăn nhiều loại ấu trùng côn trùng, kể cả bọ gậy.',
    test: (r) => max(r, 'dragonflies') >= 8,
  },
  {
    id: 'trade-off',
    icon: '⚖️',
    concept: 'Đánh đổi',
    observation: 'Vùng nông có cây giúp ếch, nhưng ao còn ít chỗ cho cá.',
    evidence: (r) => `Sức chứa cá còn ${Math.round(last(r).fishCap)} (ban đầu 60).`,
    tryNext: 'Mục tiêu cần giữ cá ≥ 10. Cách nào giữ được cả hai?',
    reality: 'Mỗi kiểu sinh cảnh phù hợp với một nhóm loài. Không có cách bố trí nào tốt nhất cho mọi loài.',
    test: (r) => has(r, 'reeds') && last(r).fishCap < 45,
  },
  {
    id: 'microclimate',
    icon: '🌳',
    concept: 'Vi khí hậu',
    observation: 'Màn khô: cây ven bờ che bóng, vùng nông khô chậm hơn.',
    evidence: (r) => `Vùng nông khô tối đa ${pct(max(r, 'shallowDry'))}.`,
    tryNext: 'Ở màn ao thường, cây ven bờ có còn đáng giá không?',
    reality: 'Bóng cây làm giảm nhiệt độ và bốc hơi, giúp vùng nước nông giữ nước lâu hơn.',
    test: (r) => r.level.dry && has(r, 'shade'),
  },
];

export const newDiscoveries = (run: Run, known: Set<string>) => DISCOVERIES.filter((d) => !known.has(d.id) && d.test(run));
