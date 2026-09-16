import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative } from "node:path";
import type { FileMetric } from "../shared/files";

type CachedMetric = { fingerprint: string; metric: FileMetric };
export type FileMetricCache = Map<string, CachedMetric>;
const FILE_LIMIT = 16 * 1024 * 1024;
const SCAN_LIMIT = 256 * 1024 * 1024;

/** Physical lines, including comments and blank lines. Read bounded chunks with
 * eight workers; cache only complete results against filesystem fingerprints. */
export async function measureFiles(root: string, files: string[], cache: FileMetricCache,
  limits = { bytes: SCAN_LIMIT, milliseconds: 10_000 }) {
  const metrics: Record<string, FileMetric> = Object.create(null);
  const deadline = performance.now() + limits.milliseconds;
  let next = 0, reserved = 0;
  const measure = async (file: string, buffer: Buffer): Promise<FileMetric> => {
    if (performance.now() > deadline) return { loc: null, status: "deferred" };
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const path = await realpath(join(root, file)), rel = relative(root, path);
      if (rel === ".." || rel.startsWith("../")) return { loc: null, status: "unavailable" };
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = await handle.stat();
      if (!stat.isFile()) return { loc: null, status: "unavailable" };
      const fingerprint = `${path}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      const previous = cache.get(file);
      if (previous?.fingerprint === fingerprint) return previous.metric;
      const save = (metric: FileMetric) => { cache.set(file, { fingerprint, metric }); return metric; };
      if (stat.size > FILE_LIMIT) return save({ loc: null, status: "too-large" });
      if (reserved + stat.size > limits.bytes) return { loc: null, status: "deferred" };
      reserved += stat.size;
      let read = 0, breaks = 0, last = -1;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      while (read < stat.size) {
        if (performance.now() > deadline) return { loc: null, status: "deferred" };
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, stat.size - read), read);
        if (!bytesRead) return { loc: null, status: "unavailable" };
        const chunk = buffer.subarray(0, bytesRead);
        if (chunk.includes(0)) return save({ loc: null, status: "binary" });
        try { decoder.decode(chunk, { stream: true }); }
        catch { return save({ loc: null, status: "binary" }); }
        for (const byte of chunk) {
          if (byte === 13 || byte === 10 && last !== 13) breaks++;
          last = byte;
        }
        read += bytesRead;
      }
      try { decoder.decode(); } catch { return save({ loc: null, status: "binary" }); }
      const after = await handle.stat();
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs)
        return { loc: null, status: "unavailable" };
      return save({ loc: breaks + (last !== -1 && last !== 10 && last !== 13 ? 1 : 0), status: "counted" });
    } catch { return { loc: null, status: "unavailable" }; }
    finally { await handle?.close(); }
  };
  await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    while (next < files.length) {
      const file = files[next++];
      metrics[file] = await measure(file, buffer);
    }
  }));
  const present = new Set(files);
  for (const file of cache.keys()) if (!present.has(file)) cache.delete(file);
  return metrics;
}
