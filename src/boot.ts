// Starts the game on any platform. The browser (main.ts) and the native app (mobile/, React Native) each
// make their drawing surfaces and input, then call bootGame(): everything here is the same on both, so
// the app behaves exactly like the web game.
import { analytics } from './core/analytics';
import { loadFromBlob, loadState, resetSave, saveState } from './core/save';
import { AccountManager } from './auth/account';
import { Game } from './game';
import { helpRoutes } from './scenes/info';
import { MarketOverlay } from './scenes/market';
import { ProductionOverlay } from './scenes/production';
import { RoadOverlay } from './scenes/career';
import { BrandOverlay } from './scenes/brand';
import { MissionsOverlay } from './scenes/missions';
import { DogOverlay } from './scenes/dog';
import { World } from './render3d/world';
import { FpsGovernor, detectQuality, loadAutoQuality, loadQualitySetting, saveAutoQuality, saveQualitySetting, type Quality, type QualitySetting } from './render3d/quality';
import { characterPortrait, fishIcon, stagePreview } from './render3d/icons';
import type { Track } from './core/evolution';
import type { CharacterId } from './core/story';
import { setFishIconProvider, setIslandArtProvider, setPortraitProvider, setStageProvider } from './render/draw';
import { FishingScene } from './scenes/fishing';
import { VillageScene } from './scenes/village';
import { MapScene } from './scenes/map';
import { IslandScene } from './scenes/island';
import { PuzzleHubOverlay } from './scenes/puzzles';
import { FISHING_LEVELS } from './core/puzzles';
import { SCENES } from './core/story';
import { SortGameOverlay } from './scenes/sort';
import { StoryOverlay } from './scenes/story';
import { captureInvite, checkSocial } from './scenes/friends';
import { smartHint } from './core/sort';
import { catchUp } from './core/island';
import { agingLevel, canFerment, upgradeCost } from './core/state';
import { UPGRADES } from './core/data';
import { SEAS, SEAS_BY_ID, seaComplete, seaLock } from './core/seas';
import { isPhoneTest } from './core/testmode';
import { platform } from './platform';

export interface BootOptions {
  /** Makes the 3D world layer (null: no 3D, the UI still works). */
  makeWorld(quality: Quality): World | null;
  /** Lay the layers out again (after a graphics quality change). */
  relayout(): void;
  /** ?reset, ?seed, ?speed, ?quality, ?invite=... (empty in the app, except an invite link) */
  params?: URLSearchParams;
  /** Google Analytics for this platform, when the build has it (loaded after start). */
  loadGa?: () => Promise<Game['ga'] & { setPropsProvider?(fn: () => Record<string, string | number | boolean>): void } | null>;
}

export interface Booted {
  game: Game;
  /** Island staff caught up for the time the game was closed or in the background. */
  welcomeBack(): void;
  /** One frame: rules + 3D world (draw3d false: rules only, the 3D layer keeps its last picture).
   * The host then draws the UI layer with game.draw(ctx). */
  tick(dt: number, draw3d?: boolean): void;
}

export function bootGame(opts: BootOptions): Booted {
  const params = opts.params ?? new URLSearchParams();
  // Phone test mode (tools/phone-test.mjs): a fresh village in its own save slot, no cloud sync, no
  // analytics sent (core/testmode.ts), so testing on your own phone never touches your real progress.
  const phoneTest = isPhoneTest();
  if (params.has('reset') || phoneTest) resetSave();

  const seed = Number(params.get('seed') ?? Date.now() % 1e9);
  const game = new Game(seed);
  // Graphics quality: a manual choice wins; else a remembered auto result; else device hints.
  const qualitySetting = (params.get('quality') as QualitySetting | null) ?? loadQualitySetting();
  const startQuality: Quality = qualitySetting !== 'auto' ? qualitySetting : (loadAutoQuality() ?? detectQuality());
  game.world = opts.makeWorld(startQuality);
  if (game.world) game.particles.scale = game.world.particleScale;
  game.setQuality = (q) => {
    saveQualitySetting(q);
    const tier = q === 'auto' ? (loadAutoQuality() ?? detectQuality()) : q;
    game.world?.applyQuality(tier);
    game.particles.scale = game.world?.particleScale ?? 1;
    opts.relayout();
    analytics.track('quality', { setting: q, tier });
  };
  // Step down automatically when the device can't keep ~40 fps (only in auto mode).
  const governor = new FpsGovernor(() => {
    const w = game.world;
    if (!w || loadQualitySetting() !== 'auto' || w.quality === 'low') return false;
    const next: Quality = w.quality === 'high' ? 'medium' : 'low';
    w.applyQuality(next);
    game.particles.scale = w.particleScale;
    saveAutoQuality(next);
    opts.relayout();
    analytics.track('quality_auto_down', { to: next });
    return true;
  });
  setFishIconProvider(fishIcon);
  setPortraitProvider((id) => characterPortrait(id as CharacterId));
  setStageProvider((track, level) => stagePreview(track as Track, level));
  setIslandArtProvider((kind, id, level) => stagePreview(kind, kind === 'worker' ? 0 : level, id));
  if (params.has('speed')) game.timeScale = Number(params.get('speed'));

  game.goVillage = () => game.setScene(new VillageScene(game));
  // where the ⓘ cards' buttons go (scenes/info.ts)
  Object.assign(helpRoutes, {
    market: (g: Game) => g.push(new MarketOverlay(g)),
    production: (g: Game) => g.push(new ProductionOverlay(g)),
    island: (g: Game) => g.goIsland(),
    road: (g: Game) => g.push(new RoadOverlay(g)),
    puzzles: (g: Game) => g.goPuzzles(),
    fish: (g: Game) => g.goFishing(g.state.sea),
    map: (g: Game) => g.goMap(),
    brand: (g: Game) => g.push(new BrandOverlay(g)),
    missions: (g: Game) => g.push(new MissionsOverlay(g)),
    dog: (g: Game) => g.push(new DogOverlay(g)),
  });
  game.goMap = () => game.setScene(new MapScene(game));
  game.goIsland = (tile) => game.setScene(new IslandScene(game, tile));
  game.goPuzzles = () => {
    game.goIsland();
    game.push(new PuzzleHubOverlay(game));
  };
  game.goFishingPuzzle = (i) => game.setScene(new FishingScene(game, FISHING_LEVELS[i].sea, i));
  // Island staff caught up for the time the game was closed or in the background (capped, see core/island.ts).
  const welcomeBack = (): void => {
    const away = catchUp(game.state, game.rng, Date.now());
    if (away.fish + away.salt + away.jars + away.bottles + away.tourists > 0) {
      game.toast('While you were away…', '#3a8fd9', `Staff: +${away.fish} fish, +${away.salt} salt, ${away.jars} jars, ${away.tourists} tourists, +${away.coins} coins`);
      analytics.track('island_offline', { fish: away.fish, salt: away.salt, jars: away.jars, bottles: away.bottles, coins: away.coins, tourists: away.tourists });
      saveState(game.state);
    }
  };
  welcomeBack();
  game.goFishing = (sea) => {
    game.state.sea = sea;
    game.setScene(new FishingScene(game, sea));
  };
  // A save from before the sea chart may point at a sea whose story is now locked.
  if (seaLock(game.state, SEAS_BY_ID[game.state.sea])) game.state.sea = 'lagoon';
  game.goVillage();

  // Google Analytics 4 on builds with a Measurement ID (docs/ANALYTICS.md).
  if (opts.loadGa && !phoneTest)
    void opts.loadGa().then((ga) => {
      if (!ga) return;
      game.ga = ga;
    });

  // Accounts: claude.ai identity inside the playtest page, social login on configured builds.
  game.account = new AccountManager({
    getState: () => game.state,
    replaceState: (s) => {
      game.state = loadFromBlob(s);
      saveState(game.state);
      game.goVillage();
    },
    toast: (msg, sub) => game.toast(msg, '#3a8fd9', sub),
    resetLocal: () => {
      resetSave();
      game.state = loadState();
      game.goVillage();
    },
  });
  // an invite link (?invite=CODE) is redeemed once the account is ready
  captureInvite('?' + params.toString());
  if (!phoneTest)
    void game.account.init().then(() => {
      if (game.account?.conflict) game.toast('Two saves found', '#a35bd6', 'Open Settings (≡) to choose one');
      void checkSocial(game);
    });

  analytics.funnelStep('first_launch');
  analytics.track('session_start', { trips: game.state.stats.trips, coins: game.state.coins, returning: game.state.stats.catches > 0, platform: platform.name });

  // Test / QA hook (harmless in production: exposes nothing sensitive).
  (globalThis as unknown as Record<string, unknown>).__mam = {
    game,
    analytics,
    rules: { upgradeCost, UPGRADES, SEAS, seaLock, seaComplete, canFerment, agingLevel, sortHint: smartHint },
    // store capture + QA: replay a story scene (never marks it seen), open a Market Sort level
    story: (id: string) => game.push(new StoryOverlay(game, SCENES.filter((x) => x.id === id), true)),
    sort: (level: number) => game.push(new SortGameOverlay(game, level)),
  };

  // time since the 3D layer was last drawn (the app skips it on frames the GPU is still busy)
  let since3d = 0;
  let skipped = 0;
  return {
    game,
    welcomeBack,
    tick(dt: number, draw3d = true) {
      game.update(dt);
      since3d += dt;
      if (!draw3d) {
        skipped++;
        return;
      }
      // the governor judges the 3D layer's frame rate: a smooth UI over a 15 fps world still needs a lower tier
      governor.frame(since3d);
      game.world?.render(game, Math.min(skipped ? 0.1 : 0.05, since3d) * game.timeScale);
      since3d = 0;
      skipped = 0;
    },
  };
}
