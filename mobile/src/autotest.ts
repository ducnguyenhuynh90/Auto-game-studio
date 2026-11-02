// Autotest: the playtest bot (tools/bot.mjs, the same one the web playtest uses) plays the app natively.
// Started by a launch link, e.g. from CI's Android emulator or `npm run phone:test` over USB:
//   adb shell am start -a android.intent.action.VIEW -d "com.mamvillage.app://play?autotest=3"
// The game then runs in test mode (src/core/testmode.ts): its own save slot, no cloud sync, no analytics
// sent, so it never touches a player's progress. Results go to the log (adb logcat -s ReactNativeJS):
//   MAM_SHOT <name>      a moment worth a screenshot
//   MAM_AUTOTEST {json}  the report: what was played, frame rate, errors
//   MAM_AUTOTEST_DONE
import { installBot, runBot } from '../../tools/bot.mjs';

export interface FrameStats {
  frames: number[];
}

/** Turn test mode on before the game boots, when the launch link asks for it. */
export function wantsAutotest(params: URLSearchParams): number {
  const n = Number(params.get('autotest') ?? 0);
  if (n > 0) (globalThis as { __MAM_PHONE_TEST__?: boolean }).__MAM_PHONE_TEST__ = true;
  return n;
}

const errors: string[] = [];
function catchErrors(): void {
  const eu = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: Error, fatal?: boolean) => void; setGlobalHandler(h: (e: Error, fatal?: boolean) => void): void } }).ErrorUtils;
  if (eu) {
    const prev = eu.getGlobalHandler();
    eu.setGlobalHandler((e, fatal) => {
      errors.push(`${fatal ? 'FATAL ' : ''}${e?.message ?? e}`);
      prev(e, fatal);
    });
  }
  const ce = console.error.bind(console);
  console.error = (...a: unknown[]) => {
    errors.push(a.map(String).join(' ').slice(0, 300));
    ce(...a);
  };
}

function fpsOf(ms: number[]): { fps: number; p95FrameMs: number; worstFrameMs: number } | null {
  if (ms.length < 10) return null;
  const s = [...ms].sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  return { fps: Math.round(1000 / avg), p95FrameMs: Math.round(s[Math.floor(s.length * 0.95)]), worstFrameMs: Math.round(s[s.length - 1]) };
}

/** Plays `trips` fishing trips with the bot and logs the report. frameMs: the app's frame times. */
export async function runAutotest(trips: number, frameMs: number[], speed = 2): Promise<void> {
  catchErrors();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // the bot talks to a browser page; here the "page" is this JavaScript runtime
  const page = { evaluate: async (fn: (a: unknown) => unknown, arg?: unknown) => fn(arg), waitForTimeout: wait };
  await wait(4000); // let the first frames settle
  frameMs.length = 0;
  await wait(4000);
  const village = fpsOf(frameMs);
  const mam = (globalThis as unknown as { __mam: { game: { timeScale: number } } }).__mam;
  mam.game.timeScale = speed;
  await installBot(page, 0.75);
  frameMs.length = 0;
  let report: Record<string, unknown> = {};
  try {
    report = await runBot(page, { trips, timeoutMs: 25 * 60 * 1000, onShot: (name: string) => console.log(`MAM_SHOT ${name}`) });
  } catch (e) {
    errors.push(`bot: ${String((e as Error)?.message ?? e)}`);
  }
  const play = fpsOf(frameMs);
  const out = {
    counts: report.counts,
    gameSeconds: report.gameSeconds,
    coins: (report.state as { coins?: number } | undefined)?.coins,
    funnel: report.funnel,
    gpu: report.gpu,
    fps: { village, play },
    errors: [...new Set([...errors, ...((report.errors as string[]) ?? [])])].slice(0, 20),
  };
  console.log(`MAM_AUTOTEST ${JSON.stringify(out)}`);
  console.log('MAM_AUTOTEST_DONE');
}
