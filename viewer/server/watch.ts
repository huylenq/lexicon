import { watch } from "node:fs";
import { join } from "node:path";

type Subscriber = (paths: string[]) => void;

interface Entry {
  subs: Set<Subscriber>;
  dispose: () => void;
}

const entries = new Map<string, Entry>();
const DEBOUNCE_MS = 200;

export function subscribe(projectRoot: string, fn: Subscriber): () => void {
  let entry = entries.get(projectRoot);
  if (!entry) {
    const lexiconDir = join(projectRoot, "lexicon");
    const subs = new Set<Subscriber>();
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fire = () => {
      const paths = [...pending];
      pending.clear();
      timer = null;
      for (const s of subs) {
        try { s(paths); }
        catch (e) { console.error("[watch] subscriber threw", e); }
      }
    };

    // macOS recursive watch on directories is supported but flaky for deep
    // trees; lexicon/ is shallow (one level of contexts/decisions/surfaces),
    // so recursive is fine here.
    const watcher = watch(lexiconDir, { recursive: true }, (_event, filename) => {
      if (typeof filename === "string" && filename) pending.add(filename);
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, DEBOUNCE_MS);
    });
    watcher.on("error", err => console.error(`[watch] ${lexiconDir}:`, err.message));

    entry = {
      subs,
      dispose: () => {
        watcher.close();
        if (timer) clearTimeout(timer);
      },
    };
    entries.set(projectRoot, entry);
  }
  entry.subs.add(fn);
  return () => {
    const e = entries.get(projectRoot);
    if (!e) return;
    e.subs.delete(fn);
    if (e.subs.size === 0) {
      e.dispose();
      entries.delete(projectRoot);
    }
  };
}
