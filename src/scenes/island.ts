// The island business map (tycoon layer): buy plots, place buildings, hire and train staff.
// Staff work in every scene (Game.tickIsland); this screen shows where and what they make.
import { analytics } from '../core/analytics';
import { villageStage } from '../core/evolution';
import {
  BUILDINGS,
  BUILDINGS_BY_ID,
  COLS,
  DISCOVERY,
  HOME,
  ROLE,
  ROWS,
  bucketCap,
  build,
  buildingAt,
  buildingUpgradeCost,
  buyPlot,
  canExpand,
  charm,
  hire,
  hireCost,
  islandLevel,
  placeProblem,
  plotCost,
  saltCap,
  slots,
  staffAt,
  staffUpgradeCost,
  terrain,
  trainProblem,
  trainStaff,
  upgradeBuilding,
  dismiss,
  ledger,
  upkeepPerHour,
  wage,
  wagesPerHour,
  type Building,
  type Terrain,
} from '../core/island';
import { SCENES } from '../core/story';
import { sfx } from '../render/audio';
import { COLORS, H, W, drawCoin, drawFish, font, islandImage, outlinedText, panel, rr, stageImage, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';
import { PuzzleHubOverlay } from './puzzles';
import { MarketOverlay } from './market';
import { BrandOverlay } from './brand';
import { BRAND_STAGES } from '../core/brand';
import { StoryOverlay } from './story';

const TILE = 50;
const MX = (W - COLS * TILE) / 2;
const MY = 112;
const PANEL_Y = MY + ROWS * TILE + 10;

const GROUND: Record<Terrain, string> = { '~': '#2aa3b9', b: '#f2dca0', c: '#f2dca0', s: '#eef3f0', p: '#e8cf94', g: '#9fd36f', f: '#7fbf5a', H: '#9fd36f', t: '#9fd36f', w: '#9fd36f' };

export class IslandScene implements Scene {
  name = 'island';
  covers3d = true;
  t = 0;
  selected: number | null = null;
  private introChecked = false;

  constructor(
    private game: Game,
    tile?: number,
  ) {
    if (tile !== undefined) this.selected = tile;
    game.islandOut = { fish: 0, salt: 0, jars: 0, bottles: 0, coins: 0 };
    analytics.track('island_open', { level: islandLevel(game.state), staff: game.state.island.staff.length });
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.introChecked && this.t > 0.4) {
      this.introChecked = true;
      const sc = SCENES.find((x) => x.id === 'island_intro');
      if (sc && !this.game.state.storySeen.includes(sc.id)) this.game.push(new StoryOverlay(this.game, [sc]));
    }
    // staff output floats up from the building that made it
    const out = this.game.islandOut;
    const at = (id: string) => this.game.state.island.buildings.find((b) => b.id === id);
    const pop = (id: string, msg: string, color: string) => {
      const b = at(id);
      if (!b) return;
      const p = this.tileXY(b.tile);
      this.game.float(p.x + TILE / 2, p.y + 6, msg, color, 16);
    };
    if (out.fish) pop('dock', `+${out.fish} fish`, '#bfe9f2');
    if (out.salt) pop('saltfield', `+${out.salt} salt`, '#ffffff');
    if (out.jars) pop('brewhouse', `+${out.jars} jar`, '#e8b07a');
    if (out.bottles) pop('shop', `+${out.coins} coins`, COLORS.gold);
    this.game.islandOut = { fish: 0, salt: 0, jars: 0, bottles: 0, coins: 0 };
  }

  private tileXY(tile: number): { x: number; y: number } {
    return { x: MX + (tile % COLS) * TILE, y: MY + Math.floor(tile / COLS) * TILE };
  }

  down(x: number, y: number): void {
    const c = Math.floor((x - MX) / TILE);
    const r = Math.floor((y - MY) / TILE);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    const tile = r * COLS + c;
    if (terrain(tile) === '~') {
      this.selected = null;
      return;
    }
    this.selected = tile;
    sfx.tap();
  }

  draw(ctx: Ctx): void {
    // sea
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5cc6d8');
    g.addColorStop(1, '#1f8aa6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const wy = 100 + i * 52 + Math.sin(this.t + i) * 4;
      const wx = ((i * 97 + this.t * 12) % (W + 80)) - 40;
      ctx.beginPath();
      ctx.arc(wx, wy, 10, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    this.drawMap(ctx);
    this.drawHud(ctx);
    this.drawPanel(ctx);
  }

  private drawHud(ctx: Ctx): void {
    const s = this.game.state;
    this.game.button(ctx, 'back', 10, 12, 86, 42, '‹ Village', () => this.game.goVillage(), { color: '#8a7a66', dark: '#5f5244', size: 15 });
    panel(ctx, 104, 12, 118, 42, 'rgba(255,248,236,0.96)', 14);
    drawCoin(ctx, 124, 33, 11);
    text(ctx, String(s.coins), 140, 34, 18, COLORS.ink, 'left', 900);
    this.game.button(ctx, 'puzzles', W - 160, 12, 150, 42, 'Puzzles', () => this.game.push(new PuzzleHubOverlay(this.game)), { color: '#a35bd6', dark: '#6f3a96', size: 18, pulse: s.puzzles.fishing.length + s.puzzles.salt.length + s.puzzles.shop.length === 0 });
    panel(ctx, 10, 62, W - 20, 40, 'rgba(255,248,236,0.93)', 12);
    const items = [`Island Lv ${islandLevel(s)}`, `Fish ${s.bucket.length}/${bucketCap(s)}`, `Salt ${s.island.salt}/${saltCap(s)}`, `Staff ${s.island.staff.length}`, `Charm ${charm(s)}`];
    const step = (W - 20) / items.length;
    items.forEach((it, i) => text(ctx, it, 10 + step * i + step / 2, 82, 12, COLORS.ink, 'center', 900));
  }

  private drawMap(ctx: Ctx): void {
    const s = this.game.state;
    const isl = s.island;
    const cost = plotCost(s);
    for (let tile = 0; tile < COLS * ROWS; tile++) {
      const t = terrain(tile);
      if (t === '~') continue;
      const { x, y } = this.tileXY(tile);
      const owned = isl.owned.includes(tile);
      // sandy rim so the island reads as one landmass
      ctx.fillStyle = '#e9cf8f';
      rr(ctx, x - 2, y - 2, TILE + 4, TILE + 4, 12);
      ctx.fill();
      ctx.fillStyle = GROUND[t];
      rr(ctx, x + 1, y + 1, TILE - 2, TILE - 2, 10);
      ctx.fill();
      if (t === 'f' || (t === 'g' && tile % 3 === 0)) {
        // palms / bushes
        ctx.fillStyle = t === 'f' ? '#3f8f3a' : 'rgba(63,143,58,0.5)';
        for (let k = 0; k < (t === 'f' ? 3 : 1); k++) {
          ctx.beginPath();
          ctx.arc(x + 12 + k * 13, y + 14 + (k % 2) * 16, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (owned && t === 's') {
        ctx.fillStyle = '#bfe4ee';
        for (let k = 0; k < 4; k++) ctx.fillRect(x + 7 + (k % 2) * 19, y + 7 + Math.floor(k / 2) * 19, 16, 16);
      }
      if (owned && t === 'c' && !buildingAt(s, tile)) drawFish(ctx, 'anchovy', x + TILE / 2, y + TILE / 2 + 6, 26, { wiggle: this.t * 4 });
      if (owned && t === 'p' && !buildingAt(s, tile)) {
        ctx.fillStyle = '#8f6638';
        for (let k = 0; k < 4; k++) ctx.fillRect(x + 8 + k * 9, y + 10, 6, 30);
      }
      if (tile === HOME) {
        const img = stageImage('village', villageStage(s));
        if (img) ctx.drawImage(img, x - 22, y - 30, TILE + 44, TILE + 44);
      }
      const b = buildingAt(s, tile);
      if (b) this.drawBuilding(ctx, b, x, y);
      if (!owned) {
        // fog of the unexplored island
        const open = canExpand(s, tile);
        ctx.fillStyle = open ? 'rgba(240,244,246,0.72)' : 'rgba(90,110,120,0.72)';
        rr(ctx, x - 1, y - 1, TILE + 2, TILE + 2, 10);
        ctx.fill();
        if (open) {
          if (DISCOVERY[t]) outlinedText(ctx, '?', x + TILE - 10, y + 11, 15, COLORS.gold, COLORS.ink, 3);
          text(ctx, '+', x + TILE / 2, y + 18, 18, COLORS.ink, 'center', 900);
          text(ctx, String(cost), x + TILE / 2, y + 37, 11, s.coins >= cost ? COLORS.ink : COLORS.bad, 'center', 900);
        }
      }
      if (this.selected === tile) {
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 4;
        rr(ctx, x, y, TILE, TILE, 10);
        ctx.stroke();
      }
    }
  }

  private drawBuilding(ctx: Ctx, b: Building, x: number, y: number): void {
    const img = islandImage('building', b.id, b.level);
    const bob = Math.sin(this.t * 2 + b.tile) * 1.5;
    if (img) ctx.drawImage(img, x - 8, y - 12 + bob, TILE + 16, TILE + 16);
    else {
      ctx.fillStyle = '#b98a52';
      rr(ctx, x + 8, y + 10, TILE - 16, TILE - 18, 6);
      ctx.fill();
    }
    // staff dots: filled = hired
    const n = slots(b);
    const hired = staffAt(this.game.state, b.tile).length;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < hired ? COLORS.good : 'rgba(43,33,24,0.25)';
      ctx.beginPath();
      ctx.arc(x + 8 + i * 9, y + TILE - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (b.level > 1) text(ctx, `${b.level}`, x + TILE - 7, y + 8, 11, '#fff', 'center', 900);
  }

  // ---------- Bottom panel ----------
  private drawPanel(ctx: Ctx): void {
    panel(ctx, 8, PANEL_Y, W - 16, H - PANEL_Y - 8, COLORS.paper, 18);
    const sel = this.selected;
    const s = this.game.state;
    if (sel === null) return this.drawOverview(ctx);
    const owned = s.island.owned.includes(sel);
    if (!owned) return this.drawPlot(ctx, sel);
    if (sel === HOME) {
      text(ctx, 'Mắm Village', W / 2, PANEL_Y + 28, 20, COLORS.ink, 'center', 900);
      text(ctx, 'Your home, your jars and Bà Năm.', W / 2, PANEL_Y + 54, 13, COLORS.ink, 'center', 600);
      this.game.button(ctx, 'tovillage', W / 2 - 100, PANEL_Y + 80, 200, 54, 'Go to village', () => this.game.goVillage(), { color: COLORS.good, dark: '#2f7a3b', size: 18 });
      return;
    }
    const b = buildingAt(s, sel);
    if (b) return this.drawBuildingPanel(ctx, b);
    this.drawBuildMenu(ctx, sel);
  }

  private drawOverview(ctx: Ctx): void {
    const s = this.game.state;
    const m = s.island.made;
    text(ctx, 'Your fish sauce business', W / 2, PANEL_Y + 22, 17, COLORS.ink, 'center', 900);
    if (!s.island.staff.length && !s.island.buildings.length) {
      text(ctx, 'Staff fish, rake salt, brew and sell for you, even while you are away.', W / 2, PANEL_Y + 48, 11.5, COLORS.ink, 'center', 600);
      text(ctx, 'Start with a Fishing Dock or a Salt Field on the shore.', W / 2, PANEL_Y + 66, 11.5, COLORS.ink, 'center', 600);
    } else {
      // the ledger: what the business makes and costs per hour
      const l = ledger(s);
      const income = Math.round(l.incomeRate);
      const wages = wagesPerHour(s);
      const upkeep = upkeepPerHour(s);
      const net = income - wages - upkeep;
      const cols: [string, string, string][] = [
        ['Income', `+${income}/h`, COLORS.good],
        ['Wages', `−${wages}/h`, COLORS.bad],
        ['Upkeep', `−${upkeep}/h`, COLORS.bad],
        ['Net', `${net >= 0 ? '+' : '−'}${Math.abs(net)}/h`, net >= 0 ? COLORS.good : COLORS.bad],
      ];
      const cw = (W - 40) / 4;
      cols.forEach(([label, v, c], i) => {
        const x = 20 + cw * i + cw / 2;
        text(ctx, label, x, PANEL_Y + 44, 10, 'rgba(43,33,24,0.6)', 'center', 900);
        text(ctx, v, x, PANEL_Y + 62, 15, c, 'center', 900);
      });
      text(ctx, `So far: ${m.fish} fish · ${m.salt} salt · ${m.jars} jars · ${m.bottles} bottles · earned ${l.income} · paid ${Math.round(l.wages + l.upkeep)}`, W / 2, PANEL_Y + 84, 9.5, 'rgba(43,33,24,0.7)', 'center', 700);
      if (s.island.unpaid) text(ctx, 'Not enough coins for wages! Staff have stopped. Sell something.', W / 2, PANEL_Y + 102, 11.5, COLORS.bad, 'center', 900);
      else text(ctx, income === 0 && wages > 0 ? 'Income shows once your shop sells (a dock alone only costs).' : 'Staff keep working while you play or rest (up to 4 h).', W / 2, PANEL_Y + 102, 10.5, 'rgba(43,33,24,0.7)', 'center', 700);
    }
    const brand = BRAND_STAGES[s.brand.level];
    this.game.button(ctx, 'ov_sell', 20, PANEL_Y + 118, (W - 52) / 2, 46, s.shelf.length ? `Sell (${s.shelf.length})` : 'Market', () => this.game.push(new MarketOverlay(this.game)), { color: '#e67e22', dark: '#a85a14', size: 15, pulse: s.shelf.length > 0 });
    this.game.button(ctx, 'ov_brand', 32 + (W - 52) / 2, PANEL_Y + 118, (W - 52) / 2, 46, `Brand ×${brand.mult.toFixed(2)}`, () => this.game.push(new BrandOverlay(this.game)), { color: '#a35bd6', dark: '#6f3a96', size: 15, sub: `rep ${s.brand.rep}` });
    text(ctx, 'Tap land to build or buy · solve Puzzles to train staff', W / 2, PANEL_Y + 186, 11.5, '#7a5aa8', 'center', 900);
    if (s.island.freeHires > 0) text(ctx, `Cousin Út will work for free: ${s.island.freeHires} free hire`, W / 2, PANEL_Y + 206, 12, COLORS.good, 'center', 900);
  }

  private drawPlot(ctx: Ctx, tile: number): void {
    const s = this.game.state;
    const t = terrain(tile);
    const open = canExpand(s, tile);
    const cost = plotCost(s);
    text(ctx, 'Wild plot', W / 2, PANEL_Y + 26, 20, COLORS.ink, 'center', 900);
    const kind = t === 'f' ? 'A palm grove.' : t === 'b' || t === 'c' || t === 's' || t === 'p' ? 'Shore land: good for docks and salt.' : 'Open grassland.';
    text(ctx, kind, W / 2, PANEL_Y + 52, 13, COLORS.ink, 'center', 600);
    // honest rumours: the map is fixed, so special plots are hinted before you pay
    if (DISCOVERY[t]) text(ctx, 'Locals say there is something special here…', W / 2, PANEL_Y + 74, 12, '#b8860b', 'center', 900);
    if (!open) {
      text(ctx, 'Buy the land next to it first.', W / 2, PANEL_Y + 110, 14, COLORS.bad, 'center', 900);
      return;
    }
    this.game.button(ctx, 'buyplot', W / 2 - 110, PANEL_Y + 96, 220, 58, `Buy ${cost}`, () => this.buy(tile), { color: COLORS.good, dark: '#2f7a3b', size: 20, coin: true, disabled: s.coins < cost });
  }

  private buy(tile: number): void {
    const s = this.game.state;
    const res = buyPlot(s, tile);
    if (!res.ok) return;
    sfx.upgrade();
    analytics.track('plot_buy', { tile, terrain: terrain(tile), owned: s.island.owned.length });
    const { x, y } = this.tileXY(tile);
    this.game.particles.burst(x + TILE / 2, y + TILE / 2, 24, ['#ffffff', COLORS.gold, '#9fd36f'], { speed: 160, size: 5, up: true, g: 300, life: 0.8 });
    if (res.found) {
      this.game.toast(`Found: ${res.found.name}!`, '#b8860b', res.found.desc);
      sfx.rare();
    }
    this.game.commit();
  }

  private drawBuildMenu(ctx: Ctx, tile: number): void {
    const s = this.game.state;
    text(ctx, 'Build here', W / 2, PANEL_Y + 20, 16, COLORS.ink, 'center', 900);
    const cw = (W - 40) / 4;
    const ch = 104;
    BUILDINGS.forEach((def, i) => {
      const x = 20 + (i % 4) * cw;
      const y = PANEL_Y + 34 + Math.floor(i / 4) * (ch + 6);
      const problem = placeProblem(s, tile, def.id);
      ctx.fillStyle = problem ? 'rgba(43,33,24,0.08)' : '#fff';
      rr(ctx, x + 2, y, cw - 4, ch, 12);
      ctx.fill();
      ctx.strokeStyle = problem ? 'rgba(43,33,24,0.2)' : COLORS.good;
      ctx.lineWidth = 2;
      ctx.stroke();
      const img = islandImage('building', def.id, 1);
      ctx.save();
      if (problem) ctx.globalAlpha = 0.45;
      if (img) ctx.drawImage(img, x + cw / 2 - 26, y + 2, 52, 52);
      ctx.restore();
      ctx.font = font(10, 900);
      text(ctx, def.name, x + cw / 2, y + 62, def.name.length > 11 ? 9.5 : 10.5, COLORS.ink, 'center', 900);
      if (problem && !problem.startsWith('Needs ' + def.cost)) {
        const short = problem.replace('Needs island level', 'Island Lv').replace('Needs a shore plot', 'Shore only').replace('Needs the Old Pier', 'Old Pier only').replace('Keep this special shore for a dock or salt field', 'Shore jobs only');
        text(ctx, short, x + cw / 2, y + 82, 9.5, COLORS.bad, 'center', 900);
      } else {
        drawCoin(ctx, x + cw / 2 - 18, y + 83, 6);
        text(ctx, String(def.cost), x + cw / 2 + 4, y + 84, 12, s.coins >= def.cost ? COLORS.ink : COLORS.bad, 'center', 900);
      }
      if (!problem)
        this.game.hitArea(`build_${def.id}`, x + 2, y, cw - 4, ch, () => {
          if (!build(s, tile, def.id)) return;
          sfx.upgrade();
          analytics.track('building_build', { id: def.id, terrain: terrain(tile), level: islandLevel(s) });
          const p = this.tileXY(tile);
          this.game.particles.burst(p.x + TILE / 2, p.y + TILE / 2, 30, [COLORS.gold, '#fff'], { speed: 200, kind: 'star', size: 6, g: 300, life: 1 });
          this.game.toast(`${def.name} built!`, COLORS.good, def.role ? `Tap it to hire a ${ROLE[def.role].title}` : def.desc);
          this.game.commit();
        });
    });
  }

  private drawBuildingPanel(ctx: Ctx, b: Building): void {
    const s = this.game.state;
    const def = BUILDINGS_BY_ID[b.id];
    const img = islandImage('building', b.id, b.level);
    if (img) ctx.drawImage(img, 18, PANEL_Y + 6, 64, 64);
    text(ctx, `${def.name}${def.upgrade.length ? `  Lv ${b.level}` : ''}`, 90, PANEL_Y + 22, 17, COLORS.ink, 'left', 900);
    text(ctx, def.local, 90, PANEL_Y + 40, 11, 'rgba(43,33,24,0.6)', 'left', 700);
    const t = terrain(b.tile);
    const bonus = b.id === 'dock' && t === 'c' ? ' (Cove: +25% speed)' : b.id === 'saltfield' && t === 's' ? ' (Salt Flat: +50%)' : '';
    text(ctx, def.desc + bonus, 90, PANEL_Y + 58, 10.5, COLORS.ink, 'left', 600);
    const upCost = buildingUpgradeCost(b);
    if (upCost !== null)
      this.game.button(ctx, 'bup', W - 128, PANEL_Y + 4, 110, 34, `Lv ${b.level + 1}: ${upCost}`, () => {
        const before = b.level;
        if (!this.upgradeBuilding(b.tile)) return;
        analytics.track('building_upgrade', { id: b.id, level: before + 1 });
      }, { color: '#3a8fd9', dark: '#22609e', size: 12, disabled: s.coins < upCost });
    const role = def.role;
    if (b.id === 'shop') {
      // your own bottles are sold here too (staff only sell what staff brewed)
      const by = H - 66;
      this.game.button(ctx, 'shop_sell', 20, by, (W - 52) / 2, 46, s.shelf.length ? `Sell my bottles (${s.shelf.length})` : 'Market', () => this.game.push(new MarketOverlay(this.game)), { color: '#e67e22', dark: '#a85a14', size: 14, pulse: s.shelf.length > 0 });
      this.game.button(ctx, 'shop_brand', 32 + (W - 52) / 2, by, (W - 52) / 2, 46, `Brand ×${BRAND_STAGES[s.brand.level].mult.toFixed(2)}`, () => this.game.push(new BrandOverlay(this.game)), { color: '#a35bd6', dark: '#6f3a96', size: 14 });
    }
    if (!role) {
      const extra = b.id === 'warehouse' ? `Storage: ${bucketCap(s)} fish, ${saltCap(s)} salt.` : def.charm ? `Charm ${charm(s)}: staff-sold bottles +${Math.min(30, charm(s) * 2)}%.` : '';
      text(ctx, extra, W / 2, PANEL_Y + 110, 13, COLORS.ink, 'center', 900);
      return;
    }
    const staff = staffAt(s, b.tile);
    staff.forEach((st, i) => {
      const y = PANEL_Y + 76 + i * 50;
      ctx.fillStyle = '#fff';
      rr(ctx, 16, y, W - 32, 46, 12);
      ctx.fill();
      const pimg = islandImage('worker', st.role);
      if (pimg) ctx.drawImage(pimg, 18, y - 4, 50, 50);
      text(ctx, `${st.name} · ${ROLE[st.role].title} Lv ${st.level}`, 72, y + 15, 13, COLORS.ink, 'left', 900);
      text(ctx, `${ROLE[st.role].perk(st.level)} · wage ${wage(st)}/h`, 72, y + 33, 9.5, 'rgba(43,33,24,0.75)', 'left', 700);
      // let staff go to cut costs
      this.game.button(ctx, `dismiss_${st.uid}`, W - 132, y + 10, 24, 26, '×', () => {
        if (!dismiss(s, st.uid)) return;
        analytics.track('staff_dismiss', { role: st.role, level: st.level });
        this.game.toast(`${st.name} has gone home`, '#8a7a66', 'Their wage stops. You can hire again any time.');
        this.game.commit();
      }, { color: '#bdb3a3', dark: '#8f8678', size: 14, textColor: COLORS.ink });
      const problem = trainProblem(s, st);
      const cost = staffUpgradeCost(st);
      if (cost !== null && (!problem || problem.startsWith('Needs')))
        this.game.button(ctx, `train_${st.uid}`, W - 104, y + 6, 84, 34, `Train ${cost}`, () => {
          if (!trainStaff(s, st.uid)) return;
          sfx.upgrade();
          analytics.track('staff_train', { role: st.role, level: st.level });
          this.game.toast(`${st.name} is now Lv ${st.level}!`, '#a35bd6', ROLE[st.role].perk(st.level));
          this.game.commit();
        }, { color: '#a35bd6', dark: '#6f3a96', size: 12, disabled: !!problem });
      else if (problem) {
        ctx.font = font(9, 900);
        const words = problem.split(' ');
        const half = Math.ceil(words.length / 2);
        text(ctx, words.slice(0, half).join(' '), W - 62, y + 17, 9, '#7a5aa8', 'center', 900);
        text(ctx, words.slice(half).join(' '), W - 62, y + 30, 9, '#7a5aa8', 'center', 900);
      }
    });
    const free = slots(b) - staff.length;
    const yBtn = PANEL_Y + 80 + staff.length * 50;
    if (free > 0 && yBtn < H - 60) {
      const cost = hireCost(s, role);
      this.game.button(ctx, 'hire', W / 2 - 110, yBtn, 220, 48, cost === 0 ? `Hire ${ROLE[role].title} (free!)` : `Hire ${ROLE[role].title}  ${cost}`, () => {
        const st = hire(s, b.tile);
        if (!st) return;
        sfx.upgrade();
        analytics.track('staff_hire', { role, cost, staff: s.island.staff.length });
        this.game.toast(`${st.name} joined!`, COLORS.good, `${ROLE[role].title}: ${ROLE[role].perk(1)}`);
        this.game.commit();
      }, { color: COLORS.good, dark: '#2f7a3b', size: 15, disabled: s.coins < cost, pulse: staff.length === 0 });
    }
  }

  private upgradeBuilding(tile: number): boolean {
    const s = this.game.state;
    if (!upgradeBuilding(s, tile)) return false;
    const b = buildingAt(s, tile)!;
    sfx.upgrade();
    this.game.toast(`${BUILDINGS_BY_ID[b.id].name} Lv ${b.level}!`, '#3a8fd9', BUILDINGS_BY_ID[b.id].role ? 'One more staff slot' : b.id === 'warehouse' ? 'More storage' : 'Better trades');
    this.game.commit();
    return true;
  }
}
