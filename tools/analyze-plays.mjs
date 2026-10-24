// Turns per-player summaries (plays/<id> docs exported with ArtifactData list + out_dir) into
// funnel and retention numbers. usage: node tools/analyze-plays.mjs <dir containing plays/*.json>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Export layout (ArtifactData list with out_dir): plays/<uid>.json (index or legacy summary) and
// plays/<uid>/devices/<iid>.json (one summary per device). Devices are merged into one player.
const dir = process.argv[2];
const read = (f) => {
  const raw = JSON.parse(readFileSync(f, 'utf8'));
  return raw.data ?? raw;
};
const players = new Map();
for (const f of readdirSync(join(dir, 'plays'))) {
  const path = join(dir, 'plays', f);
  if (f.endsWith('.json')) {
    const d = read(path);
    if (d.v === 1) players.set(f.replace('.json', '') + ':legacy', [d]); // pre-2.2 flat summary
  } else {
    const devDir = join(path, 'devices');
    try {
      players.set(f, readdirSync(devDir).filter((x) => x.endsWith('.json')).map((x) => read(join(devDir, x))));
    } catch {
      /* index only */
    }
  }
}
// drop legacy docs for players that now have device docs
for (const k of [...players.keys()]) if (k.endsWith(':legacy') && players.has(k.replace(':legacy', ''))) players.delete(k);
const sumMap = (ms) => ms.reduce((acc, m) => {
  for (const [k, v] of Object.entries(m ?? {})) acc[k] = (acc[k] ?? 0) + v;
  return acc;
}, {});
const docs = [...players.values()].map((devs) => {
  const last = [...devs].sort((a, b) => b.lastSeen - a.lastSeen)[0];
  const funnel = {};
  for (const d of devs) for (const [k, v] of Object.entries(d.funnel ?? {})) funnel[k] = Math.min(funnel[k] ?? Infinity, v);
  return {
    sessions: devs.flatMap((d) => d.sessions ?? []).sort((a, b) => a - b),
    funnel,
    counts: sumMap(devs.map((d) => d.counts)),
    lost: sumMap(devs.map((d) => d.lost)),
    screens: sumMap(devs.map((d) => d.screens)),
    perfect: devs.reduce((a, d) => a + (d.perfect ?? 0), 0),
    activeSec: devs.reduce((a, d) => a + (d.activeSec ?? 0), 0),
    seas: [...new Set(devs.flatMap((d) => d.seas ?? []))],
    lastScreen: last.lastScreen,
    lastError: devs.map((d) => d.lastError).find(Boolean),
    devices: devs.length,
  };
});
const n = docs.length;
const pct = (k) => `${k}/${n} (${n ? Math.round((k / n) * 100) : 0}%)`;
const steps = ['first_launch', 'first_cast', 'first_bite', 'first_catch', 'first_seal', 'second_trip_start', 'first_reveal', 'first_sale', 'first_upgrade', 'third_trip_start', 'first_reef_trip'];
console.log(`players: ${n} (devices: ${docs.reduce((a, d) => a + d.devices, 0)})`);
console.log('\nFUNNEL (reached / median seconds from first launch)');
for (const s of steps) {
  const secs = docs.map((d) => d.funnel?.[s]).filter((v) => v !== undefined).sort((a, b) => a - b);
  console.log(`  ${s.padEnd(18)} ${pct(secs.length).padEnd(14)} median ${secs.length ? secs[Math.floor(secs.length / 2)] : '-'}s`);
}
const DAY = 86400000;
const now = Date.now();
const ret = (d0, d1) => {
  const eligible = docs.filter((d) => now - d.sessions[0] >= d1 * DAY);
  const kept = eligible.filter((d) => d.sessions.some((t) => t - d.sessions[0] >= d0 * DAY && t - d.sessions[0] < d1 * DAY));
  return `${kept.length}/${eligible.length}` + (eligible.length ? ` (${Math.round((kept.length / eligible.length) * 100)}%)` : '');
};
console.log('\nRETENTION (returned in window after first session / players old enough)');
console.log(`  D1  ${ret(1, 2)}   D7  ${ret(7, 8)}   D30 ${ret(30, 31)}`);
const sum = (f) => docs.reduce((a, d) => a + (f(d) ?? 0), 0);
console.log('\nBEHAVIOUR');
console.log(`  median active minutes: ${docs.map((d) => d.activeSec / 60).sort((a, b) => a - b)[Math.floor(n / 2)]?.toFixed(1) ?? '-'}`);
console.log(`  sessions/player: ${(sum((d) => d.sessions.length) / Math.max(1, n)).toFixed(1)}`);
const hooks = sum((d) => d.counts?.hook);
const lost = {};
for (const d of docs) for (const [k, v] of Object.entries(d.lost ?? {})) lost[k] = (lost[k] ?? 0) + v;
console.log(`  casts ${sum((d) => d.counts?.cast)} · hooks ${hooks} · catches ${sum((d) => d.counts?.catch)} · perfect ${sum((d) => d.perfect)}`);
console.log(`  losses by reason: ${JSON.stringify(lost)}`);
console.log(`  opened Fishdex at least once: ${pct(docs.filter((d) => (d.screens?.dex ?? 0) > 0).length)}`);
const lastScreens = {};
for (const d of docs) lastScreens[d.lastScreen || '?'] = (lastScreens[d.lastScreen || '?'] ?? 0) + 1;
console.log(`  last screen when leaving: ${JSON.stringify(lastScreens)}`);
console.log(`  players with JS errors: ${pct(docs.filter((d) => (d.counts?.js_error ?? 0) > 0).length)}  ${docs.map((d) => d.lastError).filter(Boolean).slice(0, 3).join(' | ')}`);
const seaReach = {};
for (const d of docs) for (const x of d.seas ?? []) seaReach[x] = (seaReach[x] ?? 0) + 1;
console.log(`  seas fished: ${JSON.stringify(seaReach)} · missions/player: ${(sum((d) => d.counts?.mission_complete) / Math.max(1, n)).toFixed(1)} · tangles: ${sum((d) => d.lost?.tangled)} of ${sum((d) => d.counts?.cast)} casts`);
console.log(`  stored instead of selling the first bottle: ${pct(docs.filter((d) => (d.counts?.keep_product ?? 0) > 0 && d.funnel?.first_sale === undefined).length)}`);
