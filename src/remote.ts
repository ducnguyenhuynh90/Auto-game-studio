// Optional remote analytics sink for the claude.ai Artifact build: keeps one summary document per
// player at plays/<viewer id> in the artifact's own store (readable only by the owner).
// Outside an artifact viewer (local dev, other hosts) everything here is a silent no-op.
import { analytics } from './core/analytics';
import { applyEvent, emptySummary, type PlaySummary } from './core/playsummary';

const KEY = 'mam_summary';
const FLUSH_NOW = new Set(['funnel', 'trip_end', 'app_hidden', 'jar_open', 'upgrade']);

interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
}
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

let summary: PlaySummary;
let dirty = false;
let writing = false;
let ref: DocRef | null = null;
let disabled = false;

function persistLocal(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(summary));
  } catch {
    /* storage unavailable */
  }
}

async function flush(): Promise<void> {
  if (!ref || !dirty || writing || disabled) return;
  writing = true;
  dirty = false;
  try {
    await ref.set(summary as unknown as Record<string, unknown>);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'invalid_argument' || code === 'revoked' || code === 'not_granted' || code === 'quota_exceeded') disabled = true;
    else dirty = true; // transient: try again on the next trigger
  } finally {
    writing = false;
  }
}

/** Must run before the first analytics event so the summary sees the whole session. */
export function startPlaySummary(): void {
  try {
    const raw = localStorage.getItem(KEY);
    summary = raw ? (JSON.parse(raw) as PlaySummary) : emptySummary(analytics.iid, Date.now());
  } catch {
    summary = emptySummary(analytics.iid, Date.now());
  }
  analytics.onEvent((ev) => {
    applyEvent(summary, ev);
    dirty = true;
    persistLocal();
    if (FLUSH_NOW.has(ev.e)) void flush();
  });
  setInterval(() => void flush(), 20000);
  void connect();
}

async function connect(): Promise<void> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!host?.use) return;
  try {
    const [db, user] = (await Promise.all([host.use('db'), host.use('user')])) as [
      { doc(path: string): DocRef } | null,
      { id(): Promise<string | null> } | null,
    ];
    const id = await user?.id();
    if (!db || !id) return;
    ref = db.doc(`plays/${id}`);
    void flush();
  } catch {
    /* no store in this view: local summary only */
  }
}

export function currentSummary(): PlaySummary {
  return summary;
}
