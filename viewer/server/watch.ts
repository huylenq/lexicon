import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

type Subscriber = (paths: string[]) => void;

interface Entry {
  watcher: FSWatcher;
  subs: Set<Subscriber>;
  pending: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, Entry>();
const DEBOUNCE_MS = 200;

export function subscribe(projectRoot: string, fn: Subscriber): () => void {
  let entry = entries.get(projectRoot);
  if (!entry) {
    const lexiconDir = join(projectRoot, "lexicon");
    const created: Entry = {
      watcher: undefined as unknown as FSWatcher,
      subs: new Set(),
      pending: new Set(),
      timer: null,
    };
    const fire = () => {
      const paths = [...created.pending];
      created.pending.clear();
      created.timer = null;
      for (const s of created.subs) {
        try { s(paths); } catch (e) { console.error("[watch] subscriber threw", e); }
      }
    };
    // macOS recursive watch on directories is supported but flaky for deep
    // trees; lexicon/ is shallow (one level of contexts/decisions/surfaces),
    // so recursive is fine here.
    created.watcher = watch(lexiconDir, { recursive: true }, (_event, filename) => {
      if (typeof filename === "string" && filename) created.pending.add(filename);
      if (created.timer) clearTimeout(created.timer);
      created.timer = setTimeout(fire, DEBOUNCE_MS);
    });
    created.watcher.on("error", err => {
      console.error(`[watch] ${lexiconDir}:`, err.message);
    });
    entries.set(projectRoot, created);
    entry = created;
  }
  entry.subs.add(fn);
  return () => {
    const e = entries.get(projectRoot);
    if (!e) return;
    e.subs.delete(fn);
    if (e.subs.size === 0) {
      e.watcher.close();
      if (e.timer) clearTimeout(e.timer);
      entries.delete(projectRoot);
    }
  };
}
